import React, { useState, useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { CONDITION_TO_GRADE, CONDITION_MULTIPLIER, CONDITIONS } from '../data/grades';
import { getRawBasePrice, generateGradeSales, computeStats } from '../data/basePrices';
import { fmtD } from '../utils/format';
import './Portfolio.css';

function estimateValue(item) {
  const grade = CONDITION_TO_GRADE[item.condition] || 'nm';
  const mult = CONDITION_MULTIPLIER[item.condition] || 1;
  const base = getRawBasePrice(item.name);
  const sales = generateGradeSales(item.id || item.name, grade, base, mult);
  const stats = computeStats(sales, 7);
  return stats ? stats.avg : base * mult;
}

function buildChartData(portfolio) {
  const now = Date.now();
  const points = [];
  for (let i = 30; i >= 0; i--) {
    const dayMs = now - i * 86400000;
    let total = 0;
    for (const item of portfolio) {
      const grade = CONDITION_TO_GRADE[item.condition] || 'nm';
      const mult = CONDITION_MULTIPLIER[item.condition] || 1;
      const base = getRawBasePrice(item.name);
      const sales = generateGradeSales(item.id || item.name, grade, base, mult);
      const relevant = sales.filter((s) => s.t <= dayMs);
      if (relevant.length > 0) {
        const last5 = relevant.slice(-5);
        total += last5.reduce((a, s) => a + s.price, 0) / last5.length;
      } else {
        total += base * mult;
      }
    }
    points.push({ day: i === 0 ? 'Today' : `${i}d`, value: Math.round(total) });
  }
  return points;
}

export default function Portfolio({ portfolio, addItem, removeItem, demoMode, toast }) {
  const [editItem, setEditItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    set: '',
    condition: 'Near Mint',
    purchasePrice: '',
    purchaseDate: '',
    notes: '',
  });

  /* ---- computed values for each card ---- */
  const enriched = useMemo(() => {
    return portfolio.map((item) => {
      const est = estimateValue(item);
      const cost = item.purchasePrice || 0;
      const pnl = est - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...item, estValue: est, pnl, pnlPct };
    });
  }, [portfolio]);

  /* ---- summary stats ---- */
  const summary = useMemo(() => {
    const count = enriched.length;
    const totalCost = enriched.reduce((a, c) => a + (c.purchasePrice || 0), 0);
    const totalValue = enriched.reduce((a, c) => a + c.estValue, 0);
    const totalPnl = totalValue - totalCost;
    return { count, totalCost, totalValue, totalPnl };
  }, [enriched]);

  /* ---- chart data ---- */
  const chartData = useMemo(() => buildChartData(portfolio), [portfolio]);

  /* ---- modal open ---- */
  const openAdd = () => {
    setEditItem(null);
    setForm({ name: '', set: '', condition: 'Near Mint', purchasePrice: '', purchaseDate: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name || '',
      set: item.set || '',
      condition: item.condition || 'Near Mint',
      purchasePrice: item.purchasePrice || '',
      purchaseDate: item.purchaseDate || '',
      notes: item.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = () => {
    const entry = {
      ...(editItem || {}),
      id: editItem?.id || Date.now().toString(),
      name: form.name,
      set: form.set,
      condition: form.condition,
      purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : 0,
      purchaseDate: form.purchaseDate || new Date().toISOString().slice(0, 10),
      notes: form.notes,
    };
    addItem(entry);
    toast && toast(editItem ? 'Card updated' : 'Card added to portfolio');
    setShowModal(false);
    setEditItem(null);
  };

  const pnlDir = summary.totalPnl >= 0 ? 'up' : 'down';

  return (
    <div className="portfolio-page">
      {/* ---- summary row ---- */}
      <div className="portfolio-summary">
        <div className="port-stat-card pstat-count">
          <span className="port-stat-label">Cards Owned</span>
          <span className="port-stat-value">{summary.count}</span>
        </div>
        <div className="port-stat-card pstat-cost">
          <span className="port-stat-label">Total Cost Basis</span>
          <span className="port-stat-value">${fmtD(summary.totalCost)}</span>
        </div>
        <div className="port-stat-card pstat-val">
          <span className="port-stat-label">Estimated Value</span>
          <span className="port-stat-value">${fmtD(summary.totalValue)}</span>
        </div>
        <div className={`port-stat-card ${pnlDir === 'up' ? 'pstat-up' : 'pstat-down'}`}>
          <span className="port-stat-label">Total P&amp;L</span>
          <span className="port-stat-value">
            {summary.totalPnl >= 0 ? '+' : ''}${fmtD(Math.abs(summary.totalPnl))}
          </span>
          <span className="port-stat-sub">
            {summary.totalCost > 0
              ? `${summary.totalPnl >= 0 ? '+' : ''}${((summary.totalPnl / summary.totalCost) * 100).toFixed(1)}%`
              : '—'}
          </span>
        </div>
      </div>

      {/* ---- chart ---- */}
      {portfolio.length > 0 && (
        <div className="port-chart-wrap">
          <span className="port-chart-label">Portfolio Value (30d)</span>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4cc9f0" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#4cc9f0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                formatter={(v) => [`$${fmtD(v)}`, 'Value']}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#4cc9f0"
                strokeWidth={2}
                fill="url(#portGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ---- cards section ---- */}
      <div className="port-section-hdr">
        <h3>Your Cards</h3>
        <button className="btn btn-primary" onClick={openAdd}>
          + Add Card
        </button>
      </div>

      {enriched.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128188;</div>
          <p>{demoMode ? 'Add cards to start tracking your portfolio.' : 'No cards in your portfolio yet.'}</p>
        </div>
      ) : (
        <div className="port-cards-grid">
          {enriched.map((card) => {
            const dir = card.pnl >= 0 ? 'up' : card.pnl < 0 ? 'down' : 'flat';
            return (
              <div key={card.id} className="port-card">
                <div className="port-card-header">
                  {card.image && (
                    <img className="port-tcg-img" src={card.image} alt="" />
                  )}
                  <div>
                    <div className="port-card-name">{card.name}</div>
                    <div className="port-card-meta">
                      {card.set && <span>{card.set}</span>}
                      {card.condition && <span className="tag">{card.condition}</span>}
                    </div>
                  </div>
                </div>
                <div className="port-card-body">
                  <div className="port-cell">
                    <span className="port-cell-lbl">Purchase</span>
                    <span className="port-cell-val">${fmtD(card.purchasePrice || 0)}</span>
                  </div>
                  <div className="port-cell">
                    <span className="port-cell-lbl">Est. Value</span>
                    <span className="port-cell-val">${fmtD(card.estValue)}</span>
                  </div>
                  <div className="port-cell">
                    <span className="port-cell-lbl">P&amp;L</span>
                    <span className={`port-cell-val ${dir}`}>
                      {card.pnl >= 0 ? '+' : ''}${fmtD(Math.abs(card.pnl))}
                    </span>
                  </div>
                </div>
                <div className="port-card-footer">
                  <span className={`pnl-badge ${dir}`}>
                    {card.pnlPct >= 0 ? '+' : ''}{card.pnlPct.toFixed(1)}%
                  </span>
                  <div>
                    <button className="btn btn-secondary" onClick={() => openEdit(card)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        removeItem(card.id);
                        toast && toast('Card removed');
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- add/edit modal ---- */}
      {showModal && (
        <div className="add-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="add-modal" onClick={(e) => e.stopPropagation()}>
            <h4>{editItem ? 'Edit Card' : 'Add Card to Portfolio'}</h4>
            <div className="form-group">
              <label>Card Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Charizard VMAX"
              />
            </div>
            <div className="form-group">
              <label>Set</label>
              <input
                type="text"
                value={form.set}
                onChange={(e) => setForm({ ...form, set: e.target.value })}
                placeholder="e.g. Evolving Skies"
              />
            </div>
            <div className="form-group">
              <label>Condition</label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                {CONDITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Purchase Price ($)</label>
              <input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label>Purchase Date</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
            <div className="add-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name}>
                {editItem ? 'Save Changes' : 'Add Card'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
