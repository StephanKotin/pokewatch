import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/poketrace';

export function useWatchlist(demoMode) {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (!demoMode) {
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
      } else {
        if (!cancelled) {
          setWatchlist([
            {
              id: 'demo1',
              name: 'Charizard',
              set: 'Base Set',
              condition: 'Near Mint',
              maxPrice: 500,
              addedAt: new Date().toISOString(),
              lastChecked: null,
              newListingsCount: 0,
              seenIds: [],
            },
            {
              id: 'demo2',
              name: 'Pikachu Illustrator',
              set: '',
              condition: '',
              maxPrice: 500000,
              addedAt: new Date().toISOString(),
              lastChecked: null,
              newListingsCount: 0,
              seenIds: [],
            },
            {
              id: 'demo3',
              name: 'Umbreon VMAX',
              set: 'Evolving Skies',
              condition: 'Near Mint',
              maxPrice: 200,
              addedAt: new Date().toISOString(),
              lastChecked: null,
              newListingsCount: 2,
              seenIds: [],
            },
          ]);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  const addCard = useCallback(
    (card) => {
      setWatchlist((prev) => [...prev, card]);
      apiPost('/api/watchlist', {
        id: card.id,
        name: card.name,
        set_name: card.set || null,
        condition: card.condition || null,
        max_price: card.maxPrice || null,
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
