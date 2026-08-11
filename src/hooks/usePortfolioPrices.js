import { useState, useEffect } from 'react';
import { apiGet } from '../api/poketrace';

// Fetches live quotes + PokeTrace's real price history for each portfolio
// holding. Graded cards are keyed by their specific graded tier (e.g.
// "PSA_10"). Raw cards always price off the base ungraded ("nm"/NEAR_MINT)
// quote regardless of the recorded physical condition — PokeTrace's
// per-condition comps (LP/MP/HP/DMG) are too thin to trust as a distinct
// price point, so condition stays informational-only for raw cards.
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
      if (item.number) params.set('number', item.number);

      const historyParams = new URLSearchParams({ name: item.name });
      if (item.set) historyParams.set('set', item.set);
      if (item.edition) historyParams.set('edition', item.edition);
      if (item.number) historyParams.set('number', item.number);

      if (item.isGraded && item.gradeTier) {
        params.set('gradeTier', item.gradeTier);
        historyParams.set('gradeTier', item.gradeTier);
      } else {
        historyParams.set('grade', 'nm');
      }

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
