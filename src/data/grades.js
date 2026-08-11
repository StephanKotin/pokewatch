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

// Formats a raw PokeTrace graded-tier string for display. Confirmed live
// against /cards/{id}'s gradedOptions: half-grades are a second underscored
// segment ("BGS_9_5" for BGS 9.5), not a decimal, so joining everything
// after the company with dots ("PSA_10" -> "PSA 10", "BGS_9_5" -> "BGS 9.5")
// is required — a naive underscore-to-space replace would render "BGS 9 5".
export function formatGradeTier(tier) {
  if (!tier) return '';
  const [company, ...rest] = tier.split('_');
  return rest.length ? `${company} ${rest.join('.')}` : company;
}

// A perfect 10 is always the top-level numeric grade (never a half-grade —
// no company grades above 10), so matching the literal "_10" suffix is
// exact and doesn't need to account for BGS/CGC/etc.'s half-grade format.
export function isGradeTen(tier) {
  return !!tier && tier.endsWith('_10');
}

// Puts PSA tiers first (it's the grading company collectors weight most
// heavily), leaving every other tier in whatever order the API returned
// them — Array.sort is stable, so this only reorders the PSA/non-PSA split.
export function sortGradeOptions(tiers) {
  return [...(tiers || [])].sort((a, b) => {
    const aPsa = a.startsWith('PSA_') ? 0 : 1;
    const bPsa = b.startsWith('PSA_') ? 0 : 1;
    return aPsa - bPsa;
  });
}
