import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/poketrace';

export function usePortfolio(demoMode) {
  const [portfolio, setPortfolio] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!demoMode) {
        try {
          const data = await apiGet('/api/portfolio');
          if (!cancelled) {
            setPortfolio(
              data.map((row) => ({
                id: row.id,
                name: row.name,
                set: row.set_name || '',
                condition: row.condition || '',
                purchasePrice: row.purchase_price || null,
                purchaseDate: row.purchase_date || '',
                notes: row.notes || '',
              }))
            );
          }
        } catch (e) {
          console.warn('Failed to load portfolio:', e.message);
        }
      } else {
        if (!cancelled) setPortfolio([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [demoMode]);

  const addItem = useCallback((item) => {
    setPortfolio((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
    apiPost('/api/portfolio', {
      id: item.id,
      name: item.name,
      set_name: item.set || null,
      condition: item.condition || null,
      purchase_price: item.purchasePrice || null,
      purchase_date: item.purchaseDate || null,
      notes: item.notes || null,
    }).catch((e) => console.warn('Failed to sync portfolio:', e.message));
  }, []);

  const removeItem = useCallback((id) => {
    setPortfolio((prev) => prev.filter((p) => p.id !== id));
    apiDelete('/api/portfolio/' + id).catch((e) =>
      console.warn('Failed to delete:', e.message)
    );
  }, []);

  return { portfolio, addItem, removeItem };
}
