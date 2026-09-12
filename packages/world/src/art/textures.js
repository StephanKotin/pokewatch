/**
 * Every pixel in this world is generated at boot — no binary assets, no
 * licensing, nothing to download.
 *
 * THIS IS THE SWAP POINT. When real spritesheets arrive, replace this file's
 * exports and nothing else changes: the rest of the codebase only ever refers
 * to texture *keys* (`tileKey`, `frameKey`), never to pixel data.
 */

export const TILE = 16;

/** Shared palette. 'x' is transparent. */
const BASE = {
  x: null,
  K: 0x1b1b29, // outline
  S: 0xe8b796, // skin
  H: 0x3b2f4a, // hair
  P: 0x2f3247, // trousers
  W: 0xf7f7ff, // eye / screen white
};

export const AGENT_COLORS = {
  backend: 0x4ade80,
  frontend: 0x38bdf8,
  verifier: 0xfbbf24,
  'release-guard': 0xfb7185,
  operator: 0xc084fc,
};

export const FALLBACK_COLORS = [0x4ade80, 0x38bdf8, 0xfbbf24, 0xfb7185, 0xc084fc, 0xf472b6];

export function colorFor(name, index = 0) {
  return AGENT_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/* ------------------------------------------------------------------ *
 * Character frames. 16x16, drawn as a character grid so a frame is
 * readable and editable as text rather than as drawing calls.
 * ------------------------------------------------------------------ */

const HEAD_DOWN = [
  '................',
  '.....KKKKKK.....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '....KSSSSSSK....',
  '....KSWSSWSK....',
  '....KSSSSSSK....',
  '.....KSSSSK.....',
];

const HEAD_UP = [
  '................',
  '.....KKKKKK.....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '.....KHHHHK.....',
];

const HEAD_SIDE = [
  '................',
  '.....KKKKKK.....',
  '....KHHHHHHK....',
  '....KHHHHHHK....',
  '....KHSSSSSK....',
  '....KHSSWSSK....',
  '....KHSSSSSK....',
  '.....KSSSSK.....',
];

const TORSO = [
  '...KKBBBBBBKK...',
  '..KBBBBBBBBBBK..',
  '..KBBBBBBBBBBK..',
  '..KSBBBBBBBBSK..',
  '...KBBBBBBBBK...',
];

/** Leg variants drive the 3-frame walk cycle. */
const LEGS = [
  ['....KPPPPPPK....', '....KPP..PPK....', '....KKK..KKK....'], // stand
  ['....KPPPPPPK....', '...KPPP..PPK....', '...KKK....KK....'], // step left
  ['....KPPPPPPK....', '....KPP..PPPK...', '....KK....KKK...'], // step right
];

/** Arms raised at a keyboard — used for the "working" pose. */
const TORSO_TYPING = [
  '...KKBBBBBBKK...',
  '..KBBBBBBBBBBK..',
  '.KSBBBBBBBBBBSK.',
  '..KBBBBBBBBBBK..',
  '...KBBBBBBBBK...',
];

function buildFrame(head, torso, legs) {
  return [...head, ...torso, ...legs];
}

const POSES = {
  down: HEAD_DOWN,
  up: HEAD_UP,
  side: HEAD_SIDE,
};

/** Texture key for one character frame. */
export function frameKey(agent, pose, index) {
  return `char:${agent}:${pose}:${index}`;
}

function drawGrid(g, grid, colors) {
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    for (let x = 0; x < row.length; x += 1) {
      const color = colors[row[x]];
      if (color === null || color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * Generate every frame for one agent: 3 walk frames per pose, plus a typing
 * frame. Frames are individual textures rather than a sliced spritesheet —
 * Phaser animations take `[{key}, {key}]` directly, so there is no atlas math
 * to get wrong.
 */
export function generateCharacter(scene, agent, bodyColor) {
  const colors = { ...BASE, B: bodyColor };

  for (const [pose, head] of Object.entries(POSES)) {
    for (let i = 0; i < LEGS.length; i += 1) {
      const key = frameKey(agent, pose, i);
      if (scene.textures.exists(key)) continue;
      const g = scene.add.graphics();
      drawGrid(g, buildFrame(head, TORSO, LEGS[i]), colors);
      g.generateTexture(key, TILE, TILE);
      g.destroy();
    }
  }

  const typingKey = frameKey(agent, 'typing', 0);
  if (!scene.textures.exists(typingKey)) {
    const g = scene.add.graphics();
    drawGrid(g, buildFrame(HEAD_UP, TORSO_TYPING, LEGS[0]), colors);
    g.generateTexture(typingKey, TILE, TILE);
    g.destroy();
  }
}

/* ------------------------------------------------------------------ *
 * Environment tiles
 * ------------------------------------------------------------------ */

export const TILE_KEYS = {
  floor: 'tile:floor',
  floorAlt: 'tile:floorAlt',
  wall: 'tile:wall',
  wallTop: 'tile:wallTop',
  desk: 'tile:desk',
  board: 'tile:board',
};

function rect(g, color, x, y, w, h) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

export function generateTiles(scene) {
  const make = (key, draw) => {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, TILE, TILE);
    g.destroy();
  };

  make(TILE_KEYS.floor, (g) => {
    rect(g, 0x2a2d43, 0, 0, TILE, TILE);
    rect(g, 0x31344e, 0, 0, TILE, 1);
    rect(g, 0x24263a, 0, TILE - 1, TILE, 1);
  });

  // A second floor tile breaks up the grid without needing noise.
  make(TILE_KEYS.floorAlt, (g) => {
    rect(g, 0x2a2d43, 0, 0, TILE, TILE);
    rect(g, 0x31344e, 0, 0, TILE, 1);
    rect(g, 0x2f3249, 4, 6, 2, 2);
    rect(g, 0x2f3249, 10, 11, 2, 2);
  });

  make(TILE_KEYS.wall, (g) => {
    rect(g, 0x3a3550, 0, 0, TILE, TILE);
    rect(g, 0x453f5e, 0, 0, TILE, 2);
    rect(g, 0x2e2a42, 0, TILE - 2, TILE, 2);
    rect(g, 0x2e2a42, 7, 2, 1, TILE - 4);
  });

  make(TILE_KEYS.wallTop, (g) => {
    rect(g, 0x514a6b, 0, 0, TILE, TILE);
    rect(g, 0x5d5579, 0, 0, TILE, 3);
    rect(g, 0x3a3550, 0, TILE - 3, TILE, 3);
  });

  make(TILE_KEYS.desk, (g) => {
    rect(g, 0x6b4f3a, 0, 4, TILE, 9);
    rect(g, 0x7d5d45, 0, 4, TILE, 2);
    rect(g, 0x4e3a2b, 0, 12, TILE, 2);
    // monitor
    rect(g, 0x1b1b29, 4, 0, 8, 6);
    rect(g, 0x3ad6c0, 5, 1, 6, 4);
  });

  make(TILE_KEYS.board, (g) => {
    rect(g, 0x1f2335, 0, 0, TILE, TILE);
    rect(g, 0x8a7a5c, 0, 0, TILE, 2);
    rect(g, 0x8a7a5c, 0, TILE - 2, TILE, 2);
    rect(g, 0x8a7a5c, 0, 0, 2, TILE);
    rect(g, 0x8a7a5c, TILE - 2, 0, 2, TILE);
  });
}

/** One-time animation registration per agent. */
export function registerAnimations(scene, agent) {
  const defs = [
    ['down', 'down'],
    ['up', 'up'],
    ['side', 'side'],
  ];
  for (const [pose] of defs) {
    const key = `walk:${agent}:${pose}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: [0, 1, 0, 2].map((i) => ({ key: frameKey(agent, pose, i) })),
      frameRate: 7,
      repeat: -1,
    });
  }

  const typeKey = `type:${agent}`;
  if (!scene.anims.exists(typeKey)) {
    scene.anims.create({
      key: typeKey,
      frames: [{ key: frameKey(agent, 'typing', 0) }, { key: frameKey(agent, 'up', 0) }],
      frameRate: 3,
      repeat: -1,
    });
  }
}
