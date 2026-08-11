import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { GRADES, CONDITION_TO_GRADE, CONDITIONS } from '../data/grades';
import { extractGradePrice, TCG_CDN, getFullCardDB } from '../api/poketrace';
import { usePortfolioPrices } from '../hooks/usePortfolioPrices';
import {
  rowsFromCSV,
  matchCard,
  normalizeCondition,
  normalizeEdition,
  normalizePrice,
  normalizeQuantity,
  normalizeDate,
  setNameForId,
} from '../utils/csvImport';
import { isEditionEligible } from '../data/editions';
import { fmtD } from '../utils/format';
import './Portfolio.css';

function uniqueId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(`${baseId}__${n}`)) n++;
  return `${baseId}__${n}`;
}

function getCardImage(item) {
  if (item.image) return item.image;
  if (item.setId && item.number) return `${TCG_CDN}/${item.setId}/${item.number}.png`;
  return null;
}

// pokemontcg.io serves a sharper "_hires" variant at the same path for most
// cards; falls back to the regular image (via onError) if one doesn't exist.
function getHiResImage(item) {
  const img = getCardImage(item);
  return img ? img.replace(/\.png$/, '_hires.png') : null;
}

// Real quote for the item's condition; falls back to the most recent stored
// snapshot for that grade. Returns null when no price data exists yet.
function estimateValue(item, priceEntry) {
  const gradeKey = CONDITION_TO_GRADE[item.condition] || 'nm';
  if (priceEntry?.live) {
    const p = extractGradePrice(priceEntry.live, gradeKey, GRADES);
    if (p) return p.avg;
  }
  const hist = (priceEntry?.history || []).filter((h) => h.grade === gradeKey);
  if (hist.length) return hist[hist.length - 1].price;
  return null;
}

function buildChartData(portfolio, priceData) {
  const now = Date.now();
  const points = [];
  for (let i = 30; i >= 0; i--) {
    const dayMs = now - i * 86400000;
    let total = 0;
    for (const item of portfolio) {
      const gradeKey = CONDITION_TO_GRADE[item.condition] || 'nm';
      const entry = priceData[item.id];
      const hist = (entry?.history || []).filter(
        (h) => h.grade === gradeKey && h.captured_at * 1000 <= dayMs
      );
      let value = null;
      if (hist.length) {
        value = hist[hist.length - 1].price;
      } else if (i === 0 && entry?.live) {
        const p = extractGradePrice(entry.live, gradeKey, GRADES);
        value = p ? p.avg : null;
      }
      total += value != null ? value : item.purchasePrice || 0;
    }
    points.push({ day: i === 0 ? 'Today' : `${i}d`, value: Math.round(total) });
  }
  return points;
}

export default function Portfolio({ portfolio, addItem, removeItem, toast }) {
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

  const { priceData, loading: pricesLoading } = usePortfolioPrices(portfolio);

  /* ---- CSV import ---- */
  const fileInputRef = useRef(null);
  const [importRows, setImportRows] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportLoading(true);
    try {
      const text = await file.text();
      const parsed = rowsFromCSV(text);
      if (!parsed.length) {
        toast && toast('No rows found in that file', 'error');
        return;
      }
      const cardDB = await getFullCardDB();
      const rows = parsed.map((r) => {
        const match = matchCard(r, cardDB);
        return {
          ...r,
          condition: normalizeCondition(r.condition),
          edition: normalizeEdition(r.edition),
          purchasePrice: normalizePrice(r.purchasePrice),
          purchaseDate: normalizeDate(r.purchaseDate),
          quantity: normalizeQuantity(r.quantity),
          match,
          selectedIndex: 0,
          skip: match.status === 'unmatched',
        };
      });
      setImportRows(rows);
      setShowImportModal(true);
    } catch (err) {
      toast && toast('Failed to read CSV: ' + err.message, 'error');
    }
    setImportLoading(false);
  };

  const setRowCandidate = (line, idx) => {
    setImportRows((prev) =>
      prev.map((r) => (r._line === line ? { ...r, selectedIndex: idx } : r))
    );
  };

  const toggleRowSkip = (line) => {
    setImportRows((prev) =>
      prev.map((r) => (r._line === line ? { ...r, skip: !r.skip } : r))
    );
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportRows([]);
  };

  const handleImportConfirm = () => {
    const existingIds = new Set(portfolio.map((p) => p.id));
    let addedCount = 0;
    let counter = 0;

    for (const row of importRows) {
      if (row.skip) continue;
      const candidate = row.match.status === 'unmatched' ? null : row.match.candidates[row.selectedIndex];

      for (let n = 0; n < row.quantity; n++) {
        counter++;
        const id = candidate
          ? uniqueId(candidate.id, existingIds)
          : `import-${Date.now()}-${counter}`;
        existingIds.add(id);
        addItem({
          id,
          cardId: candidate ? candidate.id : null,
          name: candidate ? candidate.name : row.name,
          set: candidate ? setNameForId(candidate.setId) : row.set || '',
          setId: candidate ? candidate.setId : null,
          number: candidate ? candidate.number : row.number || '',
          image: candidate ? `${TCG_CDN}/${candidate.setId}/${candidate.number}.png` : null,
          condition: row.condition,
          edition: candidate && isEditionEligible(candidate.setId) ? row.edition : null,
          purchasePrice: row.purchasePrice || 0,
          purchaseDate: row.purchaseDate || new Date().toISOString().slice(0, 10),
          notes: row.notes || '',
        });
        addedCount++;
      }
    }

    closeImportModal();
    toast && toast(`Imported ${addedCount} card${addedCount === 1 ? '' : 's'}`);
  };

  const importCounts = useMemo(() => {
    const matched = importRows.filter((r) => r.match.status === 'matched').length;
    const ambiguous = importRows.filter((r) => r.match.status === 'ambiguous').length;
    const unmatched = importRows.filter((r) => r.match.status === 'unmatched').length;
    const included = importRows.filter((r) => !r.skip).length;
    return { matched, ambiguous, unmatched, included };
  }, [importRows]);

  /* ---- computed values for each card ---- */
  const enriched = useMemo(() => {
    return portfolio.map((item) => {
      const est = estimateValue(item, priceData[item.id]);
      const cost = item.purchasePrice || 0;
      const pnl = est != null ? est - cost : null;
      // % return is undefined without a real cost basis (can't divide by
      // $0), so it's left null rather than shown as an infinite gain.
      const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
      return { ...item, estValue: est, pnl, pnlPct };
    });
  }, [portfolio, priceData]);

  /* ---- summary stats ---- */
  const summary = useMemo(() => {
    const count = enriched.length;
    const totalCost = enriched.reduce((a, c) => a + (c.purchasePrice || 0), 0);
    const totalValue = enriched.reduce((a, c) => a + (c.estValue != null ? c.estValue : 0), 0);
    const totalPnl = totalValue - totalCost;
    const missingCount = enriched.filter((c) => c.estValue == null).length;
    return { count, totalCost, totalValue, totalPnl, missingCount };
  }, [enriched]);

  /* ---- chart data ---- */
  const chartData = useMemo(() => buildChartData(portfolio, priceData), [portfolio, priceData]);

  /* ---- sorting ---- */
  const [sortField, setSortField] = useState('value');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const getSortValue = (card) => {
      switch (sortField) {
        case 'value': return card.estValue;
        case 'pnl': return card.pnl;
        case 'pnlPct': return card.pnlPct;
        case 'purchasePrice': return card.purchasePrice || null;
        case 'purchaseDate': return card.purchaseDate || null;
        case 'name': return card.name || '';
        default: return null;
      }
    };
    const withValue = enriched.filter((c) => getSortValue(c) != null);
    const withoutValue = enriched.filter((c) => getSortValue(c) == null);
    withValue.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // Cards missing the sorted field always sink to the end, in either direction.
    return [...withValue, ...withoutValue];
  }, [enriched, sortField, sortDir]);

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

  /* ---- per-card options menu ---- */
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = (e) => {
      if (!e.target.closest('.port-card-menu-wrap')) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuId]);

  const handleDuplicate = (card) => {
    const existingIds = new Set(portfolio.map((p) => p.id));
    addItem({
      id: uniqueId(card.id, existingIds),
      cardId: card.cardId || null,
      name: card.name,
      set: card.set || '',
      setId: card.setId || null,
      number: card.number || '',
      image: card.image || null,
      condition: card.condition,
      edition: card.edition || null,
      purchasePrice: card.purchasePrice || 0,
      purchaseDate: card.purchaseDate || new Date().toISOString().slice(0, 10),
      notes: card.notes || '',
    });
    toast && toast(`${card.name} duplicated`);
    setOpenMenuId(null);
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);

  const handleDelete = (card) => {
    setOpenMenuId(null);
    setDeleteTarget(card);
  };

  const confirmDelete = () => {
    removeItem(deleteTarget.id);
    toast && toast('Card removed');
    setDeleteTarget(null);
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
          {summary.missingCount > 0 && (
            <span className="port-stat-sub port-stat-warn">
              excludes {summary.missingCount} card{summary.missingCount > 1 ? 's' : ''} with no price data
            </span>
          )}
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
        <h3>
          Your Cards
          {pricesLoading && <span className="port-loading-note"> · fetching live prices…</span>}
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
          <button className="btn btn-secondary" onClick={handleImportClick} disabled={importLoading}>
            {importLoading ? 'Reading…' : 'Import CSV'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            + Add Card
          </button>
        </div>
      </div>

      {enriched.length > 0 && (
        <div className="port-sort-bar">
          <label htmlFor="port-sort-field">Sort by</label>
          <select id="port-sort-field" value={sortField} onChange={(e) => setSortField(e.target.value)}>
            <option value="value">Estimated Value</option>
            <option value="pnl">P&amp;L ($)</option>
            <option value="pnlPct">P&amp;L (%)</option>
            <option value="purchasePrice">Purchase Price</option>
            <option value="purchaseDate">Purchase Date</option>
            <option value="name">Name</option>
          </select>
          <button
            className="port-sort-dir-btn"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortField === 'name'
              ? (sortDir === 'asc' ? '↑ A to Z' : '↓ Z to A')
              : (sortDir === 'asc' ? '↑ Low to High' : '↓ High to Low')}
          </button>
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128188;</div>
          <p>No cards in your portfolio yet.</p>
        </div>
      ) : (
        <div className="port-cards-grid">
          {sorted.map((card) => {
            const dir = card.pnl == null ? 'flat' : card.pnl > 0 ? 'up' : card.pnl < 0 ? 'down' : 'flat';
            const img = getCardImage(card);
            return (
              <div key={card.id} className="port-card">
                <div className="port-card-header">
                  {img && (
                    <img
                      className="port-tcg-img"
                      src={img}
                      alt=""
                      onClick={() => setPreviewCard(card)}
                    />
                  )}
                  <div>
                    <div className="port-card-name">{card.name}</div>
                    <div className="port-card-meta">
                      {card.set && <span>{card.set}</span>}
                      {card.condition && <span className="tag">{card.condition}</span>}
                      {card.edition === '1st Edition' && <span className="tag tag-edition">1st Ed</span>}
                    </div>
                  </div>
                  <div className="port-card-menu-wrap">
                    <button
                      className="port-card-menu-btn"
                      onClick={() => setOpenMenuId(openMenuId === card.id ? null : card.id)}
                      title="Card options"
                    >
                      &#8942;
                    </button>
                    {openMenuId === card.id && (
                      <div className="port-card-menu">
                        <button onClick={() => { setOpenMenuId(null); openEdit(card); }}>Edit</button>
                        <button onClick={() => handleDuplicate(card)}>Duplicate</button>
                        <button className="port-card-menu-danger" onClick={() => handleDelete(card)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="port-card-body">
                  <div className="port-cell">
                    <span className="port-cell-lbl">Purchase</span>
                    <span className="port-cell-val">${fmtD(card.purchasePrice || 0)}</span>
                  </div>
                  <div className="port-cell">
                    <span className="port-cell-lbl">Est. Value</span>
                    <span className={`port-cell-val ${card.estValue == null ? 'muted' : ''}`}>
                      {card.estValue != null ? `$${fmtD(card.estValue)}` : 'No data'}
                    </span>
                  </div>
                  <div className="port-cell">
                    <span className="port-cell-lbl">P&amp;L</span>
                    <span className={`port-cell-val ${card.pnl == null ? 'muted' : dir}`}>
                      {card.pnl != null ? `${card.pnl >= 0 ? '+' : ''}$${fmtD(Math.abs(card.pnl))}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="port-card-footer">
                  <span className={`pnl-badge ${dir}`}>
                    {card.pnlPct != null ? `${card.pnlPct >= 0 ? '+' : ''}${card.pnlPct.toFixed(1)}%` : 'N/A'}
                  </span>
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

      {/* ---- CSV import preview modal ---- */}
      {showImportModal && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-set-name">Import Preview</div>
                <div className="modal-set-sub">
                  {importCounts.matched} matched · {importCounts.ambiguous} need a pick · {importCounts.unmatched} unmatched
                  {' · '}{importCounts.included} of {importRows.length} rows will be imported
                </div>
              </div>
              <button className="modal-close" onClick={closeImportModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Row</th>
                      <th>CSV Entry</th>
                      <th>Match</th>
                      <th>Condition</th>
                      <th>Price</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr key={row._line} className={row.skip ? 'import-row-skipped' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!row.skip}
                            onChange={() => toggleRowSkip(row._line)}
                          />
                        </td>
                        <td className="import-line-num">{row._line}</td>
                        <td>
                          <div className="import-csv-entry">{row.name || <em>(no name)</em>}</div>
                          <div className="import-csv-sub">
                            {[row.set, row.number && `#${row.number}`].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td>
                          {row.match.status === 'matched' && (
                            <span className="import-match-badge matched">
                              {row.match.candidates[0].name} ({setNameForId(row.match.candidates[0].setId)} #{row.match.candidates[0].number})
                            </span>
                          )}
                          {row.match.status === 'ambiguous' && (
                            <>
                              <span className="import-match-badge ambiguous">Pick one</span>
                              <select
                                value={row.selectedIndex}
                                onChange={(e) => setRowCandidate(row._line, Number(e.target.value))}
                              >
                                {row.match.candidates.map((c, i) => (
                                  <option key={c.id} value={i}>
                                    {c.name} — {setNameForId(c.setId)} #{c.number} ({c.rarity || 'n/a'})
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          {row.match.status === 'unmatched' && (
                            <span className="import-match-badge unmatched">No match — won't get live pricing</span>
                          )}
                        </td>
                        <td>
                          {row.condition}
                          {row.edition === '1st Edition' &&
                            row.match.status !== 'unmatched' &&
                            isEditionEligible(row.match.candidates[row.selectedIndex]?.setId) &&
                            ' · 1st Ed'}
                        </td>
                        <td>{row.purchasePrice != null ? `$${fmtD(row.purchasePrice)}` : '—'}</td>
                        <td>{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="add-modal-actions">
                <button className="btn btn-secondary" onClick={closeImportModal}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImportConfirm}
                  disabled={importCounts.included === 0}
                >
                  Import {importCounts.included} Card{importCounts.included === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- delete confirmation ---- */}
      {deleteTarget && (
        <div className="add-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="add-modal add-modal-sm" onClick={(e) => e.stopPropagation()}>
            <h4>Delete card?</h4>
            <p className="confirm-body">
              Remove <strong>{deleteTarget.name}</strong> from your portfolio? This can't be undone.
            </p>
            <div className="add-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- card image preview ---- */}
      {previewCard && (
        <div className="port-preview-overlay" onClick={() => setPreviewCard(null)}>
          <div className="port-preview-content" onClick={(e) => e.stopPropagation()}>
            <button className="port-preview-close" onClick={() => setPreviewCard(null)}>
              &times;
            </button>
            <img
              className="port-preview-img"
              src={getHiResImage(previewCard)}
              alt={previewCard.name}
              onError={(e) => {
                const fallback = getCardImage(previewCard);
                if (fallback && e.target.src !== fallback) e.target.src = fallback;
              }}
            />
            <div className="port-preview-caption">
              <div className="port-preview-name">{previewCard.name}</div>
              {(previewCard.set || previewCard.number) && (
                <div className="port-preview-meta">
                  {previewCard.set}
                  {previewCard.number ? ` · #${previewCard.number}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
