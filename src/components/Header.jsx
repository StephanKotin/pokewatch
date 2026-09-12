import React from 'react';
import TabNav from './TabNav';
import './Header.css';

export default function Header({ activeTab, onTabChange, user, onLogout, onLogoClick, cartCount }) {
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

      <TabNav activeTab={activeTab} onTabChange={onTabChange} user={user} />

      {/* Cart works for guests too — the store supports checkout without an
          account — so it lives outside the logged-in-only block below. */}
      <div className="header-account">
        <button
          className={`settings-icon-btn${activeTab === 'cart' ? ' active' : ''}`}
          onClick={() => onTabChange('cart')}
          title="Cart"
          aria-label="Cart"
        >
          &#128722;
          {cartCount > 0 && <span className="cart-count-badge">{cartCount}</span>}
        </button>
        {user?.role === 'admin' && (
          <button
            className={`settings-icon-btn${activeTab === 'admin' ? ' active' : ''}`}
            onClick={() => onTabChange('admin')}
            title="Store Admin"
            aria-label="Store Admin"
          >
            &#128737;
          </button>
        )}
        {user && (
          <>
            {/* Signed-in only, and an icon rather than a tab: a buyer checks
                this occasionally, unlike the collector tabs they live in. */}
            <button
              className={`settings-icon-btn${activeTab === 'orders' ? ' active' : ''}`}
              onClick={() => onTabChange('orders')}
              title="My Orders"
              aria-label="My Orders"
            >
              &#128230;
            </button>
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
          </>
        )}
      </div>
    </header>
  );
}
