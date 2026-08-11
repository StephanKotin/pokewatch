import React, { useState } from 'react';
import { useWatchlistPrices } from '../hooks/useWatchlistPrices';
import { CONDITION_TO_GRADE } from '../data/grades';
import Sparkline from '../components/Sparkline';
import './Watchlist.css';

export default function Watchlist({ watchlist, removeCard, toast }) {
  const [viewMode, setViewMode] = useState('grid');
  const { priceData } = useWatchlistPrices(watchlist);

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
                    {card.edition === '1st Edition' && (
                      <span className="wl-tag wl-tag-edition">1st Ed</span>
                    )}
                  </div>
                </div>
                <div className="wl-chart">
                  <Sparkline
                    history={priceData[card.id]?.history}
                    gradeKey={CONDITION_TO_GRADE[card.condition] || 'nm'}
                  />
                </div>
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
                  {card.edition === '1st Edition' && ' · 1st Ed'}
                </div>
                <div className="wl-list-chart">
                  <Sparkline
                    history={priceData[card.id]?.history}
                    gradeKey={CONDITION_TO_GRADE[card.condition] || 'nm'}
                    compact
                  />
                </div>
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
