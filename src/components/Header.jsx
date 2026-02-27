import React from 'react';
import './Header.css';

export default function Header({ watchingCount, listingsCount, user, onLogout }) {
  return (
    <header className="app-header">
      <div className="logo">
        Poke<span>Watch</span>
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
        {user && (
          <>
            <div className="stat-pill" style={{ color: 'var(--muted)', fontSize: 12 }}>
              {user.email}
            </div>
            <button
              className="stat-pill"
              onClick={onLogout}
              style={{
                cursor: 'pointer',
                background: 'rgba(230, 57, 70, 0.15)',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 20,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
