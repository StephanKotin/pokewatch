/**
 * Pixel font, generated at boot.
 *
 * The world renders into a 240x160 buffer that is then upscaled 4x with
 * nearest-neighbour. Browser-rasterised `scene.add.text` at 5-6px is
 * anti-aliased *before* that upscale, so every glyph arrives on screen as a
 * 4x-magnified grey smear — which is exactly why the old nameplates and
 * building signs were unreadable.
 *
 * The fix is the one GBA games used: glyphs authored as 1-bit pixels at the
 * size they are displayed, so the upscale has nothing to blur. Authored as
 * character grids for the same reason the tiles are (see art/tiles.js) —
 * tweaking a letter means moving a character, not editing drawing calls.
 *
 * Metrics: rows 0-4 are the cap height, rows 1-4 the x-height, row 5 the
 * descender. Advance is the glyph's own width plus one column, so the font is
 * proportional: `M` and `w` get the five columns they need to stop reading as
 * blobs, while `i` and `.` give their spare columns back. Two textures are
 * generated from one table: the glyphs themselves, and a 1px-dilated copy used
 * as an outline, so labels stay readable over wood, grass and tile alike.
 */

/** Widest glyph. Most are 4 wide; M/W/V/X/Y and m/w/v take 5, i/l/./: take 2-3. */
export const GLYPH_W = 5;
export const GLYPH_H = 6;
/** Outline padding baked into every atlas cell. */
const PAD = 1;
const CELL_W = GLYPH_W + PAD * 2;
const CELL_H = GLYPH_H + PAD * 2;
const CHARS_PER_ROW = 16;

export const FONT_KEY = 'pixelfont';
export const FONT_OUTLINE_KEY = 'pixelfont-outline';

const GLYPHS = {
  ' ': ['....', '....', '....', '....', '....', '....'],

  A: ['.##.', '#..#', '####', '#..#', '#..#', '....'],
  B: ['###.', '#..#', '###.', '#..#', '###.', '....'],
  C: ['.###', '#...', '#...', '#...', '.###', '....'],
  D: ['###.', '#..#', '#..#', '#..#', '###.', '....'],
  E: ['####', '#...', '###.', '#...', '####', '....'],
  F: ['####', '#...', '###.', '#...', '#...', '....'],
  G: ['.###', '#...', '#.##', '#..#', '.###', '....'],
  H: ['#..#', '#..#', '####', '#..#', '#..#', '....'],
  I: ['###.', '.#..', '.#..', '.#..', '###.', '....'],
  J: ['..##', '...#', '...#', '#..#', '.##.', '....'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#', '....'],
  L: ['#...', '#...', '#...', '#...', '####', '....'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '.....'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '.....'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.', '....'],
  P: ['###.', '#..#', '###.', '#...', '#...', '....'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#', '....'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#', '....'],
  S: ['.###', '#...', '.##.', '...#', '###.', '....'],
  T: ['####', '.#..', '.#..', '.#..', '.#..', '....'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.', '....'],
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..', '.....'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.', '.....'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '.....'],
  Z: ['####', '...#', '.##.', '#...', '####', '....'],

  a: ['....', '###.', '.###', '#..#', '.###', '....'],
  b: ['#...', '###.', '#..#', '#..#', '###.', '....'],
  c: ['....', '.###', '#...', '#...', '.###', '....'],
  d: ['...#', '.###', '#..#', '#..#', '.###', '....'],
  e: ['....', '.##.', '####', '#...', '.###', '....'],
  f: ['..##', '.#..', '###.', '.#..', '.#..', '....'],
  g: ['....', '.##.', '#..#', '.###', '...#', '###.'],
  h: ['#...', '###.', '#..#', '#..#', '#..#', '....'],
  i: ['.#.', '...', '##.', '.#.', '###', '...'],
  j: ['.#.', '...', '.#.', '.#.', '.#.', '##.'],
  k: ['#...', '#..#', '##..', '#.#.', '#..#', '....'],
  l: ['##.', '.#.', '.#.', '.#.', '.##', '...'],
  m: ['.....', '####.', '#.#.#', '#.#.#', '#.#.#', '.....'],
  n: ['....', '###.', '#..#', '#..#', '#..#', '....'],
  o: ['....', '.##.', '#..#', '#..#', '.##.', '....'],
  p: ['....', '###.', '#..#', '###.', '#...', '#...'],
  q: ['....', '.###', '#..#', '.###', '...#', '...#'],
  r: ['....', '#.##', '##..', '#...', '#...', '....'],
  s: ['....', '.###', '##..', '..##', '###.', '....'],
  t: ['.#..', '###.', '.#..', '.#..', '..##', '....'],
  u: ['....', '#..#', '#..#', '#..#', '.###', '....'],
  v: ['.....', '#...#', '#...#', '.#.#.', '..#..', '.....'],
  w: ['.....', '#...#', '#...#', '#.#.#', '.#.#.', '.....'],
  x: ['....', '#..#', '.##.', '.##.', '#..#', '....'],
  y: ['....', '#..#', '#..#', '.###', '...#', '###.'],
  z: ['....', '####', '..#.', '.#..', '####', '....'],

  0: ['.##.', '#.##', '##.#', '#..#', '.##.', '....'],
  1: ['.#..', '##..', '.#..', '.#..', '###.', '....'],
  2: ['###.', '...#', '.##.', '#...', '####', '....'],
  3: ['###.', '...#', '.##.', '...#', '###.', '....'],
  4: ['#..#', '#..#', '####', '...#', '...#', '....'],
  5: ['####', '#...', '###.', '...#', '###.', '....'],
  6: ['.##.', '#...', '###.', '#..#', '.##.', '....'],
  7: ['####', '...#', '..#.', '.#..', '.#..', '....'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.', '....'],
  9: ['.##.', '#..#', '.###', '...#', '.##.', '....'],

  '.': ['..', '..', '..', '..', '#.', '..'],
  ',': ['..', '..', '..', '..', '.#', '#.'],
  ':': ['..', '#.', '..', '#.', '..', '..'],
  ';': ['..', '.#', '..', '.#', '#.', '..'],
  '!': ['#.', '#.', '#.', '..', '#.', '..'],
  '?': ['###.', '...#', '.##.', '....', '.#..', '....'],
  "'": ['#.', '..', '..', '..', '..', '..'],
  '"': ['#.#.', '....', '....', '....', '....', '....'],
  '-': ['....', '....', '###.', '....', '....', '....'],
  '_': ['....', '....', '....', '....', '####', '....'],
  '+': ['....', '.#..', '###.', '.#..', '....', '....'],
  '=': ['....', '###.', '....', '###.', '....', '....'],
  '*': ['#.#.', '.#..', '#.#.', '....', '....', '....'],
  '/': ['...#', '..#.', '.#..', '.#..', '#...', '....'],
  '\\': ['#...', '.#..', '..#.', '..#.', '...#', '....'],
  '(': ['.#.', '#..', '#..', '#..', '.#.', '...'],
  ')': ['#..', '.#.', '.#.', '.#.', '#..', '...'],
  '[': ['##.', '#..', '#..', '#..', '##.', '...'],
  ']': ['##.', '.#.', '.#.', '.#.', '##.', '...'],
  '<': ['..#.', '.#..', '#...', '.#..', '..#.', '....'],
  '>': ['#...', '.#..', '..#.', '.#..', '#...', '....'],
  '#': ['#.#.', '####', '#.#.', '####', '#.#.', '....'],
  '%': ['#..#', '...#', '.##.', '#...', '#..#', '....'],
  '&': ['.##.', '##..', '##.#', '#.#.', '.###', '....'],
  '@': ['.##.', '#..#', '#.##', '#...', '.###', '....'],
  $: ['.###', '##..', '.##.', '..##', '###.', '....'],
  '|': ['#.', '#.', '#.', '#.', '#.', '..'],
  '~': ['....', '....', '.#.#', '#.#.', '....', '....'],
  '`': ['#.', '.#', '..', '..', '..', '..'],
  '^': ['.#.', '#.#', '...', '...', '...', '...'],
  '{': ['.##', '.#.', '#..', '.#.', '.##', '...'],
  '}': ['##.', '.#.', '..#', '.#.', '##.', '...'],
};

/**
 * Characters the world produces that the table doesn't carry. Mapping them is
 * cheaper than drawing them, and stops an em dash from rendering as a box.
 */
const FOLD = {
  '—': '-',
  '–': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  é: 'e',
  É: 'E',
  ' ': ' ',
  '…': '...',
};

/**
 * Fold a string onto the supported character set. Newlines pass through —
 * BitmapText splits lines on them — and anything else unknown becomes '?'.
 */
export function foldText(text) {
  let out = '';
  for (const ch of String(text)) {
    if (ch === '\n') {
      out += ch;
      continue;
    }
    const folded = FOLD[ch] ?? ch;
    for (const c of folded) out += c in GLYPHS ? c : '?';
  }
  return out;
}

const ORDER = Object.keys(GLYPHS);

/** Width of one glyph in pixels, taken from the table itself. */
function widthOf(ch) {
  return GLYPHS[ch][0].length;
}

/** Horizontal advance: the glyph plus one blank column. */
function advanceOf(ch) {
  return widthOf(ch) + 1;
}

/** Grow the glyph by one pixel in all eight directions. */
function dilate(grid) {
  const out = [];
  const w = grid[0].length;
  for (let y = -1; y <= GLYPH_H; y += 1) {
    let row = '';
    for (let x = -1; x <= w; x += 1) {
      let on = false;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        for (let dx = -1; dx <= 1 && !on; dx += 1) {
          on = grid[y + dy]?.[x + dx] === '#';
        }
      }
      row += on ? '#' : '.';
    }
    out.push(row);
  }
  return out;
}

function cellOf(index) {
  return {
    x: (index % CHARS_PER_ROW) * CELL_W,
    y: Math.floor(index / CHARS_PER_ROW) * CELL_H,
  };
}

function atlasSize() {
  return {
    width: CHARS_PER_ROW * CELL_W,
    height: Math.ceil(ORDER.length / CHARS_PER_ROW) * CELL_H,
  };
}

function drawAtlas(scene, key, outline) {
  const { width, height } = atlasSize();
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);

  ORDER.forEach((ch, i) => {
    const cell = cellOf(i);
    const grid = outline ? dilate(GLYPHS[ch]) : GLYPHS[ch];
    // The dilated grid already starts at -1,-1, so it fills the cell padding;
    // the plain grid is inset by the same padding to stay aligned with it.
    const inset = outline ? 0 : PAD;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x] !== '#') continue;
        g.fillRect(cell.x + inset + x, cell.y + inset + y, 1, 1);
      }
    }
  });

  g.generateTexture(key, width, height);
  g.destroy();
}

/**
 * Register `key` as a bitmap font over an atlas of CELL_W x CELL_H cells.
 *
 * Built by hand rather than with Display.RetroFont.Parse because that helper
 * forces `xAdvance` to equal the cell width, which would make the outline's
 * padding part of the advance and space every glyph two pixels too far apart.
 */
function registerFont(scene, key) {
  const { width, height } = atlasSize();
  const frame = scene.textures.getFrame(key);
  const chars = {};

  ORDER.forEach((ch, i) => {
    const { x, y } = cellOf(i);
    chars[ch.charCodeAt(0)] = {
      x,
      y,
      width: CELL_W,
      height: CELL_H,
      centerX: CELL_W / 2,
      centerY: CELL_H / 2,
      xOffset: -PAD,
      yOffset: -PAD,
      xAdvance: advanceOf(ch),
      data: {},
      kerning: {},
      u0: (frame.cutX + x) / width,
      v0: 1 - (frame.cutY + y) / height,
      u1: (frame.cutX + x + CELL_W) / width,
      v1: 1 - (frame.cutY + y + CELL_H) / height,
    };
  });

  scene.cache.bitmapFont.add(key, {
    data: {
      retroFont: true,
      font: key,
      size: CELL_H,
      lineHeight: GLYPH_H + 2,
      chars,
    },
    frame: null,
    texture: key,
  });
}

/** Generate both font textures. Call once, before anything draws a label. */
export function generateFont(scene) {
  if (scene.cache.bitmapFont.has(FONT_KEY)) return;
  drawAtlas(scene, FONT_KEY, false);
  drawAtlas(scene, FONT_OUTLINE_KEY, true);
  registerFont(scene, FONT_KEY);
  registerFont(scene, FONT_OUTLINE_KEY);
}

/**
 * Break `text` onto lines no wider than `maxWidth` world pixels. The bitmap
 * font has no wrapping of its own, and the error banner is the one place where
 * the text length isn't known in advance.
 */
export function wrapText(text, maxWidth) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Width in world pixels of a rendered string, trailing gap excluded. */
export function measure(text) {
  let widest = 0;
  for (const line of foldText(text).split('\n')) {
    let w = 0;
    for (const ch of line) w += advanceOf(ch);
    widest = Math.max(widest, w);
  }
  return widest === 0 ? 0 : widest - 1;
}

/**
 * A label drawn in the pixel font.
 *
 * Returns a Container so the caller moves, depth-sorts and hides the label as
 * one thing regardless of whether it is backed by an outline or a plate.
 * Everything is placed on whole pixels by hand — Phaser's own origin maths
 * would land glyphs on half pixels, and a half pixel is resampled by the 4x
 * upscale straight back into the blur this file exists to remove.
 *
 * `backing`: 'outline' (default) reads over any tile; 'plate' is for signage,
 * where a solid block is part of the look.
 */
export function pixelLabel(scene, x, y, text, options = {}) {
  const {
    color = 0xfff6e0,
    backingColor = 0x2a2139,
    backing = 'outline',
    originX = 0.5,
    originY = 0,
    depth = 0,
    padX = 2,
    padY = 2,
  } = options;

  const body = foldText(text);
  const lineHeight = GLYPH_H + 2;
  const height = body.split('\n').length * lineHeight - 2;
  const width = measure(body);
  const left = -Math.round(width * originX);
  const top = -Math.round(height * originY);

  const parts = [];

  if (backing === 'plate') {
    parts.push(
      scene.add
        .rectangle(left - padX, top - padY, width + padX * 2, height + padY * 2, backingColor)
        .setOrigin(0, 0),
    );
  } else {
    parts.push(
      scene.add.bitmapText(left, top, FONT_OUTLINE_KEY, body).setOrigin(0, 0).setTint(backingColor),
    );
  }

  parts.push(scene.add.bitmapText(left, top, FONT_KEY, body).setOrigin(0, 0).setTint(color));

  // Both layers share one set of advances, so centring them independently
  // still lines them up exactly.
  if (originX === 0.5) for (const p of parts) p.setCenterAlign?.();

  const container = scene.add.container(Math.round(x), Math.round(y), parts).setDepth(depth);
  container.textWidth = width;
  return container;
}
