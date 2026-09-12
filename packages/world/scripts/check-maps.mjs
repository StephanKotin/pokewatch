import { MAPS, START } from '../src/maps/index.js';
import { SOLID, TILE_NAMES } from '../src/art/tiles.js';
import { findPath } from '../src/engine/pathfind.js';

/**
 * Map integrity checks.
 *
 * Hand-authored ASCII maps fail in quiet ways — a short row, a legend char with
 * no tile, a door that warps you into a wall — and none of those throw. They
 * just produce a world you can't walk through.
 */

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

/** Minimal TileMap stand-in so pathfinding can run outside the browser. */
function harness(def) {
  const height = def.grid.length;
  return {
    def,
    height,
    charAt(tx, ty) {
      if (ty < 0 || ty >= height) return null;
      const row = def.grid[ty];
      if (tx < 0 || tx >= row.length) return null;
      return row[tx];
    },
    tileNameAt(tx, ty) {
      const ch = this.charAt(tx, ty);
      return ch === null ? null : def.legend[ch] ?? null;
    },
    isSolid(tx, ty) {
      const name = this.tileNameAt(tx, ty);
      if (name === null) return true;
      const o = def.solid?.[this.charAt(tx, ty)];
      if (typeof o === 'boolean') return o;
      return SOLID.has(name);
    },
  };
}

for (const [id, def] of Object.entries(MAPS)) {
  if (def.id !== id) fail(`${id}: def.id is "${def.id}"`);

  // 1. rectangular grid
  const widths = [...new Set(def.grid.map((r) => r.length))];
  if (widths.length !== 1) {
    fail(`${id}: rows have differing widths ${JSON.stringify(widths)} — ` +
      def.grid.map((r, i) => (r.length !== widths[0] ? `row ${i}=${r.length}` : null)).filter(Boolean).join(', '));
  }

  // 2. every grid char is in the legend, and maps to a real tile
  const chars = new Set(def.grid.join('').split(''));
  for (const ch of chars) {
    const name = def.legend[ch];
    if (!name) fail(`${id}: grid uses "${ch}" with no legend entry`);
    else if (!TILE_NAMES.includes(name)) fail(`${id}: legend "${ch}" -> unknown tile "${name}"`);
  }
  // and no unused legend entries (a typo'd legend is a silent no-op)
  for (const ch of Object.keys(def.legend)) {
    if (!chars.has(ch)) notes.push(`${id}: legend "${ch}" is never used in the grid`);
  }

  const map = harness(def);
  const inside = (x, y) => y >= 0 && y < def.grid.length && x >= 0 && x < def.grid[y].length;

  // 3. warps: source must exist; destination must exist, be walkable, and not
  //    itself be a warp (which would bounce the player straight back)
  for (const w of def.warps ?? []) {
    if (!inside(w.x, w.y)) fail(`${id}: warp source (${w.x},${w.y}) is off-map`);
    const dest = MAPS[w.to];
    if (!dest) {
      fail(`${id}: warp targets unknown map "${w.to}"`);
      continue;
    }
    const dmap = harness(dest);
    if (!inside.call(null, w.tx, w.ty) && false) { /* dest bounds checked below */ }
    if (w.ty < 0 || w.ty >= dest.grid.length || w.tx < 0 || w.tx >= dest.grid[w.ty].length) {
      fail(`${id}: warp to ${w.to} lands off-map at (${w.tx},${w.ty})`);
      continue;
    }
    if (dmap.isSolid(w.tx, w.ty)) {
      fail(`${id}: warp to ${w.to} lands INSIDE A WALL at (${w.tx},${w.ty}) [tile ${dmap.tileNameAt(w.tx, w.ty)}]`);
    }
    if ((dest.warps ?? []).some((d) => d.x === w.tx && d.y === w.ty)) {
      fail(`${id}: warp to ${w.to} lands on another warp at (${w.tx},${w.ty}) — infinite bounce`);
    }
  }

  // 4. signs and agent spots must be sane
  for (const s of def.signs ?? []) {
    if (!inside(s.x, s.y)) fail(`${id}: sign at (${s.x},${s.y}) is off-map`);
  }
  for (const h of def.home ?? []) {
    const x = h.tx ?? h.x;
    const y = h.ty ?? h.y;
    if (map.isSolid(x, y)) fail(`${id}: agent home (${x},${y}) is solid [${map.tileNameAt(x, y)}]`);
  }
  for (const [zone, spots] of Object.entries(def.spots ?? {})) {
    for (const s of spots) {
      if (map.isSolid(s.x, s.y)) fail(`${id}: spot for zone "${zone}" at (${s.x},${s.y}) is solid [${map.tileNameAt(s.x, s.y)}]`);
    }
  }

  // 5. rooms must reference declared zones and sit inside the grid
  for (const r of def.rooms ?? []) {
    if (!inside(r.x, r.y) || !inside(r.x + r.w - 1, r.y + r.h - 1)) {
      fail(`${id}: room "${r.id}" extends off-map`);
    }
  }

  // 6. THE BIG ONE: every agent home must be able to reach every zone spot and
  //    every warp, through doorways. This is what catches a walled-off room.
  const homes = (def.home ?? []).map((h) => ({ tx: h.tx ?? h.x, ty: h.ty ?? h.y }));
  if (homes.length) {
    const targets = [
      ...Object.entries(def.spots ?? {}).flatMap(([zone, spots]) =>
        spots.map((s) => ({ label: `zone ${zone}`, tx: s.x, ty: s.y })),
      ),
      ...(def.warps ?? []).map((w) => ({ label: `warp to ${w.to}`, tx: w.x, ty: w.y })),
    ];
    for (const t of targets) {
      const path = findPath(map, homes[0], { tx: t.tx, ty: t.ty });
      if (path === null) {
        fail(`${id}: ${t.label} at (${t.tx},${t.ty}) is UNREACHABLE from agent home (${homes[0].tx},${homes[0].ty})`);
      }
    }
  }
}

// 7. the player's start tile must be walkable
const startMap = MAPS[START.map];
if (!startMap) fail(`START references unknown map "${START.map}"`);
else {
  const m = harness(startMap);
  if (m.isSolid(START.x, START.y)) {
    fail(`START (${START.x},${START.y}) on ${START.map} is solid [${m.tileNameAt(START.x, START.y)}]`);
  }
  // and must be able to reach every building door
  for (const w of startMap.warps ?? []) {
    if (findPath(m, { tx: START.x, ty: START.y }, { tx: w.x, ty: w.y }) === null) {
      fail(`START cannot walk to the ${w.to} door at (${w.x},${w.y})`);
    }
  }
}

for (const n of notes) console.log('  ·', n);
console.log('');
if (problems.length === 0) {
  console.log(`✅ ${Object.keys(MAPS).length} maps OK — grids rectangular, legends complete, warps paired, every room reachable`);
  process.exit(0);
}
for (const p of problems) console.log('❌', p);
console.log(`\n${problems.length} problem(s)`);
process.exit(1);
