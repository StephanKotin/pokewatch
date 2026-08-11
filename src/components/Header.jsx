import React from 'react';
import TabNav from './TabNav';
import './Header.css';

export default function Header({ activeTab, onTabChange, user, onLogout, onLogoClick }) {
  return (
    <header className="app-header">
      <a
        href="/"
        className="logo"
        onClick={(e) => {
          e.preventDefault();
          onLogoClick();
        }}
      >
        Poke<span>Watch</span> &#128064;
      </a>

      <TabNav activeTab={activeTab} onTabChange={onTabChange} />

      {user && (
        <div className="header-account">
          <button
            className={`settings-icon-btn${activeTab === 'settings' ? ' active' : ''}`}
            onClick={() => onTabChange('settings')}
            title="Settings"
            aria-label="Settings"
          >
            &#9881;
          </button>
          <span className="header-email">{user.email}</span>
          <button className="header-signout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
