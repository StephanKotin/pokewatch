import React from 'react';
import './TabNav.css';

const TABS = [
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'alerts', label: 'Alerts', beta: true },
  { key: 'listings', label: 'Live Listings', beta: true },
  { key: 'settings', label: 'Settings', beta: true },
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
          {tab.beta && <sup className="beta-tag">beta</sup>}
        </button>
      ))}
    </div>
  );
}
