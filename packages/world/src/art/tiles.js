/**
 * GBA-style tileset, generated at boot.
 *
 * Tiles are authored as 16x16 character grids with a shared palette, because
 * that is the only representation that stays *editable*: tweaking a plant means
 * moving two characters, not recomputing drawing calls. This is the swap point
 * for a real tileset — nothing outside this file touches pixel data, only keys.
 *
 * Palette is deliberately warm and slightly desaturated, the way Ruby/Emerald
 * interiors are: cream walls, honey-brown wood, muted teal screens.
 */

import { frame as sheetFrame } from './sheets.js';

export const TILE = 16;

const PAL = {
  '.': null, // transparent
  K: 0x2a2139, // outline
  D: 0x453b58, // deep shadow
  // walls (interior)
  W: 0xf2e3c4,
  w: 0xdcc49c,
  s: 0xb99b74,
  // wood floor
  F: 0xc89062,
  f: 0xa87048,
  // tiled floor
  T: 0xe4e6f0,
  t: 0xc6cada,
  // carpet
  C: 0xc25464,
  c: 0x9c3b4c,
  // grass
  G: 0x7cc65a,
  g: 0x5aa63e,
  h: 0x488c32,
  // path / dirt
  P: 0xe0cfa4,
  p: 0xc4b184,
  // furniture wood
  B: 0x8b5a2b,
  b: 0xb07a3a,
  // screens / glass
  M: 0x5ad0e0,
  m: 0x2f8fa0,
  // foliage
  L: 0x46a83c,
  l: 0x2f7d2a,
  // metal
  S: 0xa8adbe,
  // door
  E: 0xa4622c,
  e: 0x7d4620,
  // roof
  R: 0xc85448,
  r: 0x9e3a30,
  // window
  X: 0x3a4a6b,
  // accent (signs, flowers)
  Y: 0xf2d15c,
  N: 0xe06a8a,
  // water
  U: 0x4a86c8,
  u: 0x35679e,

  // --- condo interior (the dev floor): cooler and cleaner than the Emerald
  // --- office palette above, which is why it gets its own range rather than
  // --- being bent out of the warm one.
  a: 0xb2bf78, // floor, olive base
  d: 0x8d9c56, // floor, panel joint
  i: 0xcad69a, // floor, bevel highlight
  n: 0xfafafa, // white (walls, units, mattress)
  o: 0xdfe3ea, // white, shade
  v: 0xb9c2d0, // white, deep shade
  I: 0x8f97a8, // grey, appliance body
  J: 0x4d5364, // outline (cool)
  Q: 0x8ecae6, // wainscot cyan
  V: 0x5fa8cf, // window glass
  j: 0x3f7fc4, // blanket blue
  z: 0xe59a4c, // upholstery orange
  Z: 0xb96f2c, // upholstery orange, shade
  H: 0xe7524f, // table top red
  O: 0xb83a38, // table top red, shade
  A: 0x000000, // void (outside the footprint)
  q: 0x7fb2ce, // wainscot cyan, shade
  y: 0x6e7788, // wall base shadow onto floor
};

/* ------------------------------------------------------------------ *
 * Tile art. Each entry is 16 rows of 16 characters.
 * ------------------------------------------------------------------ */

const ART = {
  /* ---- interior ---- */

  // The top surface of a wall (what you see above the wall face).
  'wall.top': [
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'ssssssssssssssss',
    'ssssssssssssssss',
  ],

  // The vertical face below a wall top — gives interiors depth.
  'wall.face': [
    'ssssssssssssssss',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'ssssssssssssssss',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'ssssssssssssssss',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwww',
    'KKKKKKKKKKKKKKKK',
  ],

  'floor.wood': [
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'ffffffffffffffff',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'ffffffffffffffff',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'ffffffffffffffff',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFF',
    'ffffffffffffffff',
  ],

  'floor.tile': [
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'tttttttttttttttt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'TTTTTTTtTTTTTTTt',
    'tttttttttttttttt',
  ],

  'floor.carpet': [
    'cccccccccccccccc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cCCCCCCCCCCCCCCc',
    'cccccccccccccccc',
  ],

  'door.interior': [
    'ssssssssssssssss',
    'sKKKKKKKKKKKKKKs',
    'sKeeeeeeeeeeeeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEYYEEEeKs',
    'sKeEEEEEYYEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeEEEEEEEEEEeKs',
    'sKeeeeeeeeeeeeKs',
    'KKKKKKKKKKKKKKKK',
  ],

  'door.mat': [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KbbbbbbbbbbbbK.',
    '.KbBBBBBBBBBBbK.',
    '.KbBbBbBbBbBBbK.',
    '.KbBBBBBBBBBBbK.',
    '.KbBbBbBbBbBBbK.',
    '.KbBBBBBBBBBBbK.',
    '.KbBbBbBbBbBBbK.',
    '.KbBBBBBBBBBBbK.',
    '.KbBbBbBbBbBBbK.',
    '.KbBBBBBBBBBBbK.',
    '.KbbbbbbbbbbbbK.',
    '.KKKKKKKKKKKKKK.',
    '................',
    '................',
  ],

  // A desk with a monitor: the workstation an agent stands at.
  'desk.pc': [
    '................',
    '....KKKKKKKK....',
    '....KmmmmmmK....',
    '....KmMMMMmK....',
    '....KmMMMMmK....',
    '....KmmmmmmK....',
    '.....KKKKKK.....',
    '......KSSK......',
    'KKKKKKKKKKKKKKKK',
    'KbbbbbbbbbbbbbbK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    'KKKKKKKKKKKKKKKK',
    '.KB..........BK.',
    '.KB..........BK.',
    '.KK..........KK.',
  ],

  'desk.plain': [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    'KKKKKKKKKKKKKKKK',
    'KbbbbbbbbbbbbbbK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    'KKKKKKKKKKKKKKKK',
    '.KB..........BK.',
    '.KB..........BK.',
    '.KB..........BK.',
    '.KK..........KK.',
  ],

  'bookshelf': [
    'KKKKKKKKKKKKKKKK',
    'KBBBBBBBBBBBBBBK',
    'KBNNBYYBMMBNNBBK',
    'KBNNBYYBMMBNNBBK',
    'KBBBBBBBBBBBBBBK',
    'KBMMBNNBYYBMMBBK',
    'KBMMBNNBYYBMMBBK',
    'KBBBBBBBBBBBBBBK',
    'KBYYBMMBNNBYYBBK',
    'KBYYBMMBNNBYYBBK',
    'KBBBBBBBBBBBBBBK',
    'KBNNBYYBMMBNNBBK',
    'KBNNBYYBMMBNNBBK',
    'KBBBBBBBBBBBBBBK',
    'KKKKKKKKKKKKKKKK',
    '.KKKKKKKKKKKKKK.',
  ],

  'plant': [
    '................',
    '.......LL.......',
    '....LLLLLLLL....',
    '...LLlLLLLlLL...',
    '..LLLLLLLLLLLL..',
    '..LLlLLLLLLlLL..',
    '...LLLLLLLLLL...',
    '....LLLllLLL....',
    '......LLLL......',
    '.......ll.......',
    '.....KKKKKK.....',
    '.....KbbbbK.....',
    '.....KBBBBK.....',
    '.....KBBBBK.....',
    '.....KKKKKK.....',
    '................',
  ],

  'counter': [
    'KKKKKKKKKKKKKKKK',
    'KTTTTTTTTTTTTTTK',
    'KTTTTTTTTTTTTTTK',
    'KttttttttttttttK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    'KBbbbbbbbbbbbbBK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    'KBbbbbbbbbbbbbBK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    'KKKKKKKKKKKKKKKK',
    '.KK..........KK.',
    '.KK..........KK.',
    '.KK..........KK.',
  ],

  'stairs.up': [
    'ssssssssssssssss',
    'sWWWWWWWWWWWWWWs',
    'sWKKKKKKKKKKKKWs',
    'sWKTTTTTTTTTTKWs',
    'sWKKKKKKKKKKKKWs',
    'sWKTTTTTTTTTTKWs',
    'sWKKKKKKKKKKKKWs',
    'sWKTTTTTTTTTTKWs',
    'sWKKKKKKKKKKKKWs',
    'sWKTTTTTTTTTTKWs',
    'sWKKKKKKKKKKKKWs',
    'sWKTTTTTTTTTTKWs',
    'sWKKKKKKKKKKKKWs',
    'sWWWWWWWWWWWWWWs',
    'ssssssssssssssss',
    'KKKKKKKKKKKKKKKK',
  ],

  /* ---- exterior ---- */

  'grass': [
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGgGGGGGGGGGGG',
    'GGGGGGGGGGGGgGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGgGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGgGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGgGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGgGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
  ],

  'grass.tuft': [
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGhGGGGGGGGG',
    'GGGGGhhhGGGGGGGG',
    'GGGGhhhhhGGGGGGG',
    'GGGGGhhhGGGGhGGG',
    'GGGGGGhGGGGhhhGG',
    'GGGGGGGGGGhhhhhG',
    'GGGGGGGGGGGhhhGG',
    'GGGGGGGGGGGGhGGG',
    'GGGhGGGGGGGGGGGG',
    'GGhhhGGGGGGGGGGG',
    'GhhhhhGGGGGGGGGG',
    'GGhhhGGGGGGGGGGG',
    'GGGhGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
  ],

  'path': [
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPpPPPPPPPPPPPP',
    'PPPPPPPPPPPpPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPpPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PpPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPpPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPpPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
  ],

  'tree': [
    '.....llllll.....',
    '...llLLLLLLll...',
    '..lLLLLLLLLLLl..',
    '.lLLLLLLLLLLLLl.',
    '.lLLLLLLLLLLLLl.',
    'lLLLLLLLLLLLLLLl',
    'lLLLLLLLLLLLLLLl',
    'lLLLLLLLLLLLLLLl',
    '.lLLLLLLLLLLLLl.',
    '..lLLLLLLLLLLl..',
    '...llLLLLLLll...',
    '.....lBBBBl.....',
    '......KBBK......',
    '......KBBK......',
    '.....KKBBKK.....',
    '.....hhhhhh.....',
  ],

  'flower': [
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGNGGGGGGGGGGG',
    'GGGNYNGGGGGYGGGG',
    'GGGGNGGGGGGYGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGNGGGGGG',
    'GGGGGGGGNYNGGGGG',
    'GGGGGGGGGNGGGGGG',
    'GGGGGGGGGGGGGGGG',
    'GGYGGGGGGGGGGGGG',
    'GYNYGGGGGGGGGGGG',
    'GGYGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
  ],

  'water': [
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UuuUUUUUUUuuuUUU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUuuuUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UuuuUUUUUUUUUuuU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUuuuUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
    'UuuUUUUUUUUUUUUU',
    'UUUUUUUUUUUUUUUU',
  ],

  /* ---- building exteriors ---- */

  'bld.roof': [
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
  ],

  'bld.roof.edge': [
    'KKKKKKKKKKKKKKKK',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'RRRRRRRRRRRRRRRR',
    'rrrrrrrrrrrrrrrr',
    'RRRRRRRRRRRRRRRR',
    'KKKKKKKKKKKKKKKK',
    'ssssssssssssssss',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
  ],

  'bld.wall': [
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'ssssssssssssssss',
  ],

  'bld.window': [
    'WWWWWWWWWWWWWWWW',
    'WKKKKKKKKKKKKKKW',
    'WKXXXXXXXXXXXXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXXXXXXXXXXXXKW',
    'WKXXXXXXXXXXXXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXMMMMXXMMMMXKW',
    'WKXXXXXXXXXXXXKW',
    'WKKKKKKKKKKKKKKW',
    'WWWWWWWWWWWWWWWW',
    'wwwwwwwwwwwwwwww',
    'ssssssssssssssss',
  ],

  'bld.door': [
    'WWWWWWWWWWWWWWWW',
    'WWKKKKKKKKKKKKWW',
    'WWKeeeeeeeeeeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEYEEEeKWW',
    'WWKeEEEEYEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeEEEEEEEEeKWW',
    'WWKeeeeeeeeeeKWW',
    'WWKKKKKKKKKKKKWW',
    'PPPPPPPPPPPPPPPP',
  ],

  'sign': [
    '................',
    '................',
    '..KKKKKKKKKKKK..',
    '..KbbbbbbbbbbK..',
    '..KbWWWWWWWWbK..',
    '..KbWwwwwwwWbK..',
    '..KbWWWWWWWWbK..',
    '..KbWwwwwwwWbK..',
    '..KbWWWWWWWWbK..',
    '..KbbbbbbbbbbK..',
    '..KKKKKKKKKKKK..',
    '......KBBK......',
    '......KBBK......',
    '.....KKBBKK.....',
    '.....GGGGGG.....',
    'GGGGGGGGGGGGGGGG',
  ],

  'fence': [
    '................',
    '................',
    '.KK.KK.KK.KK.KK.',
    '.KS.KS.KS.KS.KS.',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSSSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    '.KS.KS.KS.KS.KS.',
    '.KS.KS.KS.KS.KS.',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSSSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    '.KS.KS.KS.KS.KS.',
    '.KS.KS.KS.KS.KS.',
    'GGGGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGGGG',
  ],

  /* ---- condo interior: the dev floor ----------------------------- *
   * Multi-tile furniture is authored as separate corner pieces (.tl/.tr/
   * .bl/.br, .l/.m/.r) rather than as one big sprite. That is how a GBA
   * tileset does it, and it is what lets a bed sit anywhere on the grid
   * without a second placement system.
   */

  'dev.floor': [
    'iiiiiiiiiiiiiiii',
    'daaaaaaaaaaaaaaa',
    'daaaaaaaaaaaaaaa',
    'daaaaaaaaaaaaaaa',
    'daaaaaaaaaaaaaaa',
    'daaaaaaaaaaaaaaa',
    'daaaaaaaaaaaaaaa',
    'dddddddddddddddd',
    'iiiiiiiiiiiiiiii',
    'aaaaaaaadaaaaaaa',
    'aaaaaaaadaaaaaaa',
    'aaaaaaaadaaaaaaa',
    'aaaaaaaadaaaaaaa',
    'aaaaaaaadaaaaaaa',
    'aaaaaaaadaaaaaaa',
    'dddddddddddddddd',
  ],

  'dev.wall.top': [
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
  ],

  'dev.wall.face': [
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
    'QQQQQQQQQQQQQQQQ',
    'QQQQQQQQQQQQQQQQ',
    'QQQQQQQQQQQQQQQQ',
    'QQQQQQQQQQQQQQQQ',
    'qqqqqqqqqqqqqqqq',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'vvvvvvvvvvvvvvvv',
    'JJJJJJJJJJJJJJJJ',
    'yyyyyyyyyyyyyyyy',
  ],

  'dev.window': [
    'JJJJJJJJJJJJJJJJ',
    'vvvvvvvvvvvvvvvv',
    'oooooooooooooooo',
    'nnnnnnnnnnnnnnnn',
    'nJJJJJJJJJJJJJJn',
    'nJVVVVVVnVVVVVJn',
    'nJVVVVVVnVVVVVJn',
    'nJVVVVVVnVVVVVJn',
    'nJnnnnnnnnnnnnJn',
    'nJVVVVVVnVVVVVJn',
    'nJVVVVVVnVVVVVJn',
    'nJVVVVVVnVVVVVJn',
    'nJJJJJJJJJJJJJJn',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'vvvvvvvvvvvvvvvv',
  ],

  'dev.curtain': [
    'JJJJJJJJJJJJJJJJ',
    'vvvvvvvvvvvvvvvv',
    'oooooooooooooooo',
    'nnnnnnnnnnnnnnnn',
    'JJJJJJJJJJJJJJJJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JzzZZzzZZzzZZzzJ',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'vvvvvvvvvvvvvvvv',
  ],

  'dev.bed.tl': [
    '..JJJJJJJJJJJJJJ',
    '.Jnnnnnnnnnnnnnn',
    'Jnnnnnnnnnnnnnnn',
    'JnnJJJJJJJJJJJJJ',
    'JnnJoooooooooooo',
    'JnnJnnnnnnnnnnnn',
    'JnnJnnnnnnnnnnnn',
    'JnnJnnnnnnnnnnnn',
    'JnnJnnnnnnnnnnnn',
    'JnnJoooooooooooo',
    'JnnJJJJJJJJJJJJJ',
    'Jnnnnnnnnnnnnnnn',
    'Jnnnnnnnnnnnnnnn',
    'Jnnnnnnnnnnnnnnn',
    'Jnnnnnnnnnnnnnnn',
    'Jnnnnnnnnnnnnnnn',
  ],

  'dev.bed.tr': [
    'JJJJJJJJJJJJJJ..',
    'nnnnnnnnnnnnnnJ.',
    'nnnnnnnnnnnnnnnJ',
    'JJJJJJJJJJJJJnnJ',
    'ooooooooooooJnnJ',
    'nnnnnnnnnnnnJnnJ',
    'nnnnnnnnnnnnJnnJ',
    'nnnnnnnnnnnnJnnJ',
    'nnnnnnnnnnnnJnnJ',
    'ooooooooooooJnnJ',
    'JJJJJJJJJJJJJnnJ',
    'nnnnnnnnnnnnnnnJ',
    'nnnnnnnnnnnnnnnJ',
    'nnnnnnnnnnnnnnnJ',
    'nnnnnnnnnnnnnnnJ',
    'nnnnnnnnnnnnnnnJ',
  ],

  'dev.bed.bl': [
    'Jnnnnnnnnnnnnnnn',
    'JnJJJJJJJJJJJJJJ',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJQQQQQQQQQQQQQ',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJjjjjjjjjjjjjj',
    'JnJJJJJJJJJJJJJJ',
    'Jnnnnnnnnnnnnnnn',
    '.Jnnnnnnnnnnnnnn',
    '..JJJJJJJJJJJJJJ',
  ],

  'dev.bed.br': [
    'nnnnnnnnnnnnnnnJ',
    'JJJJJJJJJJJJJJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'QQQQQQQQQQQQQJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'jjjjjjjjjjjjjJnJ',
    'JJJJJJJJJJJJJJnJ',
    'nnnnnnnnnnnnnnnJ',
    'nnnnnnnnnnnnnnJ.',
    'JJJJJJJJJJJJJJ..',
  ],

  'dev.sofa.l': [
    '................',
    '..JJJJJJJJJJJJJJ',
    '.Jzzzzzzzzzzzzzz',
    '.Jzzzzzzzzzzzzzz',
    '.JZZZZZZZZZZZZZZ',
    '.JJJJJJJJJJJJJJJ',
    '.Jzzzzzzzzzzzzzz',
    '.Jzzzzzzzzzzzzzz',
    '.Jzzzzzzzzzzzzzz',
    '.Jzzzzzzzzzzzzzz',
    '.Jzzzzzzzzzzzzzz',
    '.JZZZZZZZZZZZZZZ',
    '.JJJJJJJJJJJJJJJ',
    '..JJ..........JJ',
    '..JJ..........JJ',
    '................',
  ],

  'dev.sofa.m': [
    '................',
    'JJJJJJJJJJJJJJJJ',
    'zzzzzzzzzzzzzzzz',
    'zzzzzzzzzzzzzzzz',
    'ZZZZZZZZZZZZZZZZ',
    'JJJJJJJJJJJJJJJJ',
    'zzzzzzzJzzzzzzzz',
    'zzzzzzzJzzzzzzzz',
    'zzzzzzzJzzzzzzzz',
    'zzzzzzzJzzzzzzzz',
    'zzzzzzzJzzzzzzzz',
    'ZZZZZZZJZZZZZZZZ',
    'JJJJJJJJJJJJJJJJ',
    'JJ............JJ',
    'JJ............JJ',
    '................',
  ],

  'dev.sofa.r': [
    '................',
    'JJJJJJJJJJJJJJ..',
    'zzzzzzzzzzzzzzJ.',
    'zzzzzzzzzzzzzzJ.',
    'ZZZZZZZZZZZZZZJ.',
    'JJJJJJJJJJJJJJJ.',
    'zzzzzzzzzzzzzzJ.',
    'zzzzzzzzzzzzzzJ.',
    'zzzzzzzzzzzzzzJ.',
    'zzzzzzzzzzzzzzJ.',
    'zzzzzzzzzzzzzzJ.',
    'ZZZZZZZZZZZZZZJ.',
    'JJJJJJJJJJJJJJJ.',
    'JJ..........JJ..',
    'JJ..........JJ..',
    '................',
  ],

  'dev.plant': [
    '................',
    '......L..L......',
    '.....LL.LL......',
    '.L...Ll.lL...L..',
    '.LL.LLl.lLL.LL..',
    '..LLLLl.lLLLL...',
    '...lLLLLLLLl....',
    '.L..lLLLLLl..L..',
    '.LL..lLLLl..LL..',
    '..LLl.lLl.lLL...',
    '....l..L..l.....',
    '.......L........',
    '.....JJJJJJ.....',
    '.....JBbbBJ.....',
    '.....JBBBBJ.....',
    '.....JJJJJJ.....',
  ],

  'dev.table': [
    '................',
    '.....JJJJJJ.....',
    '...JJHHHHHHJJ...',
    '..JHHHHHHHHHHJ..',
    '.JHHHHHHHHHHHHJ.',
    '.JHHHHHHHHHHHHJ.',
    '.JHHHHHHHHHHHHJ.',
    '.JOOOOOOOOOOOOJ.',
    '..JOOOOOOOOOOJ..',
    '...JJOOOOOOJJ...',
    '.....JJJJJJ.....',
    '......JnnJ......',
    '......JnnJ......',
    '.....JnnnnJ.....',
    '.....JJJJJJ.....',
    '................',
  ],

  'dev.counter': [
    'JJJJJJJJJJJJJJJJ',
    'JnnnnnnnnnnnnnnJ',
    'JnnnnnnnnnnnnnnJ',
    'JvvvvvvvvvvvvvvJ',
    'JJJJJJJJJJJJJJJJ',
    'JooooooJoooooooJ',
    'JooooooJoooooooJ',
    'JonnnnoJonnnnnoJ',
    'JonnnnoJonnnnnoJ',
    'JonnnnoJonnnnnoJ',
    'JooooooJoooooooJ',
    'JooooooJoooooooJ',
    'JJJJJJJJJJJJJJJJ',
    'JvvvvvvvvvvvvvvJ',
    'JJJJJJJJJJJJJJJJ',
    '................',
  ],

  'dev.counter.unit': [
    'JJJJJJJJJJJJJJJJ',
    'JnnJJJJJJJJJJnnJ',
    'JnJvvvvvvvvvvJnJ',
    'JnJvIIIIIIIIvJnJ',
    'JnJvIIIIIIIIvJnJ',
    'JnJvvvvvvvvvvJnJ',
    'JnnJJJJJJJJJJnnJ',
    'JnnnnnnnnnnnnnnJ',
    'JJJJJJJJJJJJJJJJ',
    'JooooooJoooooooJ',
    'JooooooJoooooooJ',
    'JonnnnoJonnnnnoJ',
    'JooooooJoooooooJ',
    'JJJJJJJJJJJJJJJJ',
    'JvvvvvvvvvvvvvvJ',
    'JJJJJJJJJJJJJJJJ',
  ],

  'dev.desk.l': [
    '................',
    '.JJJJJJJJJJJJJJJ',
    '.Jnnnnnnnnnnnnnn',
    '.Jnnnnnnnnnnnnnn',
    '.Jnnnnnnnnnnnnnn',
    '.Jnnnnnnnnnnnnnn',
    '.Jnnnnnnnnnnnnnn',
    '.Joooooooooooooo',
    '.Jvvvvvvvvvvvvvv',
    '.JJJJJJJJJJJJJJJ',
    '..JJ............',
    '..JJ............',
    '..JJ............',
    '................',
    '................',
    '................',
  ],

  'dev.desk.r': [
    '................',
    'JJJJJJJJJJJJJJJ.',
    'nnnnnnnnnnnnnnJ.',
    'nnnnnnnnnnnnnnJ.',
    'nnnnnnnnnnnnnnJ.',
    'nnnnnnnnnnnnnnJ.',
    'nnnnnnnnnnnnnnJ.',
    'ooooooooooooooJ.',
    'vvvvvvvvvvvvvvJ.',
    'JJJJJJJJJJJJJJJ.',
    '............JJ..',
    '............JJ..',
    '............JJ..',
    '................',
    '................',
    '................',
  ],

  'dev.stairs': [
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'oooooooooooooooo',
    'JJJJJJJJJJJJJJJJ',
  ],

  'dev.rail': [
    'JJJJJ...........',
    'JnnnJ...........',
    'JjjjJ...........',
    'JQQQJ...........',
    'JjjjJ...........',
    'JnnnJ...........',
    'JjjjJ...........',
    'JQQQJ...........',
    'JjjjJ...........',
    'JnnnJ...........',
    'JjjjJ...........',
    'JQQQJ...........',
    'JjjjJ...........',
    'JnnnJ...........',
    'JjjjJ...........',
    'JJJJJ...........',
  ],

  'dev.rug': [
    'JJJJJJJJJJJJJJJJ',
    'JzzzzzzzzzzzzzzJ',
    'JZZZZZZZZZZZZZZJ',
    'JnnnnnnnnnnnnnnJ',
    'JZZZZZZZZZZZZZZJ',
    'JzzzzzzzzzzzzzzJ',
    'JzzzzzzzzzzzzzzJ',
    'JnnnnnnnnnnnnnnJ',
    'JzzzzzzzzzzzzzzJ',
    'JzzzzzzzzzzzzzzJ',
    'JZZZZZZZZZZZZZZJ',
    'JnnnnnnnnnnnnnnJ',
    'JZZZZZZZZZZZZZZJ',
    'JzzzzzzzzzzzzzzJ',
    'JzzzzzzzzzzzzzzJ',
    'JJJJJJJJJJJJJJJJ',
  ],

  'dev.edge.l': [
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnJ',
  ],

  'dev.edge.r': [
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
    'JnnnnnJAAAAAAAAA',
  ],

  'dev.edge.b': [
    'JJJJJJJJJJJJJJJJ',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'JJJJJJJJJJJJJJJJ',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
  ],

  'dev.corner.bl': [
    'AAAAAAAAAJnnnnnJ',
    'AAAAAAAAAJnnnnnn',
    'AAAAAAAAAJnnnnnn',
    'AAAAAAAAAJnnnnnn',
    'AAAAAAAAAJnnnnnn',
    'AAAAAAAAAJnnnnnn',
    'AAAAAAAAAJJJJJJJ',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
  ],

  'dev.corner.br': [
    'JnnnnnJAAAAAAAAA',
    'nnnnnnJAAAAAAAAA',
    'nnnnnnJAAAAAAAAA',
    'nnnnnnJAAAAAAAAA',
    'nnnnnnJAAAAAAAAA',
    'nnnnnnJAAAAAAAAA',
    'JJJJJJJAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
  ],

  'dev.void': [
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAA',
  ],
};

/** Tile keys that block movement. Everything else is walkable. */
export const SOLID = new Set([
  'wall.top', 'wall.face', 'desk.pc', 'desk.plain', 'bookshelf', 'plant',
  'counter', 'tree', 'water', 'bld.roof', 'bld.roof.edge', 'bld.wall',
  'bld.window', 'sign', 'fence',
  'dev.wall.top', 'dev.wall.face', 'dev.window', 'dev.curtain',
  'dev.void', 'dev.bed.tl', 'dev.bed.tr', 'dev.bed.bl',
  'dev.bed.br', 'dev.sofa.l', 'dev.sofa.m', 'dev.sofa.r',
  'dev.plant', 'dev.table', 'dev.counter', 'dev.counter.unit',
  'dev.desk.l', 'dev.desk.r', 'dev.rail',
  'dev.edge.l', 'dev.edge.r', 'dev.edge.b', 'dev.corner.bl',
  'dev.corner.br',
  'inner.wall.brick', 'inner.wall.brick.cream',
  // Kenney roguelike. Chairs are deliberately NOT solid -- an agent standing on
  // one reads as sitting at the table, which is the whole point of the room.
  'rl.ceil', 'rl.ceil.tl', 'rl.ceil.tr',
  'rl.wall.side', 'rl.wall.upper', 'rl.wall.face', 'rl.wall.bl', 'rl.wall.br',
  'rl.table.l', 'rl.table.m', 'rl.table.m2', 'rl.table.r',
  'rl.wardrobe.top', 'rl.wardrobe.base', 'rl.window', 'rl.candles',
]);

/**
 * Tiles that need a floor painted underneath them.
 *
 * Derived from the art rather than listed by hand: a tile needs a base only if
 * it has transparent pixels, and the art already knows which those are. The
 * hand-written version of this was two wall names, which silently stopped being
 * the full answer the moment a second wall set (dev.*) existed.
 */
export const NEEDS_BASE = new Set([
  ...Object.entries(ART)
    .filter(([, grid]) => grid.some((row) => row.includes('.')))
    .map(([name]) => name),
  // Sheet tiles cannot be derived the same way -- their transparency lives in
  // the PNG, not in an ART grid this file can inspect. Listed by hand, and only
  // the ones that actually have holes.
  'rl.rug.tl', 'rl.rug.t', 'rl.rug.tr',
  'rl.rug.l', 'rl.rug.c', 'rl.rug.r',
  'rl.rug.bl', 'rl.rug.b', 'rl.rug.br',
  'rl.table.l', 'rl.table.m', 'rl.table.m2', 'rl.table.r',
  'rl.chair.up', 'rl.chair.down',
  'rl.wardrobe.top', 'rl.wardrobe.base',
  'rl.window', 'rl.candles',
]);

export function tileKey(name) {
  return `t:${name}`;
}

function drawGrid(g, grid) {
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    for (let x = 0; x < row.length; x += 1) {
      const color = PAL[row[x]];
      if (color === null || color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** Generate every tile texture. Safe to call more than once. */
export function generateTileset(scene) {
  for (const [name, grid] of Object.entries(ART)) {
    const key = tileKey(name);
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    drawGrid(g, grid);
    g.generateTexture(key, TILE, TILE);
    g.destroy();
  }
}

/* ------------------------------------------------------------------ *
 * Tiles that come from the CC0 spritesheet instead of from ART.
 *
 * public/tiles/Inner.png is a 40x25 grid of 16x16 tiles, no margin, no
 * spacing (640x400). Values are [col, row] into that grid.
 *
 * The pack is furniture and props; it carries almost no room shell -- one
 * floor tile and two brick walls, which is why dev.* above still exists.
 * See public/tiles/ATTRIBUTION.md.
 * ------------------------------------------------------------------ */

export const SHEET_SRC = 'inner';
export const SHEET_PATH = 'tiles/Inner.png';
/** 640 / 16. Frame index is row * SHEET_COLS + col. */
export const SHEET_COLS = 40;

export const SHEET = {
  'inner.floor.check': [0, 0],
  'inner.wall.brick': [0, 1],
  'inner.wall.brick.cream': [0, 2],
};

/* ------------------------------------------------------------------
 * Kenney roguelike sheet (public/tiles/kenney/roguelike-sheet.png).
 *
 * Cells were not picked by eye. Kenney ships Tiled maps built from this exact
 * sheet (`Map/sample_indoor.tmx` in the pack); these are the tiles his own
 * rooms use, which is the only way to get the wall grammar right.
 *
 * That grammar: a wall is a THREE-ROW horizontal band, not one tile -- a
 * ceiling strip, then an upper face, then a lower face. `rl.wall.side` is a
 * single symmetric column used for BOTH left and right edges. Build a wall out
 * of anything else and it reads as a floor with a stripe on it.
 *
 * Geometry (57 cols, 1px spacing) lives in sheets.js; this is names to cells.
 * ------------------------------------------------------------------ */

export const RL_SRC = 'rl';

export const RL = {
  // shell
  'rl.ceil': [14, 12],
  'rl.ceil.tl': [16, 12],
  'rl.ceil.tr': [17, 12],
  'rl.wall.side': [15, 13],
  'rl.wall.upper': [18, 15],
  'rl.wall.face': [13, 15],
  'rl.wall.bl': [14, 15],
  'rl.wall.br': [16, 15],
  // floors
  'rl.floor.stone': [6, 2],
  'rl.floor.wood': [5, 2],
  // rug, as a 9-slice
  'rl.rug.tl': [10, 16], 'rl.rug.t': [11, 16], 'rl.rug.tr': [12, 16],
  'rl.rug.l': [10, 17], 'rl.rug.c': [11, 17], 'rl.rug.r': [12, 17],
  'rl.rug.bl': [10, 18], 'rl.rug.b': [11, 18], 'rl.rug.br': [12, 18],
  // furniture
  'rl.table.l': [19, 6], 'rl.table.m': [20, 6], 'rl.table.m2': [21, 6], 'rl.table.r': [22, 6],
  'rl.chair.up': [19, 3],
  'rl.chair.down': [20, 3],
  'rl.wardrobe.top': [26, 5],
  'rl.wardrobe.base': [26, 6],
  'rl.window': [42, 2],
  'rl.candles': [19, 8],
};

/**
 * Build a tile image, from whichever source owns that name.
 *
 * Callers keep referring to tile *names*; this is the one place that knows a
 * name might resolve to a spritesheet frame rather than a generated texture.
 * Frames are drawn straight from the loaded spritesheet rather than being cut
 * into per-tile canvas textures, which keeps this independent of the canvas
 * texture API.
 */
export function tileImage(scene, name, px, py) {
  const rl = RL[name];
  if (rl) return scene.add.image(px, py, RL_SRC, sheetFrame(RL_SRC, rl[0], rl[1]));
  const cell = SHEET[name];
  if (cell) return scene.add.image(px, py, SHEET_SRC, cell[1] * SHEET_COLS + cell[0]);
  return scene.add.image(px, py, tileKey(name));
}

/** Every legal tile name, from both sources. */
export const TILE_NAMES = [...Object.keys(ART), ...Object.keys(SHEET), ...Object.keys(RL)];

/** Exported so scripts/check-maps.mjs can prove every art char has a colour. */
export const PALETTE = PAL;
export const TILE_ART = ART;

export default { TILE, generateTileset, tileKey, tileImage, SOLID, TILE_NAMES };
