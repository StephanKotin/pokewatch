// Print-run edition, distinct from wear condition. Only the WOTC-era sets
// (1999-2002) had separate 1st Edition print runs; every set since has been
// unlimited-only, so the selector only makes sense for these.
export const EDITIONS = ['Unlimited', '1st Edition'];

export const EDITION_ELIGIBLE_SET_IDS = [
  'base1',  // Base Set
  'jungle', // Jungle
  'fossil', // Fossil
  'base5',  // Team Rocket
  'gym1',   // Gym Heroes
  'gym2',   // Gym Challenge
  'neo1',   // Neo Genesis
  'neo2',   // Neo Discovery
  'neo3',   // Neo Revelation
  'neo4',   // Neo Destiny
];

export function isEditionEligible(setId) {
  return EDITION_ELIGIBLE_SET_IDS.includes(setId);
}
