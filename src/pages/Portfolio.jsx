import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { CONDITIONS, formatGradeTier, isGradeTen, sortGradeOptions } from '../data/grades';
import { extractTierPrice, fetchSets, fetchSetCards, searchCards, fetchCardGrades } from '../api/poketrace';
import Sparkline from '../components/Sparkline';
import {
  rowsFromCSV,
  matchCard,
  resolveSetSlug,
  normalizeCondition,
  normalizeEdition,
  normalizePrice,
  normalizeQuantity,
  normalizeDate,
  normalizeCardNumber,
} from '../utils/csvImport';
import { isEditionEligible } from '../data/editions';
import { fmtD } from '../utils/format';
import { getCardImage } from '../utils/cardImage';
import PortfolioCardDetail from '../components/PortfolioCardDetail';
import './Portfolio.css';

// PokeTrace's raw card shape (id, name, cardNumber, rarity, image,
// set:{slug,name}) normalized to what csvImport's matchCard compares
// against.
function normalizeApiCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: normalizeCardNumber(c.cardNumber),
    rarity: c.rarity || '',
    image: c.image || '',
    setSlug: c.set?.slug || '',
    setName: c.set?.name || '',
  };
}

function uniqueId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(`${baseId}__${n}`)) n++;
  return `${baseId}__${n}`;
}

// Graded cards price off their specific graded tier (e.g. "PSA_10"). Raw
// cards always price off the base ungraded quote regardless of the recorded
// physical condition — see usePortfolioPrices for why. Live prices need
// PokeTrace's full tier name; stored history rows are keyed by the short
// "nm" for raw (to match what /api/price-history returns) or the full
// graded tier string for graded (also matching what the server returns).
function priceTierField(item) {
  return item.isGraded && item.gradeTier ? item.gradeTier : 'NEAR_MINT';
}
function historyGradeKey(item) {
  return item.isGraded && item.gradeTier ? item.gradeTier : 'nm';
}

// Real quote for the item's tier; falls back to the most recent stored
// snapshot for that tier. Returns null when no price data exists yet.
function estimateValue(item, priceEntry) {
  if (priceEntry?.live) {
    const p = extractTierPrice(priceEntry.live, priceTierField(item));
    if (p) return p.avg;
  }
  const key = historyGradeKey(item);
  const hist = (priceEntry?.history || []).filter((h) => h.grade === key);
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
      const key = historyGradeKey(item);
      const entry = priceData[item.id];
      const hist = (entry?.history || []).filter(
        (h) => h.grade === key && h.captured_at * 1000 <= dayMs
      );
      let value = null;
      if (hist.length) {
        value = hist[hist.length - 1].price;
      } else if (i === 0 && entry?.live) {
        const p = extractTierPrice(entry.live, priceTierField(item));
        value = p ? p.avg : null;
      }
      total += value != null ? value : item.purchasePrice || 0;
    }
    points.push({ day: i === 0 ? 'Today' : `${i}d`, value: Math.round(total) });
  }
  return points;
}

export default function Portfolio({ portfolio, addItem, removeItem, priceData, pricesLoading, toast }) {
  const [editItem, setEditItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    set: '',
    condition: 'Near Mint',
    purchasePrice: '',
    purchaseDate: '',
    notes: '',
    isGraded: false,
    gradeTier: '',
    gradeLabel: '',
    cardId: '',
    setId: '',
    number: '',
    image: '',
  });

  // Live card search against PokeTrace (via the server's /api/cards/search
  // proxy — same route CSV import already uses for unmatched-set rows) so
  // the manual Add Card form can resolve a real cardId instead of just
  // free-text name/set. Only searches while no card is selected yet —
  // picking a result sets form.cardId, which both stops the search and
  // (see the grade-options effect below) unlocks the Graded toggle for a
  // brand-new add, not just when editing an already-matched item.
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  useEffect(() => {
    if (!showModal || form.cardId || form.name.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(() => {
      searchCards(form.name.trim())
        .then((res) => {
          if (!cancelled) setSearchResults((res || []).map(normalizeApiCard).slice(0, 8));
        })
        .catch(() => { if (!cancelled) setSearchResults([]); })
        .finally(() => { if (!cancelled) setSearchLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.name, form.cardId, showModal]);

  const showSearchDropdown = nameFocused && !form.cardId && form.name.trim().length >= 2;

  const selectSearchResult = (card) => {
    setForm((f) => ({
      ...f,
      name: card.name,
      set: card.setName,
      setId: card.setSlug,
      number: card.number,
      image: card.image,
      cardId: card.id,
      // A previously-picked grade almost certainly doesn't apply to a
      // newly-selected card — clear it rather than carry it forward.
      isGraded: false,
      gradeTier: '',
      gradeLabel: '',
    }));
    setSearchResults([]);
  };

  const clearSelectedCard = () => {
    setForm((f) => ({ ...f, cardId: '', setId: '', number: '', image: '', isGraded: false, gradeTier: '', gradeLabel: '' }));
  };

  // Graded-tier options are discovered live from PokeTrace per card (see
  // fetchCardGrades) rather than guessed, since PokeTrace doesn't publish a
  // fixed tier-string list. Only fetchable once a real cardId is known —
  // either from editing an item already matched via Catalogue/CSV import,
  // or from picking a result out of the search above on a brand-new add.
  const [gradeOptions, setGradeOptions] = useState([]);
  const [gradeOptionsLoading, setGradeOptionsLoading] = useState(false);

  useEffect(() => {
    if (!showModal || !form.isGraded || !form.cardId) {
      setGradeOptions([]);
      return;
    }
    let cancelled = false;
    setGradeOptionsLoading(true);
    fetchCardGrades(form.cardId)
      .then((res) => {
        if (!cancelled) setGradeOptions(sortGradeOptions(res?.gradedOptions));
      })
      .catch(() => { if (!cancelled) setGradeOptions([]); })
      .finally(() => { if (!cancelled) setGradeOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [showModal, form.isGraded, form.cardId]);

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

      // Resolve each row's set name against PokeTrace's live set list, then
      // fetch each *distinct* resolved slug's cards once (most CSVs cluster
      // around a handful of sets) instead of loading the whole catalogue.
      const sets = await fetchSets('pokemon');
      const slugByLine = new Map();
      const distinctSlugs = new Set();
      for (const r of parsed) {
        const slug = resolveSetSlug(r.set, sets);
        if (slug) {
          slugByLine.set(r._line, slug);
          distinctSlugs.add(slug);
        }
      }
      const cardsBySlug = new Map();
      await Promise.all(
        [...distinctSlugs].map(async (slug) => {
          const cards = await fetchSetCards(slug);
          cardsBySlug.set(slug, (cards || []).map(normalizeApiCard));
        })
      );

      const rows = await Promise.all(parsed.map(async (r) => {
        const slug = slugByLine.get(r._line);
        const cards = slug
          ? cardsBySlug.get(slug)
          : (await searchCards(r.name, r.number).catch(() => [])).map(normalizeApiCard);
        const match = matchCard(r, cards);
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
      }));
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
          set: candidate ? candidate.setName : row.set || '',
          setId: candidate ? candidate.setSlug : null,
          number: candidate ? candidate.number : row.number || '',
          image: candidate ? candidate.image : null,
          condition: row.condition,
          edition: candidate && isEditionEligible(candidate.setName) ? row.edition : null,
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
    setForm({
      name: '', set: '', condition: 'Near Mint', purchasePrice: '', purchaseDate: '', notes: '',
      isGraded: false, gradeTier: '', gradeLabel: '',
      cardId: '', setId: '', number: '', image: '',
    });
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
      isGraded: !!item.isGraded,
      gradeTier: item.gradeTier || '',
      gradeLabel: item.gradeLabel || '',
      cardId: item.cardId || '',
      setId: item.setId || '',
      number: item.number || '',
      image: item.image || '',
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
      isGraded: !!card.isGraded,
      gradeTier: card.gradeTier || null,
      gradeLabel: card.gradeLabel || null,
      purchasePrice: card.purchasePrice || 0,
      purchaseDate: card.purchaseDate || new Date().toISOString().slice(0, 10),
      notes: card.notes || '',
    });
    toast && toast(`${card.name} duplicated`);
    setOpenMenuId(null);
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailCard, setDetailCard] = useState(null);

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
      cardId: form.cardId || null,
      setId: form.setId || null,
      number: form.number || null,
      image: form.image || null,
      condition: form.isGraded ? null : form.condition,
      isGraded: form.isGraded,
      gradeTier: form.isGraded ? form.gradeTier || null : null,
      gradeLabel: form.isGraded ? form.gradeLabel || null : null,
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

                <div
                  className="port-card-image-wrap"
                  onClick={() => setDetailCard(card)}
                >
                  {img ? (
                    <img className="port-card-image" src={img} alt="" />
                  ) : (
                    <div className="port-card-image-placeholder">?</div>
                  )}
                </div>

                <div className="port-card-info">
                  <div className="port-card-name" title={card.name}>{card.name}</div>
                  <div className="port-card-meta">
                    {card.set && <span className="port-card-set" title={card.set}>{card.set}</span>}
                    <div className="port-card-tags">
                      {card.isGraded
                        ? <span className={`tag tag-graded${isGradeTen(card.gradeTier) ? ' tag-grade10' : ''}`}>{card.gradeLabel || formatGradeTier(card.gradeTier)}</span>
                        : card.condition && <span className="tag">{card.condition}</span>}
                      {card.edition?.startsWith('1st Edition') && <span className="tag tag-edition">1st Ed</span>}
                    </div>
                  </div>
                </div>

                <div className="port-card-trend">
                  <Sparkline
                    history={priceData[card.id]?.history}
                    gradeKey={historyGradeKey(card)}
                  />
                </div>

                <div className="port-card-stats">
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
                </div>

                <div className="port-card-footer">
                  <span className={`port-cell-val ${card.pnl == null ? 'muted' : dir}`}>
                    {card.pnl != null ? `${card.pnl >= 0 ? '+' : ''}$${fmtD(Math.abs(card.pnl))}` : '—'}
                  </span>
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
            <div className="form-group port-name-search-wrap">
              <label>Card Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) =>
                    f.cardId
                      ? { ...f, name: value, cardId: '', setId: '', number: '', image: '', isGraded: false, gradeTier: '', gradeLabel: '' }
                      : { ...f, name: value }
                  );
                }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder="Search for a card…"
                autoComplete="off"
              />
              {showSearchDropdown && (
                <div className="port-search-results">
                  {searchLoading ? (
                    <div className="port-search-hint">Searching…</div>
                  ) : searchResults.length ? (
                    searchResults.map((c) => (
                      <div key={c.id} className="port-search-result" onMouseDown={() => selectSearchResult(c)}>
                        {c.image ? (
                          <img src={c.image} alt="" className="port-search-result-img" />
                        ) : (
                          <div className="port-search-result-img port-search-result-img-placeholder">?</div>
                        )}
                        <div className="port-search-result-info">
                          <div className="port-search-result-name">{c.name}</div>
                          <div className="port-search-result-meta">
                            {[c.setName, c.number && `#${c.number}`].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="port-search-hint">No matches — you can still add this as free text.</div>
                  )}
                </div>
              )}
            </div>
            {form.cardId ? (
              <div className="form-group">
                <label>Selected Card</label>
                <div className="port-selected-card">
                  {form.image ? (
                    <img src={form.image} alt="" className="port-search-result-img" />
                  ) : (
                    <div className="port-search-result-img port-search-result-img-placeholder">?</div>
                  )}
                  <div className="port-search-result-info">
                    <div className="port-search-result-name">{form.name}</div>
                    <div className="port-search-result-meta">
                      {[form.set, form.number && `#${form.number}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button type="button" className="port-selected-card-clear" onClick={clearSelectedCard} title="Clear selection">
                    &times;
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label>Set</label>
                <input
                  type="text"
                  value={form.set}
                  onChange={(e) => setForm({ ...form, set: e.target.value })}
                  placeholder="e.g. Evolving Skies"
                />
              </div>
            )}
            {form.cardId && (
              <div className="add-mode-tabs">
                <button
                  type="button"
                  className={`add-mode-btn${!form.isGraded ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, isGraded: false, gradeTier: '', gradeLabel: '' })}
                >
                  Raw
                </button>
                <button
                  type="button"
                  className={`add-mode-btn${form.isGraded ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, isGraded: true })}
                >
                  Graded
                </button>
              </div>
            )}

            {form.isGraded ? (
              <div className="form-group">
                <label>Grade</label>
                {gradeOptionsLoading ? (
                  <div className="form-hint">Loading available grades…</div>
                ) : gradeOptions.length ? (
                  <select
                    value={form.gradeTier}
                    onChange={(e) => {
                      const tier = e.target.value;
                      setForm({ ...form, gradeTier: tier, gradeLabel: formatGradeTier(tier) });
                    }}
                  >
                    <option value="">Select a grade…</option>
                    {gradeOptions.map((tier) => (
                      <option key={tier} value={tier}>{formatGradeTier(tier)}</option>
                    ))}
                  </select>
                ) : (
                  <div className="form-hint">No graded price data available for this card yet.</div>
                )}
              </div>
            ) : (
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
            )}
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
                              {row.match.candidates[0].name} ({row.match.candidates[0].setName} #{row.match.candidates[0].number})
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
                                    {c.name} — {c.setName} #{c.number} ({c.rarity || 'n/a'})
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
                            isEditionEligible(row.match.candidates[row.selectedIndex]?.setName) &&
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

      {/* ---- card detail: image + price history/grade comparison ---- */}
      {detailCard && (
        <PortfolioCardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      )}
    </div>
  );
}
