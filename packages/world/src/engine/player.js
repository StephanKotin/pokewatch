import { TILE } from '../art/tiles.js';
import { frameKey, registerAnimations } from '../art/textures.js';

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** ms to cross one tile. GBA walking is ~16px per 8 frames at 60fps. */
const STEP_MS = 140;

/**
 * Grid-locked player, GBA-style.
 *
 * Two behaviours matter for the feel:
 *  - a key tap while facing a different way TURNS first without moving, so you
 *    can face a thing to talk to it without stepping into it
 *  - movement is tile-to-tile and uninterruptible once begun, which is what
 *    makes the grid feel solid rather than floaty
 */
export class Player {
  constructor(scene, { tx, ty, facing = 'down', map }) {
    this.scene = scene;
    this.map = map;
    this.tx = tx;
    this.ty = ty;
    this.facing = facing;
    this.moving = false;
    this.frame = 0;

    registerAnimations(scene, 'player');

    this.sprite = scene.add
      .sprite(tx * TILE + TILE / 2, ty * TILE + TILE, frameKey('player', 'down', 0))
      .setOrigin(0.5, 1)
      .setDepth(ty * TILE + TILE);
  }

  get pixelX() {
    return this.tx * TILE + TILE / 2;
  }

  get pixelY() {
    return this.ty * TILE + TILE;
  }

  /** The tile the player is looking at — what interaction acts on. */
  facingTile() {
    const d = DIRS[this.facing];
    return { tx: this.tx + d.dx, ty: this.ty + d.dy };
  }

  setMap(map, tx, ty, facing) {
    this.map = map;
    this.tx = tx;
    this.ty = ty;
    this.facing = facing ?? this.facing;
    this.moving = false;
    this.sprite.setPosition(this.pixelX, this.pixelY).setDepth(this.pixelY);
    this.sprite.setTexture(frameKey('player', this.poseFor(this.facing), 0));
    this.sprite.setFlipX(this.facing === 'left');
  }

  poseFor(facing) {
    if (facing === 'up') return 'up';
    if (facing === 'down') return 'down';
    return 'side';
  }

  /**
   * @returns {'moved'|'turned'|'blocked'|'busy'}
   */
  tryMove(facing, { onArrive } = {}) {
    if (this.moving) return 'busy';

    // Turn in place first — this is what lets you face an NPC to talk to it.
    if (this.facing !== facing) {
      this.facing = facing;
      this.sprite.setTexture(frameKey('player', this.poseFor(facing), 0));
      this.sprite.setFlipX(facing === 'left');
      return 'turned';
    }

    const d = DIRS[facing];
    const nx = this.tx + d.dx;
    const ny = this.ty + d.dy;

    if (this.map.isSolid(nx, ny) || this.scene.isOccupied?.(nx, ny)) {
      this.sprite.setTexture(frameKey('player', this.poseFor(facing), 0));
      return 'blocked';
    }

    this.moving = true;
    this.tx = nx;
    this.ty = ny;

    // Alternate the stepping foot each tile, like the 2-frame GBA walk cycle.
    this.frame = this.frame === 1 ? 2 : 1;
    this.sprite.setTexture(frameKey('player', this.poseFor(facing), this.frame));

    this.scene.tweens.add({
      targets: this.sprite,
      x: this.pixelX,
      y: this.pixelY,
      duration: STEP_MS,
      ease: 'Linear',
      onUpdate: () => this.sprite.setDepth(this.sprite.y),
      onComplete: () => {
        this.moving = false;
        this.sprite.setTexture(frameKey('player', this.poseFor(this.facing), 0));
        this.sprite.setDepth(this.pixelY);
        onArrive?.(this.tx, this.ty);
      },
    });

    return 'moved';
  }
}

export default Player;
