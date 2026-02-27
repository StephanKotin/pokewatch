import React from 'react';
import './Header.css';

export default function Header({ watchingCount, listingsCount }) {
  return (
    <header className="app-header">
      <div className="logo">
        Poké<span>Watch</span>
      </div>
      <div className="header-stats">
        <div className="stat-pill">
          <b>{watchingCount}</b> watching
        </div>
        <div className="stat-pill">
          <b>{listingsCount}</b> listings
        </div>
        <div className="stat-pill">
          <span className="pulse-dot" />
          <b>Live</b>
        </div>
      </div>
    </header>
  );
}
