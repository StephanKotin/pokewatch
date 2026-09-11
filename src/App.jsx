import React, { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import WelcomeSplash from './components/WelcomeSplash';
import { useToast } from './components/Toast';
import { useAuth } from './context/AuthContext';
import { useSettings } from './hooks/useSettings';
import { useWatchlist } from './hooks/useWatchlist';
import { usePortfolio } from './hooks/usePortfolio';
import { useAlerts } from './hooks/useAlerts';
import { usePortfolioPrices } from './hooks/usePortfolioPrices';
import { useCart } from './hooks/useCart';
import { searchListingsAPI } from './api/poketrace';
import { trackPageview } from './analytics';
import Login from './pages/Login';
import Watchlist from './pages/Watchlist';
import Listings from './pages/Listings';
import Catalogue from './pages/Catalogue';
import Portfolio from './pages/Portfolio';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import Store from './pages/Store';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import CheckoutResult from './pages/CheckoutResult';
import Admin from './pages/Admin';

const TAB_PATHS = {
  portfolio: '/',
  catalogue: '/catalogue',
  watchlist: '/watchlist',
  alerts: '/alerts',
  listings: '/listings',
  settings: '/settings',
  store: '/store',
  cart: '/cart',
  checkoutSuccess: '/checkout/success',
  checkoutCancel: '/checkout/cancel',
  admin: '/admin',
};

// The store is public (guest checkout, no login/approval required) —
// everything else stays behind the tracker's existing login gate.
const PUBLIC_TABS = new Set(['store', 'storeItem', 'cart', 'checkoutSuccess', 'checkoutCancel']);

function tabFromPath(pathname) {
  if (pathname.startsWith('/store/')) return 'storeItem';
  const entry = Object.entries(TAB_PATHS).find(([, path]) => path === pathname);
  return entry ? entry[0] : 'portfolio';
}

export default function App() {
  const toast = useToast();
  const { user, loading: authLoading, logout, markOnboarded } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { watchlist, addCard, removeCard, updateCard, loading } = useWatchlist();
  const { portfolio, addItem, removeItem } = usePortfolio();
  // Lifted up here (rather than inside the Portfolio page) so it survives
  // tab switches — Portfolio unmounts every time you navigate away, which
  // was resetting this and re-fetching every card's price from scratch on
  // every single visit instead of reusing what's already been fetched.
  const { priceData: portfolioPriceData, loading: portfolioPricesLoading } = usePortfolioPrices(portfolio);
  const { firedAlerts, fireAlert, clearAlert } = useAlerts();
  const cart = useCart();

  const [activeTab, setActiveTabState] = useState(() => tabFromPath(window.location.pathname));
  const [listings, setListings] = useState([]);
  const [scanning, setScanning] = useState(false);

  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab);
    const path = TAB_PATHS[tab] || '/';
    if (window.location.pathname !== path) {
      window.history.pushState({ tab }, '', path);
    }
  }, []);

  const openProduct = useCallback((id) => {
    setActiveTabState('storeItem');
    const path = `/store/${id}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ tab: 'storeItem', id }, '', path);
    }
  }, []);

  const storeItemId = activeTab === 'storeItem' ? window.location.pathname.slice('/store/'.length) : null;

  useEffect(() => {
    function onPopState() {
      setActiveTabState(tabFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Covers both tab clicks and browser back/forward, since both update
  // activeTab — matches the app's SPA navigation instead of relying on
  // PostHog's default full-page-load pageview capture.
  useEffect(() => {
    if (!authLoading && user) trackPageview(activeTab);
  }, [activeTab, authLoading, user]);

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
        const matching = results.filter((r) => r.price <= card.maxPrice);
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

  const isPublicRoute = PUBLIC_TABS.has(activeTab);
  if (!user && !isPublicRoute) {
    return <Login />;
  }

  return (
    <>
      {user && !user.hasOnboarded && <WelcomeSplash onDismiss={markOnboarded} />}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={logout}
        onLogoClick={() => setActiveTab(user ? 'portfolio' : 'store')}
        cartCount={cart.count}
      />
      <main>
        {activeTab === 'store' && (
          <Store onAddToCart={cart.addItem} onOpenProduct={openProduct} toast={toast} />
        )}
        {activeTab === 'storeItem' && (
          <ProductDetail
            productId={storeItemId}
            onAddToCart={cart.addItem}
            onBack={() => setActiveTab('store')}
            toast={toast}
          />
        )}
        {activeTab === 'cart' && (
          <Cart cart={cart} onGoToShop={() => setActiveTab('store')} toast={toast} />
        )}
        {activeTab === 'checkoutSuccess' && (
          <CheckoutResult
            status="success"
            onGoToShop={() => {
              cart.clear();
              setActiveTab('store');
            }}
          />
        )}
        {activeTab === 'checkoutCancel' && (
          <CheckoutResult status="cancel" onGoToShop={() => setActiveTab('store')} />
        )}
        {activeTab === 'admin' && user?.role === 'admin' && <Admin toast={toast} />}
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
            priceData={portfolioPriceData}
            pricesLoading={portfolioPricesLoading}
            toast={toast}
            onGoToCatalogue={() => setActiveTab('catalogue')}
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
