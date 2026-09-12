/**
 * An empty department building.
 *
 * Marketing, product and support are real, enterable places with nobody in them
 * yet. That is deliberate: the org's intended shape should be visible by walking
 * the campus, and when a department gets agents it becomes a proper map without
 * anything else changing.
 */
export function placeholderBuilding({ id, name, blurb, returnTo }) {
  return {
    id,
    name,
    kind: 'interior',
    department: id,
    placeholder: true,

    legend: {
      '#': 'wall.top',
      '=': 'wall.face',
      ':': 'floor.tile',
      H: 'plant',
      B: 'bookshelf',
      K: 'counter',
      '<': 'door.mat',
    },

    grid: [
      '###############',
      '===============',
      '#:::::::::::::#',
      '#:H:::::::::H:#',
      '#:::::::::::::#',
      '#::::KKKKK::::#',
      '#:::::::::::::#',
      '#:B:::::::::B:#',
      '#:::::::::::::#',
      '#::::::<::::::#',
      '###############',
    ],

    rooms: [{ id: 'floor', label: name.toUpperCase(), zone: null, x: 1, y: 2, w: 13, h: 7 }],
    home: [],
    spots: {},

    // Exit is the doormat; it returns to the path tile below this building's
    // own front door on the campus.
    warps: [{ x: 7, y: 9, to: 'overworld', tx: returnTo.x, ty: returnTo.y, facing: 'down' }],

    signs: [{ x: 7, y: 5, text: `${name.toUpperCase()}\n${blurb}` }],
    labels: [{ x: 7, y: 2.6, text: name.toUpperCase() }],
  };
}

export default placeholderBuilding;
