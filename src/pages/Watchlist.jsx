import React, { useState } from 'react';
import './Watchlist.css';

export default function Watchlist({ watchlist, removeCard, toast }) {
  const [viewMode, setViewMode] = useState('grid');

  const getCardImage = (card) => {
    if (card.image) return card.image;
    if (card.setId && card.number) {
      return `https://images.pokemontcg.io/${card.setId}/${card.number}.png`;
    }
    return null;
  };

  if (watchlist.length === 0) {
    return (
      <div className="wl-page">
        <div className="wl-empty">
          <div className="wl-empty-icon">&#128195;</div>
          <p>No cards in your watchlist yet. Add cards from the Catalogue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wl-page">
      <div className="wl-header">
        <div className="wl-title">
          Watchlist <span className="wl-count">{watchlist.length}</span>
        </div>
        <div className="wl-toggles">
          <button
            className={`wl-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            &#9638;&#9638;
          </button>
          <button
            className={`wl-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            &#9776;
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="wl-grid">
          {watchlist.map((card) => {
            const img = getCardImage(card);
            return (
              <div className="wl-card" key={card.id}>
                <div className="wl-card-img-wrap">
                  {img ? (
                    <img className="wl-card-img" src={img} alt={card.name} loading="lazy" />
                  ) : (
                    <div className="wl-card-img-placeholder">No Image</div>
                  )}
                </div>
                <div className="wl-card-info">
                  <div className="wl-card-name" title={card.name}>{card.name}</div>
                  <div className="wl-card-tags">
                    {card.set && <span className="wl-tag">{card.set}</span>}
                    {card.condition && card.condition !== 'Any' && (
                      <span className="wl-tag">{card.condition}</span>
                    )}
                  </div>
                </div>
                <div className="wl-chart-placeholder">Price chart coming soon</div>
                <button
                  className="wl-remove-btn"
                  onClick={() => removeCard(card.id)}
                  title="Remove from watchlist"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="wl-list">
          {watchlist.map((card) => {
            const img = getCardImage(card);
            return (
              <div className="wl-list-row" key={card.id}>
                <div className="wl-list-thumb-wrap">
                  {img ? (
                    <img className="wl-list-thumb" src={img} alt={card.name} loading="lazy" />
                  ) : (
                    <div className="wl-list-thumb-placeholder">?</div>
                  )}
                </div>
                <div className="wl-list-name" title={card.name}>{card.name}</div>
                <div className="wl-list-set">{card.set || '—'}</div>
                <div className="wl-list-cond">
                  {card.condition && card.condition !== 'Any' ? card.condition : '—'}
                </div>
                <div className="wl-list-chart">—</div>
                <button
                  className="wl-remove-btn"
                  onClick={() => removeCard(card.id)}
                  title="Remove from watchlist"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
