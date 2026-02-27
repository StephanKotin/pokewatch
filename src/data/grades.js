export const GRADES = [
  { key: 'nm',  label: 'Near Mint',      color: '#57cc99', ptField: 'NEAR_MINT',         defaultOn: true,  multiplier: 1.0  },
  { key: 'lp',  label: 'Lightly Played', color: '#ff9f1c', ptField: 'LIGHTLY_PLAYED',    defaultOn: false, multiplier: 0.75 },
  { key: 'mp',  label: 'Mod. Played',    color: '#a78bfa', ptField: 'MODERATELY_PLAYED', defaultOn: false, multiplier: 0.55 },
  { key: 'hp',  label: 'Heavily Played', color: '#f87171', ptField: 'HEAVILY_PLAYED',    defaultOn: false, multiplier: 0.35 },
  { key: 'dmg', label: 'Damaged',        color: '#94a3b8', ptField: 'DAMAGED',           defaultOn: false, multiplier: 0.2  },
];

export const CONDITIONS = [
  'Near Mint',
  'Lightly Played',
  'Mod. Played',
  'Heavily Played',
  'Damaged',
];

export const CONDITION_TO_GRADE = {
  'Near Mint': 'nm',
  'Lightly Played': 'lp',
  'Mod. Played': 'mp',
  'Heavily Played': 'hp',
  'Damaged': 'dmg',
};

export const CONDITION_MULTIPLIER = {
  'Near Mint': 1.0,
  'Lightly Played': 0.8,
  'Mod. Played': 0.6,
  'Heavily Played': 0.4,
  'Damaged': 0.25,
};
