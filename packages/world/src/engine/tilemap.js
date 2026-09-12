import { TILE, tileImage, SOLID, NEEDS_BASE } from '../art/tiles.js';
import { pixelLabel } from '../art/font.js';

/**
 * Renders an ASCII map definition and answers collision questions.
 *
 * Depth rule: a tile's depth is its pixel Y, the same scheme the sprites use, so
 * a character walking in front of a desk or below a wall face sorts correctly
 * without a second render pass. Floors are pinned to depth 0.
 */
export class TileMap {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.height = def.grid.length;
    this.width = Math.max(...def.grid.map((r) => r.length));
    this.objects = [];
    this.labels = [];
  }

  get pixelWidth() {
    return this.width * TILE;
  }

  get pixelHeight() {
    return this.height * TILE;
  }

  charAt(tx, ty) {
    if (ty < 0 || ty >= this.height) return null;
    const row = this.def.grid[ty];
    if (tx < 0 || tx >= row.length) return null;
    return row[tx];
  }

  tileNameAt(tx, ty) {
    const ch = this.charAt(tx, ty);
    if (ch === null) return null;
    return this.def.legend[ch] ?? null;
  }

  /** Out-of-bounds counts as solid so the player can't walk off the map. */
  isSolid(tx, ty) {
    const name = this.tileNameAt(tx, ty);
    if (name === null) return true;
    const override = this.def.solid?.[this.charAt(tx, ty)];
    if (typeof override === 'boolean') return override;
    return SOLID.has(name);
  }

  warpAt(tx, ty) {
    return (this.def.warps ?? []).find((w) => w.x === tx && w.y === ty) ?? null;
  }

  signAt(tx, ty) {
    return (this.def.signs ?? []).find((s) => s.x === tx && s.y === ty) ?? null;
  }

  /** Which room (and therefore repo zone) a tile belongs to. */
  roomAt(tx, ty) {
    return (
      (this.def.rooms ?? []).find(
        (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h,
      ) ?? null
    );
  }

  roomForZone(zoneId) {
    return (this.def.rooms ?? []).find((r) => r.zone === zoneId) ?? null;
  }

  spotsForZone(zoneId) {
    return this.def.spots?.[zoneId] ?? null;
  }

  /**
   * Which floor an object stands on.
   *
   * Sampled from neighbours rather than fixed per map: a single interior has
   * several floors (the Engineering lobby is wood, its rooms are tiled), and a
   * hardcoded default put a bright tiled square under every plant in the wood
   * lobby. The tile below is checked first because that is where the floor
   * visually continues beneath an object.
   */
  baseFloorFor(tx, ty) {
    // An explicit `base` wins. Sampling neighbours is right for a plant on a
    // floor, but a wall-mounted tile has no walkable neighbour that is the
    // correct backdrop -- it would punch floor through the wall behind it.
    const named = this.def.base?.[this.charAt(tx, ty)];
    if (named) return named;

    const candidates = [
      [tx, ty + 1],
      [tx - 1, ty],
      [tx + 1, ty],
      [tx, ty - 1],
    ];
    for (const [cx, cy] of candidates) {
      const name = this.tileNameAt(cx, cy);
      if (name && !SOLID.has(name)) return name;
    }
    return this.def.kind === 'exterior' ? 'grass' : 'floor.tile';
  }

  draw() {
    const { legend } = this.def;

    for (let ty = 0; ty < this.height; ty += 1) {
      const row = this.def.grid[ty];
      for (let tx = 0; tx < row.length; tx += 1) {
        const name = legend[row[tx]];
        if (!name) continue;

        const px = tx * TILE;
        const py = ty * TILE;

        // Objects sit on a floor, so paint a floor beneath them — otherwise the
        // page background shows through their transparent pixels. Keyed on
        // transparency alone, NOT on solidity: a rug and a chair are walkable
        // and still have holes, and gating this on SOLID left them unbacked.
        if (NEEDS_BASE.has(name)) {
          tileImage(this.scene, this.baseFloorFor(tx, ty), px, py).setOrigin(0).setDepth(0);
        }

        const img = tileImage(this.scene, name, px, py).setOrigin(0);
        const isFloor = !SOLID.has(name);
        img.setDepth(isFloor ? 0 : py + TILE);
        this.objects.push(img);
      }
    }

    for (const label of this.def.labels ?? []) {
      this.labels.push(
        // A stroked cream label vanished against the light tiled floors of
        // the interiors; a solid plate reads on every surface.
        pixelLabel(this.scene, label.x * TILE + TILE / 2, label.y * TILE, label.text, {
          color: 0xffe9b8,
          backing: 'plate',
          originY: 0.5,
          depth: 20000,
        }),
      );
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    for (const l of this.labels) l.destroy();
    this.objects = [];
    this.labels = [];
  }
}

export default TileMap;
