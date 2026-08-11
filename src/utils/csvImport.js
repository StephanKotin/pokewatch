import { CONDITIONS } from '../data/grades';

// --- CSV parsing (handles quoted fields, commas and quotes inside them) ---

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // ignore; \n (or end of text) closes the row
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// --- header -> canonical field mapping ---

const HEADER_ALIASES = {
  'card name': 'name',
  name: 'name',
  set: 'set',
  'set name': 'set',
  'card number': 'number',
  number: 'number',
  '#': 'number',
  condition: 'condition',
  grade: 'condition',
  'purchase price': 'purchasePrice',
  price: 'purchasePrice',
  cost: 'purchasePrice',
  'purchase date': 'purchaseDate',
  date: 'purchaseDate',
  quantity: 'quantity',
  qty: 'quantity',
  notes: 'notes',
  note: 'notes',
  'card id': 'cardId',
  cardid: 'cardId',
  edition: 'edition',
  print: 'edition',
};

export function rowsFromCSV(text) {
  const raw = parseCSV(text);
  if (!raw.length) return [];

  const fieldMap = raw[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || null);

  return raw
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells, idx) => {
      const row = { _line: idx + 2 };
      fieldMap.forEach((field, i) => {
        if (field) row[field] = (cells[i] || '').trim();
      });
      return row;
    });
}

// --- field normalization ---

const CONDITION_ALIASES = {
  nm: 'Near Mint', mint: 'Near Mint', m: 'Near Mint', 'near mint': 'Near Mint',
  lp: 'Lightly Played', 'lightly played': 'Lightly Played',
  mp: 'Mod. Played', 'moderately played': 'Mod. Played', 'mod played': 'Mod. Played', 'mod. played': 'Mod. Played',
  hp: 'Heavily Played', 'heavily played': 'Heavily Played',
  dmg: 'Damaged', damaged: 'Damaged', poor: 'Damaged',
};

export function normalizeCondition(raw) {
  if (!raw) return 'Near Mint';
  const key = raw.trim().toLowerCase();
  if (CONDITION_ALIASES[key]) return CONDITION_ALIASES[key];
  const exact = CONDITIONS.find((c) => c.toLowerCase() === key);
  return exact || 'Near Mint';
}

export function normalizePrice(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const FIRST_EDITION_ALIASES = new Set(['1st edition', '1st ed', '1st', 'first edition', 'firsted']);

// Only meaningful for the ~10 WOTC-era sets that had a 1st Edition print
// run; the caller is expected to gate this against the matched card's set.
export function normalizeEdition(raw) {
  if (!raw) return 'Unlimited';
  return FIRST_EDITION_ALIASES.has(raw.trim().toLowerCase()) ? '1st Edition' : 'Unlimited';
}

export function normalizeQuantity(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function normalizeDate(raw) {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// --- card matching against PokeTrace ---

// Resolves a CSV "set" column value against the live set list fetched from
// PokeTrace (/api/sets) — the caller fetches that list once per import and
// passes it in, since resolution here needs to stay synchronous.
//
// WOTC-era sets now appear as 2-3 entries sharing one `name` (one per print
// edition — see WOTC_SET_EDITIONS in server.js), so a name match is no
// longer guaranteed unique. Picking the first match would silently always
// resolve to the same edition regardless of what the CSV row actually says,
// collapsing the ambiguous-match UI that otherwise lets the user pick the
// right print. Returning null instead falls back to the caller's
// cross-catalogue search path, which matches by name+number across every
// edition and preserves that disambiguation.
export function resolveSetSlug(setName, sets) {
  if (!setName) return null;
  const key = setName.trim().toLowerCase();
  const matches = sets.filter((s) => s.name.toLowerCase() === key);
  return matches.length === 1 ? matches[0].slug : null;
}

// Collectors commonly write card numbers as "215/203" (number/print-run
// size) and annotate variant prints in the name itself, e.g. "Umbreon VMAX
// (alt art)" — the catalogue has no such name, it distinguishes that print
// from the base VMAX purely by number (215) and rarity. Strip both down to
// what the catalogue actually stores before comparing.
export function normalizeCardNumber(raw) {
  if (!raw) return '';
  return raw.split('/')[0].trim().replace(/^0+(?=\d)/, '');
}

function stripNameQualifiers(name) {
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

const MAX_CANDIDATES = 8;

// Matches one parsed CSV row against `cards`, a flat list of PokeTrace cards
// the caller has already fetched (either one set's cards, when row.set
// resolved to a slug, or cross-catalogue search results otherwise). Each
// entry is expected in the normalized shape { id, name, number, rarity,
// image, setSlug, setName } — see normalizeApiCard in Portfolio.jsx.
// Returns { status: 'matched' | 'ambiguous' | 'unmatched', candidates }.
export function matchCard(row, cards) {
  if (row.cardId) {
    const found = cards.find((c) => c.id === row.cardId) || null;
    return found
      ? { status: 'matched', candidates: [found] }
      : { status: 'unmatched', candidates: [] };
  }

  if (!row.name) return { status: 'unmatched', candidates: [] };
  const nameKey = stripNameQualifiers(row.name).toLowerCase();
  const numberKey = normalizeCardNumber(row.number);

  let candidates = cards.filter((c) => c.name.toLowerCase() === nameKey);

  if (numberKey && candidates.length > 1) {
    const byNumber = candidates.filter((c) => normalizeCardNumber(c.number) === numberKey);
    if (byNumber.length) candidates = byNumber;
  }

  if (candidates.length === 1) return { status: 'matched', candidates };
  if (candidates.length > 1) return { status: 'ambiguous', candidates: candidates.slice(0, MAX_CANDIDATES) };
  return { status: 'unmatched', candidates: [] };
}
