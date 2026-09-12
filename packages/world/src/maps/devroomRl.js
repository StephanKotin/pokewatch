/**
 * The dev room, rebuilt from the Kenney roguelike sheet.
 *
 * This is a STYLE PROTOTYPE, not a replacement. Same 15x10 footprint as
 * `devroom.js`, so the two can be compared with nothing else moving.
 *
 * What it demonstrates: the roguelike sheet carries a real room shell, which
 * `Inner.png` does not. The north wall is a genuine three-row band -- ceiling
 * strip, upper face, lower face -- so the room has depth, where `devroom` next
 * door is a flat rectangle of brick because that pack had no corner or
 * wall-face tiles to shape one with.
 *
 * What it also demonstrates, and the reason this is not simply "better": the
 * pack is MEDIEVAL FANTASY. There is not one computer, monitor or office desk
 * in its 1767 tiles. A dev room in this style has to become a guild hall, a
 * long table instead of workstations. That is a product decision, not a
 * rendering one. See public/tiles/ATTRIBUTION.md.
 *
 * Legend
 *   F - 7   ceiling band: top-left, horizontal, top-right
 *   |       vertical wall (one symmetric tile serves both sides)
 *   ^ =     wall upper face / lower face      L J  bottom-wall corners
 *   .       stone floor      g window (on the wall)     v candelabra
 *   W w     wardrobe, top and base
 *   q t Q / x r X / z y Z    rug, as a 9-slice
 *   a b c e long table       u n  chair facing up / down
 */

export const devroomRl = {
  id: 'devroomRl',
  name: 'Dev Room (Kenney)',
  kind: 'interior',

  legend: {
    F: 'rl.ceil.tl', '-': 'rl.ceil', '7': 'rl.ceil.tr',
    '|': 'rl.wall.side', '^': 'rl.wall.upper', '=': 'rl.wall.face',
    L: 'rl.wall.bl', J: 'rl.wall.br',
    '.': 'rl.floor.stone',
    q: 'rl.rug.tl', t: 'rl.rug.t', Q: 'rl.rug.tr',
    x: 'rl.rug.l', X: 'rl.rug.r',
    z: 'rl.rug.bl', y: 'rl.rug.b', Z: 'rl.rug.br',
    a: 'rl.table.l', b: 'rl.table.m', c: 'rl.table.m2', e: 'rl.table.r',
    u: 'rl.chair.up', n: 'rl.chair.down',
    W: 'rl.wardrobe.top', w: 'rl.wardrobe.base',
    g: 'rl.window', v: 'rl.candles',
  },

  /**
   * What to paint *underneath* a transparent tile.
   *
   * The engine's default is to sample a walkable neighbour, which is right for
   * a plant on a floor and wrong for everything here: a window is mounted on a
   * wall, not stood on one, and the table and chairs sit on the rug. Left to
   * the default, the window would punch a floor-coloured hole through the wall
   * and the furniture would be ringed by the rug's *border* tiles.
   *
   * The engine backs a tile exactly ONE layer deep, and a base that is itself
   * transparent still shows the page through. `rl.rug.t` has two empty pixel
   * rows along its top, so seating the chairs on the rug's EDGE drew a black
   * bar above them. They sit on `rl.rug.c`, the opaque interior, instead, and
   * the rug is authored a row taller so there is interior to sit on.
   */
  base: {
    g: 'rl.wall.face',
    q: 'rl.floor.stone', t: 'rl.floor.stone', Q: 'rl.floor.stone',
    x: 'rl.floor.stone', X: 'rl.floor.stone',
    z: 'rl.floor.stone', y: 'rl.floor.stone', Z: 'rl.floor.stone',
    a: 'rl.rug.c', b: 'rl.rug.c', c: 'rl.rug.c', e: 'rl.rug.c',
    u: 'rl.rug.c', n: 'rl.rug.c',
    W: 'rl.floor.stone', w: 'rl.floor.stone', v: 'rl.floor.stone',
  },

  /** Chairs are walkable on purpose: an agent on one reads as sitting down. */
  solid: { u: false, n: false },

  grid: [
    'F-------------7',
    '|^^^^^^^^^^^^^|',
    '|==g==g==g==g=|',
    '|.W.........W.|',
    '|.w.qttttQ..w.|',
    '|...xuuuuX....|',
    '|...xabceX....|',
    '|...xnnnnX....|',
    '|v..zyyyyZ...v|',
    'L=====..======J',
  ],

  /** Same doorway position as `devroom`, so the comparison is like for like. */
  warps: [
    { x: 6, y: 9, to: 'devroom', tx: 13, ty: 5, facing: 'down' },
    { x: 7, y: 9, to: 'devroom', tx: 13, ty: 5, facing: 'down' },
  ],
};

export default devroomRl;
