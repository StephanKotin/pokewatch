/**
 * The overworld: a small campus with one building per department.
 *
 * Authored as an ASCII grid because that is what stays editable — moving a tree
 * is changing one character. The legend maps each character to a tile key from
 * src/art/tiles.js; solidity comes from that tileset's SOLID set, with
 * per-legend overrides where a tile needs to behave differently here.
 *
 * Layout rule that matters: the path column must be the SAME column as the
 * door. The first draft had doors at x=6/18 but paths at x=5/17, so you
 * reached a door by cutting across grass — it looked like a mistake because it
 * was one.
 *
 * Legend
 *   . grass      , tuft       * flower     T tree
 *   # path       ~ water      S sign
 *   R roof       E roof edge  W wall       O window     D door
 */

export const overworld = {
  id: 'overworld',
  name: 'Campus',
  kind: 'exterior',

  legend: {
    '.': 'grass',
    ',': 'grass.tuft',
    '*': 'flower',
    T: 'tree',
    '#': 'path',
    '~': 'water',
    S: 'sign',
    R: 'bld.roof',
    E: 'bld.roof.edge',
    W: 'bld.wall',
    O: 'bld.window',
    D: 'bld.door',
  },

  grid: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'T............................T',
    'T..RRRRRR......RRRRRR........T',
    'T..RRRRRR......RRRRRR........T',
    'T..EEEEEE......EEEEEE........T',
    'T..WOWDWO......WOWDWO....,...T',
    'T.....#...........#..........T',
    'T,....#...........#..........T',
    'T.....#...........#..........T',
    'T.....#...........#....*.....T',
    'T..###################.......T',
    'T.....#...........#..........T',
    'T.....#...........#..........T',
    'T..RRRRRR......RRRRRR........T',
    'T..RRRRRR......RRRRRR........T',
    'T..EEEEEE......EEEEEE...,....T',
    'T..WOWDWO......WOWDWO........T',
    'T.....#...........#..........T',
    'T.....#...........#..........T',
    'T..###################.......T',
    'T.....#........~~~~~~~.......T',
    'T......S.......~~~~~~~.......T',
    'T..............~~~~~~~.......T',
    'T,......,....................T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],

  /**
   * Doors into each department. `y` is the door tile itself; the player warps
   * when they step onto it.
   */
  warps: [
    { x: 6, y: 5, to: 'engineering', tx: 16, ty: 13, facing: 'up' },
    { x: 18, y: 5, to: 'marketing', tx: 7, ty: 8, facing: 'up' },
    { x: 6, y: 16, to: 'product', tx: 7, ty: 8, facing: 'up' },
    { x: 18, y: 16, to: 'support', tx: 7, ty: 8, facing: 'up' },
  ],

  /** Readable things. Facing one and pressing A shows the text. */
  signs: [
    {
      x: 7,
      y: 21,
      text: 'CAMPUS DIRECTORY\nNorth-west: Engineering\nNorth-east: Marketing\nSouth-west: Product\nSouth-east: Support',
    },
  ],

  /** Labels floated over each building so you know where you are going. */
  /**
   * Labels ride the roof-edge band rather than sitting above the roof, where
   * the follow-camera clipped them off the top of the screen entirely.
   */
  labels: [
    { x: 5.5, y: 4.45, text: 'ENGINEERING' },
    { x: 17.5, y: 4.45, text: 'MARKETING' },
    { x: 5.5, y: 15.45, text: 'PRODUCT' },
    { x: 17.5, y: 15.45, text: 'SUPPORT' },
  ],
};

export default overworld;
