/**
 * Vendored Kenney spritesheets: geometry, in one place.
 *
 * These are data only -- no Phaser calls at import time, so `scripts/*.mjs` can
 * import this under plain node to check indices without a browser.
 *
 * THE GOTCHA THIS FILE EXISTS FOR: every Kenney sheet here except the `tiny.*`
 * and `ui.*` ones has **1px of spacing between tiles**. Load one with Phaser's
 * default `{frameWidth:16, frameHeight:16}` and you get frames that drift one
 * pixel further out of alignment per column -- legible at col 0, visibly
 * sheared by col 20, garbage by col 56. It does not throw; it just looks wrong.
 * `preloadSheets()` below passes `spacing` for you. Use it rather than calling
 * `this.load.spritesheet` by hand.
 *
 * Kenney ships `tilemap.png` (spaced) and `tilemap_packed.png` (no spacing) for
 * the newer packs. We vendor the *packed* variant where one exists, which is
 * why `spacing` differs per entry below. The roguelike packs are from 2015 and
 * have no packed variant, so they stay spaced.
 *
 * `inner` (ArMM1998) is deliberately NOT here -- it stays in tiles.js, which is
 * the existing swap point and owns the name->frame mapping.
 *
 * Frame index is always `row * cols + col`. See ../../public/tiles/ATTRIBUTION.md
 * for provenance and licensing, and what each sheet actually contains.
 */

export const SHEETS = {
  /** 1767 tiles. Terrain, full room shells, exteriors, furniture, UI bars. */
  'rl': { path: 'tiles/kenney/roguelike-sheet.png', tile: 16, spacing: 1, cols: 57, rows: 31 },
  /** 648 tiles. Layered paper-doll kit: bodies, armour, helms, weapons. */
  'rlchar': { path: 'tiles/kenney/roguelike-chars.png', tile: 16, spacing: 1, cols: 54, rows: 12 },
  /** 132 tiles. Outdoor town: grass, dirt, trees, roofs, fences. */
  'tiny.town': { path: 'tiles/kenney/tiny-town.png', tile: 16, spacing: 0, cols: 12, rows: 11 },
  /** 132 tiles. Dungeon interior: stone, doors, barrels, props. */
  'tiny.dungeon': { path: 'tiles/kenney/tiny-dungeon.png', tile: 16, spacing: 0, cols: 12, rows: 11 },
  /** 91 tiles at 32px. 9-slice panels, buttons, bars. */
  'ui.lg': { path: 'tiles/kenney/ui-large.png', tile: 32, spacing: 0, cols: 13, rows: 7 },
  /** 161 tiles at 16px. Same kit, small variant. */
  'ui.sm': { path: 'tiles/kenney/ui-small.png', tile: 16, spacing: 0, cols: 23, rows: 7 },
};

/** Frame index for a [col, row] cell in `key`'s grid. */
export function frame(key, col, row) {
  const s = SHEETS[key];
  if (!s) throw new Error(`unknown sheet: ${key}`);
  if (col < 0 || col >= s.cols || row < 0 || row >= s.rows) {
    throw new Error(`${key}: cell ${col},${row} is outside ${s.cols}x${s.rows}`);
  }
  return row * s.cols + col;
}

/**
 * Load every sheet. Call from a scene's `preload()`.
 *
 * `only` narrows it to a subset while a sheet is still being trialled, so a
 * scene that uses one sheet does not pay to decode all six.
 */
export function preloadSheets(scene, only = Object.keys(SHEETS)) {
  for (const key of only) {
    const s = SHEETS[key];
    scene.load.spritesheet(key, s.path, {
      frameWidth: s.tile,
      frameHeight: s.tile,
      spacing: s.spacing,
    });
  }
}
