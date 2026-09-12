/**
 * Engineering: the department that exists today.
 *
 * Rooms inside this building correspond to real parts of the repo, and each is
 * bound to a `zone` id from bridge/zones.js. When an agent reads `server.js`
 * the bridge tags the event `zone: 'server'` and the agent walks into the
 * server room — so an agent's position in this building is information about
 * the codebase, not decoration.
 *
 * Legend
 *   # wall top   = wall face    . wood floor   : tiled floor   c carpet
 *   D interior door             m doormat      P desk+PC
 *   B bookshelf  H plant        K counter      < exit
 */

export const engineering = {
  id: 'engineering',
  name: 'Engineering',
  kind: 'interior',
  department: 'engineering',

  legend: {
    '#': 'wall.top',
    '=': 'wall.face',
    '.': 'floor.wood',
    ':': 'floor.tile',
    c: 'floor.carpet',
    D: 'door.interior',
    m: 'door.mat',
    P: 'desk.pc',
    B: 'bookshelf',
    H: 'plant',
    K: 'counter',
    '<': 'door.mat',
  },

  grid: [
    '#################################',
    '=================================',
    '#:::::::::#:::::::::#:::::::::::#',
    '#:P:P:P:::#:P:P:P:::#:::P:P:::::#',
    '#:::::::::#:::::::::#:::::::::::#',
    '#:::::::::D:::::::::D:::::::::::#',
    '#:::::::H:#:::::::H:#:::::::::H:#',
    '#####D#######D#########D#########',
    '=====m=======m=========m=========',
    '#.............................B.#',
    '#..H.......................c....#',
    '#.........K........K.......c....#',
    '#.........................cc....#',
    '#.........................c.....#',
    '#...............<...............#',
    '#################################',
  ],

  /** Rooms. `zone` binds the room to a slice of the repository. */
  rooms: [
    { id: 'server', label: 'SERVER ROOM', zone: 'server', x: 1, y: 2, w: 9, h: 5 },
    { id: 'frontend', label: 'FRONTEND', zone: 'frontend', x: 11, y: 2, w: 9, h: 5 },
    { id: 'quarters', label: 'AGENT QUARTERS', zone: 'quarters', x: 21, y: 2, w: 11, h: 5 },
    { id: 'lobby', label: 'LOBBY', zone: null, x: 1, y: 9, w: 31, h: 6 },
  ],

  /**
   * Where agents stand when idle. They walk to a room's spot when their
   * activity indicates that zone.
   */
  home: [
    { x: 6, y: 12 },
    { x: 9, y: 12 },
    { x: 12, y: 12 },
    { x: 15, y: 12 },
    { x: 18, y: 12 },
  ],

  /** Standing spots per zone, in slot order. */
  spots: {
    server: [{ x: 2, y: 4 }, { x: 4, y: 4 }, { x: 6, y: 4 }],
    frontend: [{ x: 12, y: 4 }, { x: 14, y: 4 }, { x: 16, y: 4 }],
    quarters: [{ x: 24, y: 4 }, { x: 26, y: 4 }, { x: 28, y: 4 }],
    lobby: [{ x: 22, y: 12 }, { x: 24, y: 12 }],
  },

  warps: [{ x: 16, y: 14, to: 'overworld', tx: 6, ty: 6, facing: 'down' }],

  signs: [
    { x: 10, y: 11, text: 'SERVER ROOM — server.js\nEvery route, the schema, auth,\nStripe and the cron job.' },
    { x: 19, y: 11, text: 'FRONTEND — src/\nReact pages, hooks, the\nhand-rolled tab router.' },
    { x: 30, y: 9, text: 'AGENT QUARTERS — .claude/\nAgent definitions and skills.\nWhere the roster lives.' },
  ],

  labels: [
    { x: 5, y: 2.6, text: 'SERVER ROOM' },
    { x: 15, y: 2.6, text: 'FRONTEND' },
    { x: 26, y: 2.6, text: 'QUARTERS' },
  ],
};

export default engineering;
