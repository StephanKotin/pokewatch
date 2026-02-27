import React, { useState, useEffect, useMemo } from 'react';
import { GRADES } from '../data/grades';
import { generateAllGrades, computeStats, mulberry32, getRawBasePrice } from '../data/basePrices';
import { fmtD, timeAgo } from '../utils/format';
import PriceChart from '../components/PriceChart';
import './Watchlist.css';

const CONDITION_OPTIONS = [
  'Any',
  'Near Mint',
  'Lightly Played',
  'Mod. Played',
  'Heavily Played',
  'Damaged',
  'CGC 10',
  'CGC 9.5',
  'Raw NM',
  'Raw LP',
];

export default function Watchlist({ watchlist, addCard, removeCard, updateCard, demoMode, toast }) {
  const [name, setName] = useState('');
  const [set, setSet] = useState('');
  const [condition, setCondition] = useState('Any');
  const [maxPrice, setMaxPrice] = useState('');
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

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const card = {
      id: Date.now().toString(),
      name: name.trim(),
      set: set.trim(),
      condition,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      addedAt: new Date().toISOString(),
      lastChecked: null,
      newListingsCount: 0,
      seenIds: [],
    };
    addCard(card);
    setName('');
    setSet('');
    setCondition('Any');
    setMaxPrice('');
  }

  function toggleGrade(cardId, gradeKey) {
    setChartData((prev) => {
      const cardState = prev[cardId];
      if (!cardState) return prev;
      const activeCount = Object.values(cardState.activeGrades).filter(Boolean).length;
      // Prevent turning off the last active grade
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

  function scanCard(card) {
    if (!demoMode) return;

    const seedNum =
      (card.id + 'scan' + Date.now().toString().slice(0, -4))
        .split('')
        .reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0) * 1009;
    const rand = mulberry32(seedNum);
    const base = getRawBasePrice(card.name);
    const count = Math.floor(rand() * 4) + 1;

    const newListings = [];
    for (let i = 0; i < count; i++) {
      newListings.push({
        id: `mock-${Date.now()}-${i}`,
        title: `${card.name} ${card.set || ''}`.trim(),
        price: Math.round(base * (0.7 + rand() * 0.6)),
        condition: card.condition !== 'Any' ? card.condition : 'Near Mint',
        source: 'Mock',
        time: Date.now(),
      });
    }

    updateCard({
      ...card,
      lastChecked: new Date().toISOString(),
      newListingsCount: count,
    });

    if (toast) {
      toast(`Found ${count} new listing${count !== 1 ? 's' : ''} for ${card.name}`);
    }
  }

  function scanAll() {
    watchlist.forEach((card) => scanCard(card));
  }

  return (
    <div className="watchlist-page">
      {/* Add Card Form */}
      <div className="add-card-section">
        <h3 className="section-title">Add Card to Watchlist</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <input
                type="text"
                placeholder="Card Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                placeholder="Set / Edition"
                value={set}
                onChange={(e) => setSet(e.target.value)}
              />
            </div>
            <div className="form-group">
              <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <input
                type="number"
                placeholder="Max Price ($)"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Add Card
            </button>
          </div>
        </form>
      </div>

      {/* Scan All Button */}
      {watchlist.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={scanAll}>
            Scan All
          </button>
        </div>
      )}

      {/* Watchlist Grid */}
      {watchlist.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128269;</div>
          <p>No cards in your watchlist yet. Add one above to start tracking prices.</p>
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
                    <button className="btn btn-sm" onClick={() => scanCard(card)}>
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
