import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/poketrace';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const wlData = await apiGet('/api/watchlist');
        if (!cancelled) {
          setWatchlist(
            wlData.map((row) => ({
              id: row.id,
              name: row.name,
              set: row.set_name || '',
              condition: row.condition || '',
              maxPrice: row.max_price || null,
              addedAt: row.created_at
                ? new Date(row.created_at * 1000).toISOString()
                : new Date().toISOString(),
              lastChecked: null,
              newListingsCount: 0,
              seenIds: [],
            }))
          );
        }
      } catch (e) {
        console.warn('Failed to load watchlist:', e.message);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addCard = useCallback(
    (card) => {
      const entry = {
        ...card,
        id: card.id || card.cardId || Date.now().toString(),
        addedAt: card.addedAt || new Date().toISOString(),
        lastChecked: null,
        newListingsCount: 0,
        seenIds: [],
      };
      setWatchlist((prev) => [...prev, entry]);
      apiPost('/api/watchlist', {
        id: entry.id,
        name: entry.name,
        set_name: entry.set || null,
        condition: entry.condition || null,
        max_price: entry.maxPrice || null,
      }).catch((e) => console.warn('Failed to sync card:', e.message));
    },
    []
  );

  const removeCard = useCallback((id) => {
    setWatchlist((prev) => prev.filter((c) => c.id !== id));
    apiDelete('/api/watchlist/' + id).catch((e) =>
      console.warn('Failed to delete:', e.message)
    );
  }, []);

  const updateCard = useCallback((id, updates) => {
    setWatchlist((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  return { watchlist, setWatchlist, loading, addCard, removeCard, updateCard };
}
