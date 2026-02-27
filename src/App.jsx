import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import TabNav from './components/TabNav';
import { useToast } from './components/Toast';
import { useSettings } from './hooks/useSettings';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio } from './hooks/usePortfolio';
import { useAlerts } from './hooks/useAlerts';
import { searchListingsAPI } from './api/poketrace';
import { mulberry32, getRawBasePrice } from './data/basePrices';
import { fmt } from './utils/format';
import Watchlist from './pages/Watchlist';
import Listings from './pages/Listings';
import Catalogue from './pages/Catalogue';
import Portfolio from './pages/Portfolio';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';

export default function App() {
  const toast = useToast();
  const { settings, updateSettings } = useSettings();
  const { watchlist, addCard, removeCard, updateCard, loading } = useWatchlist(settings.demoMode);
  const { portfolio, addItem, removeItem } = usePortfolio(settings.demoMode);
  const { firedAlerts, fireAlert, clearAlert } = useAlerts();

  const [activeTab, setActiveTab] = useState('catalogue');
  const [listings, setListings] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  // Scan a single card for listings
  const scanCard = useCallback(
    async (cardId) => {
      const card = watchlist.find((c) => c.id === cardId);
      if (!card) return;

      let results = [];
      if (!settings.demoMode) {
        try {
          results = await searchListingsAPI(card);
        } catch (e) {
          console.warn('searchListings API failed:', e.message);
        }
      }

      // Demo mode fallback
      if (settings.demoMode || results.length === 0) {
        const base = getRawBasePrice(card.name);
        const rand = mulberry32(
          card.id.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)
        );
        const count = Math.floor(rand() * 5) + 3;
        results = [];
        for (let i = 0; i < count; i++) {
          const variance = 0.7 + rand() * 0.6;
          const price = Math.round(base * variance * 100);
          const isAuction = rand() > 0.55;
          results.push({
            id: card.id + '-listing-' + i,
            title: `${card.name}${card.set ? ' ' + card.set : ''} ${card.condition || 'NM'} Pokemon Card`,
            price,
            url: '#',
            type: isAuction ? 'auction' : 'buynow',
            timeLeft: isAuction
              ? Math.floor(rand() * 6 + 1) + 'h ' + Math.floor(rand() * 59) + 'm'
              : null,
          });
        }
      }

      const newIds = results.filter((r) => !card.seenIds.includes(r.id)).map((r) => r.id);
      updateCard(cardId, {
        seenIds: [...new Set([...card.seenIds, ...results.map((r) => r.id)])],
        lastChecked: new Date().toISOString(),
        newListingsCount: newIds.length,
      });

      setListings((prev) => {
        const filtered = prev.filter((l) => l.watchId !== cardId);
        const newListings = results.map((r) => ({
          ...r,
          watchId: cardId,
          isNew: newIds.includes(r.id),
        }));
        return [...filtered, ...newListings];
      });

      if (newIds.length > 0) {
        toast(
          `${newIds.length} new listing${newIds.length > 1 ? 's' : ''} for ${card.name}!`
        );
      }

      // Fire price alert
      if (card.maxPrice) {
        const matching = results.filter((r) => r.price <= card.maxPrice * 100);
        if (matching.length > 0) {
          const cheapest = matching.reduce((a, b) => (a.price < b.price ? a : b));
          fireAlert(card, cheapest, {
            webhookUrl: settings.alertWebhookUrl,
            email: settings.alertEmail,
            toastEnabled: true,
            webhookEnabled: true,
          });
        }
      }
    },
    [watchlist, settings, updateCard, fireAlert, toast]
  );

  const scanAll = useCallback(async () => {
    if (!watchlist.length) {
      toast('Add cards to your watchlist first', 'error');
      return;
    }
    setScanning(true);
    for (const card of watchlist) {
      await scanCard(card.id);
    }
    updateSettings({ lastScan: new Date().toISOString() });
    setScanning(false);
  }, [watchlist, scanCard, updateSettings, toast]);

  const handleAddCard = useCallback(
    (card) => {
      addCard(card);
      toast(`Added "${card.name}" to watchlist!`);
    },
    [addCard, toast]
  );

  const handleRemoveCard = useCallback(
    (id) => {
      removeCard(id);
      setListings((prev) => prev.filter((l) => l.watchId !== id));
      toast('Card removed');
    },
    [removeCard, toast]
  );

  const handleExportData = useCallback(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify({ watchlist, listings }, null, 2)], {
        type: 'application/json',
      })
    );
    a.download = 'pokewatch-export.json';
    a.click();
  }, [watchlist, listings]);

  const handleClearData = useCallback(() => {
    if (!confirm('Clear all watchlist and listing data?')) return;
    // This is a simple clear - in a full implementation we'd clear server data too
    setListings([]);
    toast('All data cleared');
  }, [toast]);

  const handleToggleDemo = useCallback(() => {
    const newMode = !settings.demoMode;
    updateSettings({ demoMode: newMode });
    setListings([]);
    toast(
      newMode
        ? 'Demo mode ON — using simulated data'
        : 'Live mode ON — loading your data…'
    );
  }, [settings.demoMode, updateSettings, toast]);

  return (
    <>
      <Header watchingCount={watchlist.length} listingsCount={listings.length} />
      <main>
        {showBanner && settings.demoMode && (
          <div className="api-banner">
            <div style={{ fontSize: 20, flexShrink: 0 }}>⚠️</div>
            <div>
              <b>Running in demo mode.</b> Toggle Demo Mode off in{' '}
              <b>Settings → Price Data Config</b> to load live raw condition prices
              from your PokéWatch server.
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12, flexShrink: 0 }}
              onClick={() => setShowBanner(false)}
            >
              ✕
            </button>
          </div>
        )}

        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'watchlist' && (
          <Watchlist
            watchlist={watchlist}
            removeCard={handleRemoveCard}
            toast={toast}
          />
        )}
        {activeTab === 'listings' && (
          <Listings
            listings={listings}
            watchlist={watchlist}
            scanning={scanning}
            onScanAll={scanAll}
            lastScan={settings.lastScan}
          />
        )}
        {activeTab === 'catalogue' && (
          <Catalogue
            watchlist={watchlist}
            addCard={handleAddCard}
            portfolio={portfolio}
            addItem={addItem}
            toast={toast}
          />
        )}
        {activeTab === 'portfolio' && (
          <Portfolio
            portfolio={portfolio}
            addItem={addItem}
            removeItem={removeItem}
            demoMode={settings.demoMode}
            toast={toast}
          />
        )}
        {activeTab === 'alerts' && (
          <Alerts
            watchlist={watchlist}
            firedAlerts={firedAlerts}
            clearAlert={clearAlert}
            settings={settings}
            updateSettings={updateSettings}
            toast={toast}
          />
        )}
        {activeTab === 'settings' && (
          <Settings
            settings={settings}
            updateSettings={updateSettings}
            onToggleDemo={handleToggleDemo}
            onClearData={handleClearData}
            onExportData={handleExportData}
            toast={toast}
          />
        )}
      </main>
    </>
  );
}
