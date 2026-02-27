import React, { useState, useCallback } from 'react';
import Header from './components/Header';
import TabNav from './components/TabNav';
import { useToast } from './components/Toast';
import { useAuth } from './context/AuthContext';
import { useSettings } from './hooks/useSettings';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio } from './hooks/usePortfolio';
import { useAlerts } from './hooks/useAlerts';
import { searchListingsAPI } from './api/poketrace';
import Login from './pages/Login';
import Watchlist from './pages/Watchlist';
import Listings from './pages/Listings';
import Catalogue from './pages/Catalogue';
import Portfolio from './pages/Portfolio';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';

export default function App() {
  const toast = useToast();
  const { user, loading: authLoading, logout } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { watchlist, addCard, removeCard, updateCard, loading } = useWatchlist();
  const { portfolio, addItem, removeItem } = usePortfolio();
  const { firedAlerts, fireAlert, clearAlert } = useAlerts();

  const [activeTab, setActiveTab] = useState('catalogue');
  const [listings, setListings] = useState([]);
  const [scanning, setScanning] = useState(false);

  // Scan a single card for listings
  const scanCard = useCallback(
    async (cardId) => {
      const card = watchlist.find((c) => c.id === cardId);
      if (!card) return;

      let results = [];
      try {
        results = await searchListingsAPI(card);
      } catch (e) {
        console.warn('searchListings API failed:', e.message);
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
    setListings([]);
    toast('All data cleared');
  }, [toast]);

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 1,
        color: 'var(--muted)',
        fontFamily: "'DM Mono', monospace",
        fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Header
        watchingCount={watchlist.length}
        listingsCount={listings.length}
        user={user}
        onLogout={logout}
      />
      <main>
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
            onClearData={handleClearData}
            onExportData={handleExportData}
            toast={toast}
          />
        )}
      </main>
    </>
  );
}
