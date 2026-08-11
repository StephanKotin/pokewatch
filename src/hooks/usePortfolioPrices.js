import { useState, useEffect } from 'react';
import { apiGet } from '../api/poketrace';
import { CONDITION_TO_GRADE } from '../data/grades';

// Fetches live quotes + PokeTrace's real price history for each portfolio
// holding, keyed by the item's own grading tier (raw condition -> short key).
export function usePortfolioPrices(portfolio) {
  const [priceData, setPriceData] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!portfolio.length) {
      setPriceData({});
      return;
    }

    setLoading(true);
    // Each card's fetch commits to state as soon as it resolves, rather than
    // waiting on Promise.all for the whole portfolio — with a few hundred
    // cards funneled through the server's PokeTrace rate limiter, that batch
    // can take a minute or more, and an all-or-nothing update makes the page
    // look empty/broken the entire time instead of filling in progressively.
    async function loadOne(item) {
      if (!item.name) return;

      const params = new URLSearchParams({ name: item.name });
      if (item.set) params.set('set', item.set);
      if (item.cardId) params.set('cardId', item.cardId);
      if (item.edition) params.set('edition', item.edition);

      const gradeKey = CONDITION_TO_GRADE[item.condition] || 'nm';
      const historyParams = new URLSearchParams({ name: item.name, grade: gradeKey });
      if (item.set) historyParams.set('set', item.set);
      if (item.edition) historyParams.set('edition', item.edition);

      const [history, live] = await Promise.all([
        apiGet(`/api/price-history?${historyParams}`).catch(() => []),
        apiGet(`/api/prices?${params}`).catch(() => null),
      ]);
      const card = (live?.data || [])[0] || null;
      if (!cancelled) {
        setPriceData((prev) => ({ ...prev, [item.id]: { history: history || [], live: card } }));
      }
    }

    Promise.all(portfolio.map(loadOne)).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [portfolio]);

  return { priceData, loading };
}
