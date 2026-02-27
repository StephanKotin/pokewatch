import React from 'react';
import { fmt, timeAgo } from '../utils/format';
import './Listings.css';

export default function Listings({ listings, watchlist, scanning, onScanAll, lastScan }) {
  const sorted = [...(listings || [])].sort((a, b) => a.price - b.price);

  return (
    <div className="listings-page">
      <div className="listings-header">
        <div>
          <h2 className="listings-title">Live Listings</h2>
          {lastScan && (
            <span className="last-scan">Last scan: {timeAgo(lastScan)}</span>
          )}
        </div>
        <div className="listings-header-actions">
          <span className={`scan-indicator ${scanning ? 'active' : ''}`}>
            {scanning && <span className="scan-spinner" />}
            {scanning ? 'Scanning...' : 'Idle'}
          </span>
          <button
            className="btn btn-primary"
            onClick={onScanAll}
            disabled={scanning}
          >
            Scan All Now
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No listings found yet. Add cards to your watchlist and scan to see results.</p>
        </div>
      ) : (
        <div className="listings-grid">
          {sorted.map((listing, i) => (
            <div
              key={listing.id || i}
              className={`listing-card${listing.isNew ? ' listing-new' : ''}`}
            >
              {listing.isNew && <span className="new-badge">NEW</span>}
              <a
                className="listing-title"
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {listing.title}
              </a>
              <div className="listing-meta">
                <span className={`tag ${listing.type === 'Auction' ? 'tag-auction' : 'tag-buynow'}`}>
                  {listing.type || 'Buy Now'}
                </span>
                {listing.timeLeft && (
                  <span className="listing-time">{listing.timeLeft}</span>
                )}
                {listing.cardName && (
                  <span className="tag tag-card">{listing.cardName}</span>
                )}
              </div>
              <div className="listing-price">{fmt(listing.price)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
