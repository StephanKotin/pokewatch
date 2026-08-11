import { useState, useEffect } from 'react';
import { apiGet } from '../api/poketrace';

function priceKeyFor(item) {
  const base = (item.cardId || item.name || '').toLowerCase();
  if (!base) return '';
  // Matches the server's snapshot keying: 1st Edition copies of a card are
  // priced and stored separately from Unlimited copies of the same card_id.
  return item.edition && item.edition !== 'Unlimited' ? `${base}-1st` : base;
}

// Fetches live quotes + stored price history for each portfolio holding,
// keyed by the same card_id the server uses for price_snapshots.
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
    async function loadAll() {
      const entries = await Promise.all(
        portfolio.map(async (item) => {
          const key = priceKeyFor(item);
          if (!key) return [item.id, { history: [], live: null }];

          const params = new URLSearchParams({ name: item.name });
          if (item.set) params.set('set', item.set);
          if (item.cardId) params.set('cardId', item.cardId);
          if (item.edition) params.set('edition', item.edition);

          const [history, live] = await Promise.all([
            apiGet(`/api/history/${encodeURIComponent(key)}`).catch(() => []),
            apiGet(`/api/prices?${params}`).catch(() => null),
          ]);
          const card = (live?.data || [])[0] || null;
          return [item.id, { history: history || [], live: card }];
        })
      );
      if (!cancelled) {
        setPriceData(Object.fromEntries(entries));
        setLoading(false);
      }
    }
    loadAll();

    return () => {
      cancelled = true;
    };
  }, [portfolio]);

  return { priceData, loading };
}
