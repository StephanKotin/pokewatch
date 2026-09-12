import Phaser from 'phaser';
import { TILE, generateTileset, SHEET_SRC, SHEET_PATH } from '../art/tiles.js';
import { preloadSheets } from '../art/sheets.js';
import { colorFor, generateCharacter } from '../art/textures.js';
import { generateFont, pixelLabel, wrapText } from '../art/font.js';
import { TileMap } from '../engine/tilemap.js';
import { Player } from '../engine/player.js';
import { AgentNpc } from '../agents/AgentNpc.js';
import { getMap, START } from '../maps/index.js';
import { fetchRoster, connectFeed, ownerOf, OPERATOR } from '../net/feed.js';
import { openDispatchDialog } from '../ui/DispatchDialog.js';

/** GBA screen. Everything is sized from this. */
export const VIEW_W = 240;
export const VIEW_H = 160;

/**
 * A building you walk around, GBA-style.
 *
 * The camera shows one 240x160 screenful and follows the player, so rooms are
 * discovered rather than surveyed. You talk to an agent by standing next to it
 * and facing it — agents occupy and block their tile, exactly like every
 * Pokémon NPC, which is what makes "face it to talk to it" work.
 *
 * Agents still stand in the room matching the part of the repo they are working
 * in (see bridge/zones.js), so their position remains information. The
 * difference from the old overview map is that they now walk through doorways
 * to get there.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
    this.agents = new Map();
    this.sessionOwner = new Map();
    this.liveDispatch = new Map();
    this.lastSubagent = new Map();
    this.zoneOccupancy = new Map();
    this.currentMapId = null;
  }

  preload() {
    this.load.spritesheet(SHEET_SRC, SHEET_PATH, { frameWidth: TILE, frameHeight: TILE });
    // Goes through the manifest so the 1px spacing is applied; see art/sheets.js.
    preloadSheets(this, ['rl']);
  }

  async create() {
    generateTileset(this);
    generateFont(this);

    this.textBox = this.game.registry.get('textBox');

    let roster = [];
    try {
      const data = await fetchRoster();
      roster = data.agents ?? [];
      this.rosterByName = new Map(roster.map((a) => [a.name, a]));
    } catch (err) {
      this.showError(`Bridge unreachable — is \`npm run dev:bridge\` running?\n${err.message}`);
      return;
    }
    this.roster = roster;

    // Characters must exist before any NPC or the player is constructed.
    generateCharacter(this, 'player', 0xe8e8f0);
    roster.forEach((a, i) => generateCharacter(this, a.name, colorFor(a.name, i)));
    generateCharacter(this, OPERATOR, colorFor(OPERATOR, roster.length));

    this.buildAgents(roster);
    this.loadMap(START.map, START.x, START.y, START.facing);
    this.bindInput();

    connectFeed({
      onEvent: (event) => {
        this.handleEvent(event);
        this.game.events.emit('world:event', event);
      },
      onStatus: (status) => this.game.events.emit('bridge:status', status),
    });
  }

  /* ------------------------------------------------------------------ *
   * Maps
   * ------------------------------------------------------------------ */

  loadMap(mapId, tx, ty, facing) {
    const def = getMap(mapId);
    if (!def) return;

    this.map?.destroy();
    this.currentMapId = mapId;
    this.map = new TileMap(this, def);
    this.map.draw();

    if (!this.player) {
      this.player = new Player(this, { tx, ty, facing, map: this.map });
    } else {
      this.player.setMap(this.map, tx, ty, facing);
    }

    // Only this department's agents are present in this building.
    this.seatAgents(def);

    this.cameras.main.setBounds(0, 0, this.map.pixelWidth, this.map.pixelHeight);
    this.cameras.main.startFollow(this.player.sprite, true, 0.18, 0.18);
    // Small maps that don't fill the viewport should centre, not sit in a corner.
    this.cameras.main.setBackgroundColor('#101018');

    this.game.events.emit('world:map', { id: mapId, name: def.name });
  }

  buildAgents(roster) {
    const all = [...roster.map((a) => a.name), OPERATOR];
    all.forEach((name, i) => {
      const npc = new AgentNpc(this, {
        name,
        color: colorFor(name, i),
        tx: 0,
        ty: 0,
        map: null,
        entry: this.rosterByName?.get(name) ?? null,
      });
      npc.setVisible(false);
      this.agents.set(name, npc);
    });
  }

  /** Place the agents that belong to this map, hide the rest. */
  seatAgents(def) {
    const homes = def.home ?? [];
    const present = def.department === 'engineering' ? [...this.agents.keys()] : [];

    let slot = 0;
    for (const [name, npc] of this.agents) {
      if (!present.includes(name) || !homes[slot]) {
        npc.setVisible(false);
        npc.map = null;
        continue;
      }
      const home = homes[slot];
      slot += 1;
      npc.placeOn(this.map, home.tx ?? home.x, home.ty ?? home.y);
      npc.setVisible(true);
    }
    this.zoneOccupancy.clear();
    this.layoutNameplates();
  }

  /**
   * Nameplates are wider than the tile the agent stands on — "release-guard"
   * is four tiles of text over one tile of agent — so neighbouring agents
   * would print over each other and neither name would be readable. Bump the
   * collisions down a row instead, so every name stays whole.
   */
  layoutNameplates() {
    const visible = [...this.agents.values()]
      .filter((npc) => npc.sprite.visible)
      .sort((a, b) => a.nameplate.x - b.nameplate.x);

    const rowEnd = [];
    for (const npc of visible) {
      const half = npc.nameplate.textWidth / 2;
      const left = npc.nameplate.x - half;
      let row = 0;
      while (rowEnd[row] !== undefined && left < rowEnd[row]) row += 1;
      rowEnd[row] = npc.nameplate.x + half + 2;
      npc.setNameplateRow(row);
    }
  }

  /** Agents block their tile, so you must face them to interact. */
  isOccupied(tx, ty) {
    for (const npc of this.agents.values()) {
      if (npc.map === this.map && npc.sprite.visible && npc.tx === tx && npc.ty === ty) return true;
    }
    return false;
  }

  agentAt(tx, ty) {
    for (const npc of this.agents.values()) {
      if (npc.map === this.map && npc.sprite.visible && npc.tx === tx && npc.ty === ty) return npc;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */

  bindInput() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
      act: 'Z', act2: 'SPACE', act3: 'ENTER',
      cancel: 'X', esc: 'ESC',
    });

    // The A button is edge-triggered; holding it must not spam the textbox.
    for (const key of ['act', 'act2', 'act3']) {
      this.keys[key].on('down', () => this.pressA());
    }
    for (const key of ['cancel', 'esc']) {
      this.keys[key].on('down', () => this.pressB());
    }

    // Arrow keys drive the choice cursor while a textbox is open.
    this.keys.up.on('down', () => this.textBox?.open && this.textBox.moveChoice(-1));
    this.keys.down.on('down', () => this.textBox?.open && this.textBox.moveChoice(1));

    // Stop the page scrolling out from under the game.
    kb.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'Z', 'X', 'ENTER']);
  }

  update() {
    if (!this.player || this.textBox?.open) return;
    // A DOM dialog has focus; the world must not move underneath it.
    if (document.querySelector('.dialog-backdrop')) return;

    const k = this.keys;
    let dir = null;
    if (k.up.isDown || k.w.isDown) dir = 'up';
    else if (k.down.isDown || k.s.isDown) dir = 'down';
    else if (k.left.isDown || k.a.isDown) dir = 'left';
    else if (k.right.isDown || k.d.isDown) dir = 'right';
    if (!dir) return;

    this.player.tryMove(dir, {
      onArrive: (tx, ty) => {
        const warp = this.map.warpAt(tx, ty);
        if (warp) this.loadMap(warp.to, warp.tx, warp.ty, warp.facing);
      },
    });
  }

  pressA() {
    if (this.textBox?.advance()) return;
    if (document.querySelector('.dialog-backdrop')) return;
    if (!this.player) return;

    const { tx, ty } = this.player.facingTile();

    const npc = this.agentAt(tx, ty);
    if (npc) {
      npc.facePlayer(this.player.tx, this.player.ty);
      this.talkToAgent(npc);
      return;
    }

    const sign = this.map.signAt(tx, ty);
    if (sign) {
      this.textBox.show(sign.text.split('\n\n'), {});
      return;
    }

    // A door you are facing rather than standing on.
    const warp = this.map.warpAt(tx, ty);
    if (warp) {
      const dest = getMap(warp.to);
      this.textBox.show(`${dest?.name ?? warp.to} — step onto the door to enter.`, {});
    }
  }

  pressB() {
    if (this.textBox?.open) this.textBox.hide();
  }

  /* ------------------------------------------------------------------ *
   * Talking to agents
   * ------------------------------------------------------------------ */

  talkToAgent(npc) {
    if (npc.name === OPERATOR) {
      this.textBox.show(
        ["That's you — or rather, your own Claude Code sessions. I go wherever you're working."],
        { name: 'OPERATOR' },
      );
      return;
    }

    const entry = this.rosterByName?.get(npc.name);
    const live = this.liveDispatch.get(npc.name);

    if (live) {
      this.textBox.show([`I'm working on something right now.`], {
        name: npc.name.toUpperCase(),
        choices: [
          { label: 'Watch in the panel', value: 'watch', onSelect: () => this.focusPanel(npc.name) },
          { label: 'Stop it', value: 'stop', onSelect: () => openDispatchDialog(entry, this, live) },
          { label: 'Leave it', value: null },
        ],
      });
      return;
    }

    const firstSentence = (entry?.description ?? '').split(/(?<=\.)\s/)[0];
    this.textBox.show([firstSentence || `I'm ${npc.name}.`], {
      name: npc.name.toUpperCase(),
      choices: [
        {
          label: 'Give me a task',
          value: 'dispatch',
          onSelect: () => entry && openDispatchDialog(entry, this, null),
        },
        { label: 'Show your last result', value: 'panel', onSelect: () => this.focusPanel(npc.name) },
        { label: 'Never mind', value: null },
      ],
    });
  }

  focusPanel(name) {
    this.game.events.emit('world:focus-agent', name);
  }

  /* ------------------------------------------------------------------ *
   * Bridge events
   * ------------------------------------------------------------------ */

  claimSession(sessionId, agent) {
    this.sessionOwner.set(sessionId, agent);
    this.liveDispatch.set(agent, sessionId);
  }

  /** Move an agent into the room bound to a repo zone. */
  sendToZone(npc, zoneId) {
    if (!zoneId || npc.zone === zoneId || npc.map !== this.map) return;

    const spots = this.map.spotsForZone(zoneId);
    if (!spots?.length) return;

    if (npc.zone) {
      this.zoneOccupancy.set(npc.zone, Math.max(0, (this.zoneOccupancy.get(npc.zone) ?? 1) - 1));
    }
    const slot = (this.zoneOccupancy.get(zoneId) ?? 0) % spots.length;
    this.zoneOccupancy.set(zoneId, slot + 1);

    npc.zone = zoneId;
    npc.walkTo(
      { tx: spots[slot].x, ty: spots[slot].y },
      (x, y) => this.isOccupied(x, y) || (this.player.tx === x && this.player.ty === y),
    );
  }

  handleEvent(event) {
    const npcFor = (name) => this.agents.get(name);

    if (event.kind === 'dispatch_start') {
      this.claimSession(event.sessionId, event.agent);
      npcFor(event.agent)?.setBusy(true);
      return;
    }

    if (event.kind === 'dispatch_result') {
      if (this.liveDispatch.get(event.agent) === event.sessionId) {
        this.liveDispatch.delete(event.agent);
      }
      const npc = npcFor(event.agent);
      npc?.setBusy(false);
      npc.zone = null;
      // Head back to your desk once the work is done.
      this.time.delayedCall(2500, () => {
        if (npc && !this.liveDispatch.get(event.agent) && npc.map === this.map) {
          npc.walkTo(npc.homeTile, (x, y) => this.isOccupied(x, y));
        }
      });
      return;
    }

    const owner = this.sessionOwner.get(event.sessionId) ?? ownerOf(event);
    const npc = npcFor(owner) ?? npcFor(OPERATOR);
    if (!npc) return;

    if (event.kind === 'task_spawn') {
      this.lastSubagent.set(event.sessionId, event.subagentType ?? 'task');
      npc.setBusy(true);
      return;
    }

    if (event.kind === 'tool_use') {
      npc.setBusy(true);
      // zone === null means the event implies no location; leave them put.
      if (event.zone) this.sendToZone(npc, event.zone);
    }
  }

  showError(message) {
    const label = pixelLabel(this, VIEW_W / 2, VIEW_H / 2, wrapText(message, VIEW_W - 40), {
      color: 0xffb3bd,
      backing: 'plate',
      originY: 0.5,
      padX: 6,
      padY: 5,
      depth: 99999,
    });
    label.setScrollFactor(0);
  }
}

export default WorldScene;
