/**
 * Breadth-first path on the tile grid.
 *
 * Needed because rooms are real rooms: getting an agent from the lobby into the
 * server room means going *through the doorway*. A straight-line tween — which
 * is what the old open-plan office used — would walk it through a wall.
 *
 * BFS rather than A*: these maps are at most a few hundred walkable tiles, so
 * the heuristic buys nothing and costs correctness risk.
 */

const NEIGHBOURS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

/**
 * @param map       TileMap
 * @param from      {tx,ty}
 * @param to        {tx,ty}
 * @param isBlocked optional extra predicate (e.g. another agent standing there)
 * @returns tile array from the first step to `to`, or null if unreachable
 */
export function findPath(map, from, to, isBlocked = () => false) {
  if (from.tx === to.tx && from.ty === to.ty) return [];

  const key = (x, y) => `${x},${y}`;
  const start = key(from.tx, from.ty);
  const goal = key(to.tx, to.ty);

  const prev = new Map([[start, null]]);
  const queue = [{ tx: from.tx, ty: from.ty }];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const curKey = key(cur.tx, cur.ty);

    if (curKey === goal) {
      const path = [];
      let k = goal;
      while (k && k !== start) {
        const [x, y] = k.split(',').map(Number);
        path.push({ tx: x, ty: y });
        k = prev.get(k);
      }
      return path.reverse();
    }

    for (const n of NEIGHBOURS) {
      const nx = cur.tx + n.dx;
      const ny = cur.ty + n.dy;
      const nk = key(nx, ny);
      if (prev.has(nk)) continue;
      // The destination is allowed to be "blocked" by its own occupant; any
      // other blocked tile is off limits.
      const isGoal = nk === goal;
      if (map.isSolid(nx, ny)) continue;
      if (!isGoal && isBlocked(nx, ny)) continue;
      prev.set(nk, curKey);
      queue.push({ tx: nx, ty: ny });
    }
  }

  return null;
}

export default findPath;
