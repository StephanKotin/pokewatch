// Era classification for the Catalogue page's grouped view. PokeTrace's own
// Set object has no series/era field (confirmed live: not present on any
// entry), so this is keyed on the `series` value the server merges onto
// each PokeTrace set from pokemontcg.io's public set list where a name
// match exists (see server.js's /api/sets route and
// getPokemonTcgIoSetsByName) — PokeTrace sets with no match, or any set
// this table doesn't recognize, fall into the "Other Sets" bucket below.
export const ERA_MAP = {
  'Mega Evolution': { key: 'me', label: 'Mega Evolution', color: '#ff4d94' },
  'Scarlet & Violet': { key: 'sv', label: 'Scarlet & Violet', color: '#e63946' },
  'Sword & Shield': { key: 'swsh', label: 'Sword & Shield', color: '#4cc9f0' },
  'Sun & Moon': { key: 'sm', label: 'Sun & Moon', color: '#ff9f1c' },
  'XY': { key: 'xy', label: 'XY', color: '#a78bfa' },
  'Black & White': { key: 'bw', label: 'Black & White', color: '#57cc99' },
  // pokemontcg.io spells this with an ampersand, unlike the display label.
  'HeartGold & SoulSilver': { key: 'hgss', label: 'HeartGold SoulSilver', color: '#f9e100' },
  'Diamond & Pearl': { key: 'dp', label: 'Diamond & Pearl', color: '#6b9fff' },
  // pokemontcg.io splits Platinum into its own series; folded back into
  // Diamond & Pearl to match how this app has always grouped it.
  'Platinum': { key: 'dp', label: 'Diamond & Pearl', color: '#6b9fff' },
  'EX': { key: 'ex', label: 'EX Series', color: '#ff6b9d' },
  'E-Card': { key: 'wotc', label: 'Classic (WotC)', color: '#ffd700' },
  'Neo': { key: 'wotc', label: 'Classic (WotC)', color: '#ffd700' },
  'Gym': { key: 'wotc', label: 'Classic (WotC)', color: '#ffd700' },
  'Base': { key: 'wotc', label: 'Classic (WotC)', color: '#ffd700' },
};

const OTHER_ERA = { key: 'other', label: 'Other Sets', color: '#6b6b80' };

export function getEra(series) {
  return (series && ERA_MAP[series]) || OTHER_ERA;
}
