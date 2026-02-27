export const ERA_MAP = {
  'Scarlet & Violet':     { key: 'sv',   label: 'Scarlet & Violet',    color: '#e63946' },
  'Sword & Shield':       { key: 'swsh', label: 'Sword & Shield',      color: '#4cc9f0' },
  'Sun & Moon':           { key: 'sm',   label: 'Sun & Moon',          color: '#ff9f1c' },
  'XY':                   { key: 'xy',   label: 'XY',                  color: '#a78bfa' },
  'Black & White':        { key: 'bw',   label: 'Black & White',       color: '#57cc99' },
  'HeartGold SoulSilver': { key: 'hgss', label: 'HeartGold SoulSilver',color: '#f9e100' },
  'Diamond & Pearl':      { key: 'dp',   label: 'Diamond & Pearl',     color: '#6b9fff' },
  'EX':                   { key: 'ex',   label: 'EX Series',           color: '#ff6b9d' },
  'E-Card':               { key: 'wotc', label: 'Classic (WotC)',      color: '#ffd700' },
  'Neo':                  { key: 'wotc', label: 'Classic (WotC)',      color: '#ffd700' },
  'Gym':                  { key: 'wotc', label: 'Classic (WotC)',      color: '#ffd700' },
  'Base':                 { key: 'wotc', label: 'Classic (WotC)',      color: '#ffd700' },
};

export const ERAS = Object.values(ERA_MAP).filter(
  (e, i, a) => a.findIndex((x) => x.key === e.key) === i
);

export function getEra(setSeries) {
  return ERA_MAP[setSeries] || { key: 'other', label: 'Other Sets', color: '#6b6b80' };
}
