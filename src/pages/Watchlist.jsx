import React, { useState, useEffect, useMemo } from 'react';
import { GRADES } from '../data/grades';
import { generateAllGrades, computeStats, mulberry32, getRawBasePrice } from '../data/basePrices';
import { fmtD, timeAgo } from '../utils/format';
import PriceChart from '../components/PriceChart';
import './Watchlist.css';

export default function Watchlist({ watchlist, removeCard, updateCard, scanCard, demoMode, toast }) {
  const [chartData, setChartData] = useState({});

  // Initialize chart data for watchlist cards
  useEffect(() => {
    setChartData((prev) => {
      const next = { ...prev };
      let changed = false;
      watchlist.forEach((card) => {
        if (!next[card.id]) {
          const gradeData = generateAllGrades(card, GRADES);
          const activeGrades = {};
          GRADES.forEach((g) => {
            activeGrades[g.key] = g.defaultOn;
          });
          next[card.id] = { gradeData, activeGrades, range: 30, source: 'Mock' };
          changed = true;
        }
      });
      // Clean up removed cards
      Object.keys(next).forEach((id) => {
        if (!watchlist.find((c) => c.id === id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [watchlist]);

  function toggleGrade(cardId, gradeKey) {
    setChartData((prev) => {
      const cardState = prev[cardId];
      if (!cardState) return prev;
      const activeCount = Object.values(cardState.activeGrades).filter(Boolean).length;
      if (cardState.activeGrades[gradeKey] && activeCount <= 1) return prev;
      return {
        ...prev,
        [cardId]: {
          ...cardState,
          activeGrades: {
            ...cardState.activeGrades,
            [gradeKey]: !cardState.activeGrades[gradeKey],
          },
        },
      };
    });
  }

  function setRange(cardId, days) {
    setChartData((prev) => {
      const cardState = prev[cardId];
      if (!cardState) return prev;
      return {
        ...prev,
        [cardId]: { ...cardState, range: days },
      };
    });
  }

  return (
    <div className="watchlist-page">
      {/* Watchlist Grid */}
      {watchlist.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128269;</div>
          <p>No cards in your watchlist yet. Add cards from the Catalogue to start tracking prices.</p>
        </div>
      ) : (
        <div className="watchlist-grid">
          {watchlist.map((card) => {
            const cd = chartData[card.id];
            if (!cd) return null;

            const { gradeData, activeGrades, range, source } = cd;
            const activeGradeList = GRADES.filter((g) => activeGrades[g.key]);

            return (
              <div className="card-row" key={card.id}>
                {/* Card Header */}
                <div className="card-header">
                  <div className="card-info">
                    <span className="card-name">{card.name}</span>
                    <div className="card-meta">
                      {card.set && <span className="tag">{card.set}</span>}
                      {card.condition !== 'Any' && <span className="tag">{card.condition}</span>}
                      {card.maxPrice && <span className="tag">${fmtD(card.maxPrice)}</span>}
                      {card.lastChecked && (
                        <span className="tag">{timeAgo(card.lastChecked)}</span>
                      )}
                      {card.newListingsCount > 0 && (
                        <span className="tag">{card.newListingsCount} new</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => scanCard(card.id)}>
                      Scan
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeCard(card.id)}>
                      &times;
                    </button>
                  </div>
                </div>

                {/* Grade Toggles */}
                <div className="grade-toggles">
                  {GRADES.map((g) => (
                    <button
                      key={g.key}
                      className={`grade-btn${activeGrades[g.key] ? ' active' : ''}`}
                      onClick={() => toggleGrade(card.id, g.key)}
                      style={
                        activeGrades[g.key]
                          ? { borderColor: g.color, background: g.color + '18' }
                          : {}
                      }
                    >
                      <span
                        className="grade-swatch"
                        style={{ background: g.color, opacity: activeGrades[g.key] ? 1 : 0.3 }}
                      />
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Price Chart */}
                <PriceChart gradeData={gradeData} activeGrades={activeGrades} rangeDays={range} />

                {/* Chart Range Buttons */}
                <div className="chart-range-btns">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      className={`range-btn${range === d ? ' active' : ''}`}
                      onClick={() => setRange(card.id, d)}
                    >
                      {d}d
                    </button>
                  ))}
                </div>

                {/* Grade Stats Grid */}
                <div className="grade-stats-grid">
                  <div className="grade-stats-header">
                    <span>Grade</span>
                    <span>7d Avg</span>
                    <span>7d Range</span>
                    <span>30d Avg</span>
                  </div>
                  {activeGradeList.map((g) => {
                    const stats7 = computeStats(gradeData[g.key] || [], 7);
                    const stats30 = computeStats(gradeData[g.key] || [], 30);
                    return (
                      <div className="grade-stats-row" key={g.key}>
                        <span className="grade-label-cell">
                          <span className="grade-dot" style={{ background: g.color }} />
                          <span className="grade-label-text">{g.label}</span>
                        </span>
                        <span>${stats7 ? fmtD(Math.round(stats7.avg)) : '—'}</span>
                        <span>
                          {stats7
                            ? `$${fmtD(Math.round(stats7.low))}–$${fmtD(Math.round(stats7.high))}`
                            : '—'}
                        </span>
                        <span>${stats30 ? fmtD(Math.round(stats30.avg)) : '—'}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Source Badge */}
                <div className="source-badge">{source}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
