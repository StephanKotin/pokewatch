import { useState, useEffect } from 'react';
import { apiGet } from '../api/poketrace';
import { CONDITION_TO_GRADE } from '../data/grades';

// Fetches PokeTrace's real price history for each watchlist card, keyed by
// the card's own grading tier, for the 30d trend sparkline.
export function useWatchlistPrices(watchlist) {
  const [priceData, setPriceData] = useState({});

  useEffect(() => {
    let cancelled = false;

    if (!watchlist.length) {
      setPriceData({});
      return;
    }

    // Commits each card's history to state as soon as it resolves rather
    // than waiting for the whole watchlist — see usePortfolioPrices for why.
    async function loadOne(card) {
      if (!card.name) return;

      const gradeKey = CONDITION_TO_GRADE[card.condition] || 'nm';
      const params = new URLSearchParams({ name: card.name, grade: gradeKey });
      if (card.set) params.set('set', card.set);
      if (card.edition) params.set('edition', card.edition);
      if (card.number) params.set('number', card.number);

      const history = await apiGet(`/api/price-history?${params}`).catch(() => []);
      if (!cancelled) {
        setPriceData((prev) => ({ ...prev, [card.id]: { history: history || [] } }));
      }
    }

    Promise.all(watchlist.map(loadOne));

    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  return { priceData };
}
