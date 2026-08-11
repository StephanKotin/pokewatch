export const TCG_CDN = 'https://images.pokemontcg.io';

const TOKEN_KEY = 'pokewatch-token';

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handle401(r) {
  if (r.status === 401) {
    const hadToken = !!localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (hadToken) window.location.reload();
  }
}

export async function apiGet(path) {
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) { handle401(r); throw new Error(await r.text()); }
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) { handle401(r); throw new Error(await r.text()); }
  return r.json();
}

export async function apiPut(path, body) {
  const r = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) { handle401(r); throw new Error(await r.text()); }
  return r.json();
}

export async function apiDelete(path) {
  const r = await fetch(path, { method: 'DELETE', headers: authHeaders() });
  if (!r.ok) { handle401(r); throw new Error(await r.text()); }
  return r.json();
}

// Price cache: cacheKey -> { data, fetchedAt }
const priceCache = {};

export async function fetchPokeTracePrices(cardName, setName) {
  const cacheKey = (cardName + '|' + (setName || '')).toLowerCase();
  const cached = priceCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < 15 * 60 * 1000) return cached.data;

  try {
    const params = new URLSearchParams({ name: cardName });
    if (setName) params.set('set', setName);
    const res = await fetch(`/api/prices?${params}`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const json = await res.json();
    const card = (json.data || [])[0];
    if (!card) return null;
    priceCache[cacheKey] = { data: card, fetchedAt: Date.now() };
    return card;
  } catch (e) {
    console.warn('Price fetch failed:', e.message);
    return null;
  }
}

// Looks up a price for any PokeTrace tier field directly — works for raw
// tiers (NEAR_MINT, ...) and graded tiers (PSA_10, ...) alike, since both
// live in the same `prices[source][tier]` shape.
export function extractTierPrice(pokeTraceCard, tierField) {
  if (!tierField) return null;
  const sources = ['ebay', 'tcgplayer'];
  for (const src of sources) {
    const p = pokeTraceCard.prices?.[src]?.[tierField];
    if (p && p.avg) return { avg: p.avg, low: p.low || p.avg, high: p.high || p.avg, source: src };
  }
  return null;
}

export function extractGradePrice(pokeTraceCard, gradeKey, grades) {
  const grade = grades.find((g) => g.key === gradeKey);
  if (!grade) return null;
  return extractTierPrice(pokeTraceCard, grade.ptField);
}

// PokeTrace doesn't publish a fixed list of graded tier strings — they're
// only discoverable per card via /cards/{id}'s gradedOptions field, so this
// always reflects real, currently-priced tiers for this exact card rather
// than a guessed PSA/BGS/CGC list.
export async function fetchCardGrades(cardId) {
  return apiGet(`/api/cards/${encodeURIComponent(cardId)}/grades`);
}

// Catalogue: sets and cards come straight from PokeTrace via the server's
// cached /api/sets and /api/sets/:slug/cards proxies — no local database.
export async function fetchSets(game) {
  return apiGet(`/api/sets?game=${encodeURIComponent(game)}`);
}

export async function fetchSetCards(slug) {
  return apiGet(`/api/sets/${encodeURIComponent(slug)}/cards`);
}

export async function searchCards(name, number) {
  const params = new URLSearchParams({ name });
  if (number) params.set('number', number);
  return apiGet(`/api/cards/search?${params}`);
}

export async function searchListingsAPI(card) {
  const params = new URLSearchParams({ name: card.name });
  if (card.set) params.set('set', card.set);
  if (card.condition) params.set('condition', card.condition);
  if (card.maxPrice) params.set('maxPrice', card.maxPrice);
  const res = await fetch(`/api/listings?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((l) => ({
    id: l.id || l.title + l.price,
    title: l.title || 'Listing',
    price: l.price || 0,
    url: l.url || '#',
    type: l.type || 'buynow',
    timeLeft: l.timeLeft || null,
  }));
}
