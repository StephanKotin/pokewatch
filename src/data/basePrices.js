export const BASE_PRICES = {
  'charizard':           700,
  'pikachu illustrator': 900000,
  'pikachu':             80,
  'blastoise':           400,
  'venusaur':            300,
  'mewtwo':              200,
  'gengar':              160,
  'umbreon':             140,
  'rayquaza':            80,
  'lugia':               160,
  'ho-oh':               120,
};

export function getRawBasePrice(name) {
  const low = (name || '').toLowerCase();
  for (const [key, price] of Object.entries(BASE_PRICES)) {
    if (low.includes(key)) return price;
  }
  return 60;
}

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGradeSales(cardId, gradeKey, baseRawPrice, multiplier) {
  const seedStr = cardId + gradeKey;
  const seedNum =
    seedStr.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0) * 1009;
  const rand = mulberry32(seedNum);

  const basePrice = baseRawPrice * multiplier;
  const days = 30;
  const now = Date.now();
  const sales = [];

  let price = basePrice * (0.88 + rand() * 0.24);
  const trend = (rand() - 0.47) * 0.006;
  const vol = 0.07 + rand() * 0.1;

  for (let i = days; i >= 0; i--) {
    const dayStart = now - i * 86400000;
    const n = rand() < 0.35 ? 0 : Math.floor(rand() * 3) + 1;
    for (let s = 0; s < n; s++) {
      const noise = 1 + (rand() - 0.5) * vol * 2;
      price = Math.max(basePrice * 0.2, price * (1 + trend) * noise);
      sales.push({
        t: dayStart + rand() * 86400000,
        price: Math.round(price),
        grade: gradeKey,
        type: rand() > 0.45 ? 'buynow' : 'auction',
      });
    }
  }
  if (sales.length < 6) {
    for (let i = days; i >= 0; i -= Math.ceil(days / 8)) {
      price = basePrice * (0.85 + rand() * 0.3);
      sales.push({
        t: now - i * 86400000 + rand() * 86400000,
        price: Math.round(price),
        grade: gradeKey,
        type: 'buynow',
      });
    }
  }
  return sales.sort((a, b) => a.t - b.t);
}

export function computeStats(sales, days) {
  const cutoff = Date.now() - days * 86400000;
  const filtered = sales.filter((s) => s.t >= cutoff);
  if (!filtered.length) return null;
  const prices = filtered.map((s) => s.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const third = Math.ceil(filtered.length / 3);
  const earlyAvg =
    filtered
      .slice(0, third)
      .map((s) => s.price)
      .reduce((a, b) => a + b, 0) / Math.max(third, 1);
  const lateAvg =
    filtered
      .slice(-third)
      .map((s) => s.price)
      .reduce((a, b) => a + b, 0) / Math.max(third, 1);
  const trendPct = ((lateAvg - earlyAvg) / earlyAvg) * 100;
  return { avg, min, max, low: min, high: max, count: filtered.length, trendPct, data: filtered };
}

export function generateAllGrades(card, grades) {
  const base = getRawBasePrice(card.name);
  const result = {};
  grades.forEach((g) => {
    result[g.key] = generateGradeSales(card.id, g.key, base, g.multiplier);
  });
  return result;
}
