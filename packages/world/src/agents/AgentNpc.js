import { TILE } from '../art/tiles.js';
import { frameKey, registerAnimations } from '../art/textures.js';
import { pixelLabel, GLYPH_H } from '../art/font.js';
import { findPath } from '../engine/pathfind.js';

const STEP_MS = 150;
/** Vertical step when a nameplate is bumped onto a second row. */
const PLATE_ROW = GLYPH_H + 2;

/**
 * An agent as a walkable NPC.
 *
 * Replaces the old free-floating AgentSprite: in a real building an agent
 * occupies a tile, blocks it (so you have to face it to talk, like every
 * Pokémon NPC), and reaches other rooms by walking through doorways rather than
 * sliding through walls.
 */
export class AgentNpc {
  constructor(scene, { name, color, tx, ty, map, entry }) {
    this.scene = scene;
    this.name = name;
    this.color = color;
    this.entry = entry;
    this.map = map;
    this.tx = tx;
    this.ty = ty;
    this.homeTile = { tx, ty };
    this.facing = 'down';
    this.zone = null;
    this.busy = false;
    this.frame = 0;
    this.queue = [];

    registerAnimations(scene, name);

    this.sprite = scene.add
      .sprite(this.pixelX, this.pixelY, frameKey(name, 'down', 0))
      .setOrigin(0.5, 1)
      .setDepth(this.pixelY);

    /** Row this agent's nameplate sits on. See WorldScene.layoutNameplates. */
    this.nameplateRow = 0;
    this.nameplate = pixelLabel(scene, this.pixelX, this.pixelY + 2, name, {
      color: 0xfff6e0,
      depth: 20001,
    });

    // Status pip: the "working" tell, visible without reading anything.
    this.pip = scene.add
      .rectangle(this.pixelX, this.pixelY - TILE - 3, 4, 4, color)
      .setDepth(20001)
      .setVisible(false);
  }

  get pixelX() {
    return this.tx * TILE + TILE / 2;
  }

  get pixelY() {
    return this.ty * TILE + TILE;
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    this.nameplate.setVisible(v);
    this.pip.setVisible(v && this.busy);
  }

  /** Re-seat this NPC when the player enters a different map. */
  placeOn(map, tx, ty) {
    this.map = map;
    this.queue = [];
    this.tx = tx;
    this.ty = ty;
    this.homeTile = { tx, ty };
    this.sync();
  }

  sync() {
    this.sprite.setPosition(this.pixelX, this.pixelY).setDepth(this.pixelY);
    this.placeNameplate(this.pixelX, this.pixelY);
    this.pip.setPosition(this.pixelX, this.pixelY - TILE - 3);
  }

  /**
   * Whole pixels only: a nameplate on a half pixel is resampled by the 4x
   * upscale and goes soft again, and a walking agent lands on half pixels
   * constantly.
   */
  placeNameplate(x, y) {
    this.nameplate.setPosition(Math.round(x), Math.round(y) + 2 + this.nameplateRow * PLATE_ROW);
  }

  setNameplateRow(row) {
    if (row === this.nameplateRow) return;
    this.nameplateRow = row;
    this.placeNameplate(this.sprite.x, this.sprite.y);
  }

  setBusy(on) {
    this.busy = on;
    this.pip.setVisible(on && this.sprite.visible);
    if (on) {
      this.pipTween?.remove();
      this.pipTween = this.scene.tweens.add({
        targets: this.pip,
        alpha: 0.15,
        duration: 400,
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.pipTween?.remove();
      this.pip.setAlpha(1);
    }
  }

  /** Walk to a tile, routing through doorways. No-op if already there. */
  walkTo(target, isBlocked) {
    if (!target) return;
    if (this.tx === target.tx && this.ty === target.ty) return;

    const path = findPath(this.map, { tx: this.tx, ty: this.ty }, target, isBlocked);
    if (!path) return; // unreachable; stay put rather than teleport

    this.queue = path;
    if (!this.stepping) this.step();
  }

  step() {
    const next = this.queue.shift();
    if (!next) {
      this.stepping = false;
      this.sprite.setTexture(frameKey(this.name, this.poseFor(this.facing), 0));
      return;
    }

    this.stepping = true;
    const dx = next.tx - this.tx;
    const dy = next.ty - this.ty;
    this.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down';
    this.tx = next.tx;
    this.ty = next.ty;

    this.frame = this.frame === 1 ? 2 : 1;
    this.sprite.setTexture(frameKey(this.name, this.poseFor(this.facing), this.frame));
    this.sprite.setFlipX(this.facing === 'left');

    this.scene.tweens.add({
      targets: this.sprite,
      x: this.pixelX,
      y: this.pixelY,
      duration: STEP_MS,
      ease: 'Linear',
      onUpdate: () => {
        this.sprite.setDepth(this.sprite.y);
        this.placeNameplate(this.sprite.x, this.sprite.y);
        this.pip.setPosition(this.sprite.x, this.sprite.y - TILE - 3);
      },
      onComplete: () => {
        this.scene.layoutNameplates?.();
        this.step();
      },
    });
  }

  poseFor(facing) {
    if (facing === 'up') return 'up';
    if (facing === 'down') return 'down';
    return 'side';
  }

  /** Turn to look at the player when spoken to. */
  facePlayer(px, py) {
    const dx = px - this.tx;
    const dy = py - this.ty;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.sprite.setTexture(frameKey(this.name, this.poseFor(this.facing), 0));
    this.sprite.setFlipX(this.facing === 'left');
  }

  destroy() {
    this.pipTween?.remove();
    this.sprite.destroy();
    this.nameplate.destroy();
    this.pip.destroy();
  }
}

export default AgentNpc;
