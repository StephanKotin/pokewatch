import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHEETS } from '../src/art/sheets.js';

/**
 * Spritesheet geometry checks.
 *
 * The failure this catches is the one that does not throw: a sheet whose
 * declared grid disagrees with the actual PNG. Phaser will happily slice frames
 * on a wrong stride and hand back tiles that are a pixel or two off -- which
 * reads as "the art is slightly bad" rather than "the manifest is wrong", so it
 * survives review. Asserting cols/rows against the IHDR makes it loud instead.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Width/height straight out of the PNG header -- no image library needed. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

for (const [key, s] of Object.entries(SHEETS)) {
  const path = join(root, 'public', s.path);
  if (!existsSync(path)) {
    problems.push(`${key}: missing file ${s.path}`);
    continue;
  }
  const { w, h } = pngSize(path);
  // A sheet of N tiles spans N*(tile+spacing) - spacing pixels; Kenney sometimes
  // leaves the trailing spacing on, so allow the sheet to run up to `spacing`
  // pixels long, but never short and never long enough to hide another column.
  const span = (n) => n * (s.tile + s.spacing) - s.spacing;
  const check = (axis, got, want) => {
    const slack = got - span(want);
    if (slack < 0 || slack > s.spacing) {
      problems.push(
        `${key}: ${axis} is ${got}px, but ${want} tiles at ${s.tile}px/sp${s.spacing} needs ${span(want)}px`,
      );
    }
  };
  check('width', w, s.cols);
  check('height', h, s.rows);

  const licences = key.startsWith('tiny.') || key.startsWith('ui.') || key.startsWith('rl');
  if (licences && !existsSync(join(root, 'public/tiles/kenney'))) {
    problems.push(`${key}: public/tiles/kenney is missing its licence files`);
  }
  console.log(
    `  · ${key.padEnd(13)} ${String(w).padStart(4)}x${String(h).padEnd(4)} = ` +
      `${s.cols}x${s.rows} tiles @${s.tile}px sp${s.spacing} (${s.cols * s.rows} frames)`,
  );
}

console.log('');
if (problems.length === 0) {
  const n = Object.keys(SHEETS).length;
  const frames = Object.values(SHEETS).reduce((a, s) => a + s.cols * s.rows, 0);
  console.log(`✅ ${n} sheets OK — ${frames} frames, every declared grid matches its PNG`);
  process.exit(0);
}
for (const p of problems) console.log('❌', p);
console.log(`\n${problems.length} problem(s)`);
process.exit(1);
