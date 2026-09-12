/**
 * The development team's room.
 *
 * Deliberately one room, not a floor plan. It exists to pin down the shell --
 * floor, walls, doorway -- before any layout is drawn on top of it.
 *
 * Every tile here comes from the CC0 spritesheet (public/tiles/Inner.png), not
 * from the generated `dev.*` art. That pack turns out to carry only three shell
 * tiles: a checkered floor at (0,0) and brick walls at (0,1) and (0,2). Those
 * three are the whole vocabulary this room is built from, which is why it is a
 * plain rectangle -- there are no corner, edge or wall-face tiles to shape it
 * with.
 *
 * 15x10 is exactly the 240x160 viewport at 16px tiles, so the room is one
 * screenful with no dead margin -- you see all of it at once, the way a small
 * Pokemon house reads.
 *
 * Legend
 *   # brick wall     . checkered floor
 */

export const devroom = {
  id: 'devroom',
  name: 'Dev Room',
  kind: 'interior',

  legend: {
    '#': 'inner.wall.brick.cream',
    '.': 'inner.floor.check',
    // East doorway into the Kenney style prototype. A gap, not a door tile,
    // for the same reason the south exit is one: this pack has no door tile.
    D: 'inner.floor.check',
  },

  grid: [
    '###############',
    '###############',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............D',
    '#.............#',
    '#.............#',
    '#.............#',
    '######..#######',
  ],

  /**
   * The doorway is a gap in the bottom wall rather than a door tile, because
   * the pack has no door-in-a-wall tile. Both gap tiles warp, so you leave by
   * walking out of either one.
   */
  /** The east door is a bare gap, so say where it goes. */
  signs: [
    {
      x: 14,
      y: 5,
      text: 'EAST DOOR — style prototype\nThe same room built from the\nKenney roguelike tileset.',
    },
  ],

  labels: [{ x: 11, y: 4, text: 'KENNEY ->' }],

  warps: [
    { x: 6, y: 9, to: 'overworld', tx: 6, ty: 6, facing: 'down' },
    { x: 7, y: 9, to: 'overworld', tx: 6, ty: 6, facing: 'down' },
    { x: 14, y: 5, to: 'devroomRl', tx: 12, ty: 8, facing: 'down' },
  ],
};

export default devroom;
