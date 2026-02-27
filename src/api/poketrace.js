const TCG_API = 'https://api.pokemontcg.io/v2';
export const TCG_CDN = 'https://images.pokemontcg.io';

export async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiDelete(path) {
  const r = await fetch(path, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
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

export function extractGradePrice(pokeTraceCard, gradeKey, grades) {
  const grade = grades.find((g) => g.key === gradeKey);
  if (!grade) return null;
  const sources = ['ebay', 'tcgplayer'];
  for (const src of sources) {
    const p = pokeTraceCard.prices?.[src]?.[grade.ptField];
    if (p && p.avg) return { avg: p.avg, low: p.low || p.avg, high: p.high || p.avg, source: src };
  }
  return null;
}

export async function fetchTCGCards(setId, apiKey) {
  const headers = apiKey ? { 'X-Api-Key': apiKey } : {};
  let page = 1;
  let allCards = [];
  while (true) {
    const res = await fetch(
      `${TCG_API}/cards?q=set.id:${setId}&orderBy=number&pageSize=250&page=${page}`,
      { headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cards = data.data || [];
    allCards = allCards.concat(cards);
    if (allCards.length >= (data.totalCount || 0) || cards.length === 0) break;
    page++;
  }
  return allCards;
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
