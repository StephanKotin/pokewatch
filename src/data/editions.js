// Print-run edition, distinct from wear condition. Only ten WOTC-era sets
// had separate 1st Edition print runs — not the full 1999-2002 window
// (Base Set 2, Legendary Collection, Wizards Black Star Promos, and the
// E-Card sets are chronologically inside that window but were never
// printed with a 1st Edition stamp), so this is fixed real-world print
// history rather than something derivable from a date range or from
// PokeTrace's catalogue. Keyed by set name (stable across catalogue
// sources) rather than a set id.
export const EDITIONS = ['Unlimited', '1st Edition'];

// Base Set's first print run predates Wizards adding the "shadow" box
// around the copyright line — real, set-specific print history rather than
// a wear condition. Shadowless only ever happened for Base Set among the
// WOTC sets, and every Base Set 1st Edition card was printed on that same
// shadowless stock (there's no non-shadowless 1st Edition Base Set card),
// so "1st Edition" alone is ambiguous for this set in a way it isn't for
// the other nine.
const BASE_SET_EDITIONS = ['Unlimited', 'Shadowless', '1st Edition Shadowless'];

const EDITION_ELIGIBLE_SET_NAMES = new Set([
  'Base Set',
  'Jungle',
  'Fossil',
  'Team Rocket',
  'Gym Heroes',
  'Gym Challenge',
  'Neo Genesis',
  'Neo Discovery',
  'Neo Revelation',
  'Neo Destiny',
]);

export function isEditionEligible(setName) {
  return EDITION_ELIGIBLE_SET_NAMES.has(setName);
}

export function editionsForSet(setName) {
  return setName === 'Base Set' ? BASE_SET_EDITIONS : EDITIONS;
}
