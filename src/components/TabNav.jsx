import React from 'react';
import './TabNav.css';

const PRIVATE_TABS = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'listings', label: 'Live Listings', beta: true },
];

const SHOP_TAB = { key: 'store', label: 'Shop' };

export default function TabNav({ activeTab, onTabChange, user }) {
  // Logged-out visitors only get the Shop tab — the other tabs sit behind
  // the tracker's login gate anyway, so showing them just invites a click
  // that bounces straight back to the login screen.
  const tabs = user ? [SHOP_TAB, ...PRIVATE_TABS] : [SHOP_TAB];
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
          {tab.beta && <sup className="beta-tag">beta</sup>}
        </button>
      ))}
    </div>
  );
}
