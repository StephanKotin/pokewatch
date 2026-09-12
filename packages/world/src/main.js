import './style.css';
import Phaser from 'phaser';
import { WorldScene, VIEW_W, VIEW_H } from './scenes/WorldScene.js';
import { SessionPanel } from './ui/SessionPanel.js';
import { TextBox } from './ui/TextBox.js';
import { fetchRoster } from './net/feed.js';
import { notifyResult, watchVisibility } from './ui/notify.js';

/** GBA is 240x160. Integer zoom only, or the pixels stop being pixels. */
const ZOOM = 4;

const screen = document.getElementById('screen');

// The textbox is chrome, not world, so it lives in the DOM over the canvas and
// is handed to the scene through the registry rather than built inside it.
const textBox = new TextBox(screen);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  zoom: ZOOM,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#101018',
  scene: [WorldScene],
});

game.registry.set('textBox', textBox);

const panel = new SessionPanel(document.getElementById('panel'));

fetchRoster()
  .then((data) => {
    panel.approveClearance = data.approveClearance ?? 'acceptEdits';
    panel.maxConcurrent = data.maxConcurrent ?? 3;
  })
  .catch(() => {});

panel.refresh();
watchVisibility();

game.events.on('world:event', (event) => {
  panel.onEvent(event);
  if (event.kind === 'dispatch_result') {
    notifyResult({
      agent: event.agent,
      status: event.stopped ? 'stopped' : event.ok ? 'ok' : 'error',
      phase: event.phase ?? 'run',
      summary: event.summary,
      changedFiles: event.changedFiles ?? 0,
    });
  }
});

// Talking to an agent can focus its latest session in the panel.
game.events.on('world:focus-agent', (name) => {
  const match = panel.sessions.find((s) => s.agent === name);
  if (match) panel.select(match.sessionId);
});

// Where-am-I readout above the screen.
const place = document.getElementById('place');
game.events.on('world:map', ({ name }) => {
  place.textContent = name;
});

const status = document.getElementById('status');
game.events.on('bridge:status', (state) => {
  status.textContent = state === 'live' ? '● live' : '○ reconnecting';
  status.dataset.state = state;
});

// Local dev tool: expose internals for console poking and for tests.
window.__world = game;
window.__panel = panel;
window.__textBox = textBox;
