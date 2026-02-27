import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../api/poketrace';

export function useAlerts() {
  const [firedAlerts, setFiredAlerts] = useState({});

  useEffect(() => {
    apiGet('/api/alerts')
      .then((rows) => {
        const alerts = {};
        for (const row of rows) {
          const key = `alert-${row.card_id}-${row.id}`;
          alerts[key] = {
            cardName: row.card_name,
            price: row.price,
            firedAt: row.fired_at
              ? new Date(row.fired_at * 1000).toISOString()
              : new Date().toISOString(),
            url: row.url || '#',
            title: row.listing_title || '',
          };
        }
        setFiredAlerts(alerts);
      })
      .catch((e) => console.warn('Failed to load alerts:', e.message));
  }, []);

  const fireAlert = useCallback((card, listing, { webhookUrl, email, toastEnabled, webhookEnabled } = {}) => {
    const key = `alert-${card.id}-${listing.id}`;

    setFiredAlerts((prev) => {
      if (prev[key]) return prev;
      return {
        ...prev,
        [key]: {
          cardName: card.name,
          price: listing.price,
          firedAt: new Date().toISOString(),
          url: listing.url,
          title: listing.title,
        },
      };
    });

    // Persist to server
    apiPost('/api/alerts', {
      card_id: card.id,
      card_name: card.name,
      listing_title: listing.title,
      price: listing.price,
      threshold: card.maxPrice,
      url: listing.url,
    }).catch(() => {});

    // Webhook
    if (webhookEnabled && webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'price_alert',
          cardName: card.name,
          condition: card.condition,
          threshold: card.maxPrice,
          listingPrice: listing.price / 100,
          listingTitle: listing.title,
          url: listing.url,
          firedAt: new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    // Email (mailto)
    if (webhookEnabled && email) {
      const subject = encodeURIComponent(
        `PokéWatch Alert: ${card.name} at $${(listing.price / 100).toFixed(2)}`
      );
      const body = encodeURIComponent(
        `Your PokéWatch alert fired!\n\nCard: ${card.name} ${card.condition || ''}\nListing: ${listing.title}\nPrice: $${(listing.price / 100).toFixed(2)}\nYour threshold: $${card.maxPrice}\nView: ${listing.url}\n\nSent by PokéWatch`
      );
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    }
  }, []);

  const clearAlert = useCallback((cardId) => {
    setFiredAlerts((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`alert-${cardId}-`)) delete next[k];
      });
      return next;
    });
  }, []);

  return { firedAlerts, fireAlert, clearAlert };
}
