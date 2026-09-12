# Third-party art

## Inner.png

- **Pack**: "Zelda-like tilesets and sprites" (`gfx.zip`), file `Inner.png`
- **Author**: ArMM1998
- **Source**: https://opengameart.org/content/zelda-like-tilesets-and-sprites
- **Licence**: **CC0** (public domain dedication) — verified in the licence field
  of the source page on 2026-09-11. No attribution is *required*; this file
  records provenance anyway so the next person does not have to re-derive it.
- **Grid**: 640x400 = 40x25 tiles at 16x16, no margin, no spacing.

### What it does and does not contain

It is a **furniture and props** sheet. It has beds, tables, chairs, shelves,
cabinets, plants, rugs, a fireplace, stairs, doors and windows.

It contains almost **no room shell**: one checkered floor tile (0,0) and two
brick wall tiles (0,1), (0,2). There is no wall-top/wall-face pair, no floor
variety, and no wall corners. The floors, walls and edges in `dev.*` in
`src/art/tiles.js` are generated locally for exactly that reason — they are not
stylistic preference, they are the missing half of this tileset.

---

## `kenney/` — Kenney packs

- **Author**: Kenney (Kenney Vleugels), https://kenney.nl — the roguelike pack
  additionally credits Lynn Evers.
- **Licence**: **CC0** on every pack below, verified from the `License.txt`
  shipped inside each zip (vendored here as `LICENSE-*.txt`, not just linked, so
  the claim survives kenney.nl changing). Crediting is explicitly *not*
  mandatory; recorded anyway.
- **Downloaded**: 2026-09-11.

Geometry for all of these is declared in `src/art/sheets.js` and asserted
against the real PNG headers by `npm run check:sheets`. Do not hand-copy grid
numbers out of this file — read them from there.

| File | Pack | Grid | Tile | Spacing |
|---|---|---|---|---|
| `roguelike-sheet.png` | Roguelike/RPG pack | 57×31 (1767) | 16px | **1px** |
| `roguelike-chars.png` | Roguelike Characters 2.0 | 54×12 (648) | 16px | **1px** |
| `tiny-town.png` | Tiny Town 1.1 | 12×11 (132) | 16px | 0 |
| `tiny-dungeon.png` | Tiny Dungeon 1.0 | 12×11 (132) | 16px | 0 |
| `ui-large.png` | UI Pack – Pixel Adventure 2.0 | 13×7 (91) | 32px | 0 |
| `ui-small.png` | UI Pack – Pixel Adventure 2.0 | 23×7 (161) | 16px | 0 |

**The 1px spacing is the trap.** The two roguelike sheets are from 2015 and
ship spaced only. Loading them with Phaser's default options silently shears
every frame progressively across the sheet — fine at column 0, unusable by
column 56, and it never throws. `preloadSheets()` in `src/art/sheets.js` passes
`spacing` for you; use it instead of `this.load.spritesheet`. The `tiny-*` and
`ui-*` files are Kenney's `tilemap_packed.png` variants, which are unspaced —
that is why the manifest's `spacing` is not uniform.

### What these do and do not contain

`roguelike-sheet.png` is the one that matters. Unlike `Inner.png` above, it
**does** carry a full room shell: wall faces, wall tops, roofs, corners and
door/window inserts in four colourways (cols 13–40, rows 12–24), plus terrain
with proper corner sets (cols 0–9), furniture (cols 12–40, rows 0–11), market
stalls and props (cols 41–53), and UI panels and progress bars (rows 25–30).
It is the only vendored sheet that could carry the whole world on its own.

It is also, unavoidably, **medieval fantasy**. In 1767 tiles there is not one
computer, monitor, office desk or anything else that reads as modern work. A
room built from it becomes a guild hall, not an office — see
`src/maps/devroomRl.js`, which is exactly that comparison. Adopting this sheet
wholesale is therefore a decision about what the world *is*, not just how it is
drawn. The generated `desk.pc` in `src/art/tiles.js` has no equivalent here.

`roguelike-chars.png` is **not a walk cycle**. It is a front-facing paper-doll
kit — bodies in cols 0–1, then armour, helmets, hats, shields and weapons as
separate layers to composite on top. Every body is drawn face-on only; there
are no side or back frames, so it cannot animate a agent walking north. The two
body columns are the same characters with mouth closed and open, which is a
usable 2-frame talking animation for dialogue portraits. Directional movement
still needs either the generated characters in `src/art/textures.js` or a
different pack.

`tiny-town.png` and `tiny-dungeon.png` are a **different, chunkier art style**
than the roguelike sheet — thicker outlines, flatter shading, fewer corner
tiles. They are vendored for evaluation. Mixing them with the roguelike sheet
in one room will read as a mistake, not as variety.
