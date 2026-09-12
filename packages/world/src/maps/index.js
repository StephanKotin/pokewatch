import { overworld } from './overworld.js';
import { devroom } from './devroom.js';
import { devroomRl } from './devroomRl.js';
import { engineering } from './engineering.js';
import { placeholderBuilding } from './placeholder.js';

/**
 * Map registry.
 *
 * Adding a department is adding a map and one building on the overworld — no
 * engine changes. The departments that don't exist yet are real, enterable
 * buildings with a placeholder interior, so the org's shape is visible from day
 * one rather than implied.
 *
 * Warp coordinates are paired by hand and checked by scripts/check-maps.mjs.
 * Two rules keep them from ping-ponging:
 *   1. arrival is one tile INSIDE the door, never on the door tile itself
 *   2. every building's exit returns to the path tile below its own front door
 */

export const MAPS = {
  overworld,
  devroom,
  // Style prototype, reachable through the dev room's east door. Not part of
  // the org map -- it exists to compare tilesets, and should leave with the
  // decision it is there to inform.
  devroomRl,
  engineering,
  marketing: placeholderBuilding({
    id: 'marketing',
    name: 'Marketing',
    blurb: 'Nobody has moved in yet.\nNo agents are assigned here.',
    returnTo: { x: 18, y: 6 },
  }),
  product: placeholderBuilding({
    id: 'product',
    name: 'Product Development',
    blurb: 'Nobody has moved in yet.\nNo agents are assigned here.',
    returnTo: { x: 6, y: 17 },
  }),
  support: placeholderBuilding({
    id: 'support',
    name: 'Customer Support',
    blurb: 'Nobody has moved in yet.\nNo agents are assigned here.',
    returnTo: { x: 18, y: 17 },
  }),
};

export function getMap(id) {
  return MAPS[id] ?? null;
}

/**
 * Start inside the dev room, because that is the thing being built right now.
 * Walking out of its doorway puts you on the campus path below the Engineering
 * door, so the rest of the world stays reachable.
 */
export const START = { map: 'devroom', x: 7, y: 6, facing: 'down' };

export default MAPS;
