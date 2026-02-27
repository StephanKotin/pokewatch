import React from 'react';
import './TabNav.css';

const TABS = [
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'listings', label: 'Live Listings' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'settings', label: 'Settings' },
];

export default function TabNav({ activeTab, onTabChange }) {
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
