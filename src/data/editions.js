// Print-run edition, distinct from wear condition. Only ten WOTC-era sets
// had separate 1st Edition print runs — not the full 1999-2002 window
// (Base Set 2, Legendary Collection, Wizards Black Star Promos, and the
// E-Card sets are chronologically inside that window but were never
// printed with a 1st Edition stamp), so this is fixed real-world print
// history rather than something derivable from a date range or from
// PokeTrace's catalogue. Keyed by set name (stable across catalogue
// sources) rather than a set id.
export const EDITIONS = ['Unlimited', '1st Edition'];

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
