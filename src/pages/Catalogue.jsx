import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getEra } from '../data/eraMap';
import { isEditionEligible, editionsForSet } from '../data/editions';
import { fetchSets, fetchSetCards, fetchCardGrades } from '../api/poketrace';
import { formatGradeTier, sortGradeOptions } from '../data/grades';
import { rarityClass } from '../utils/format';
import './Catalogue.css';

const RARITY_FILTERS = [
  { key: 'holo', label: 'Holo+' },
  { key: 'secret', label: 'Secret' },
  { key: 'ultra', label: 'Ultra Rare' },
  { key: 'all', label: 'All' },
];

export default function Catalogue({ watchlist, addCard, portfolio, addItem, toast }) {
  const [lang, setLang] = useState('en');
  const [eraFilter, setEraFilter] = useState('all');
  const [setSearch, setSetSearch] = useState('');
  const [modalSet, setModalSet] = useState(null);
  const [modalCards, setModalCards] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [addTarget, setAddTarget] = useState(null);
  const [addMode, setAddMode] = useState('watchlist');
  const [addCondition, setAddCondition] = useState('Near Mint');
  const [addEdition, setAddEdition] = useState('Unlimited');
  const [addMaxPrice, setAddMaxPrice] = useState('');
  const [addPurchasePrice, setAddPurchasePrice] = useState('');
  const [addPurchaseDate, setAddPurchaseDate] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addGraded, setAddGraded] = useState(false);
  const [addGradeTier, setAddGradeTier] = useState('');
  const [gradeOptions, setGradeOptions] = useState([]);
  const [gradeOptionsLoading, setGradeOptionsLoading] = useState(false);

  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);

  /* ---- load sets from PokeTrace whenever the language tab changes ---- */
  useEffect(() => {
    let cancelled = false;
    setSetsLoading(true);
    fetchSets(lang === 'jp' ? 'pokemon-japanese' : 'pokemon')
      .then((data) => {
        if (cancelled) return;
        setSets(
          (data || []).map((s) => ({
            id: s.slug,
            name: s.name,
            cardCount: s.cardCount,
            // Only present when the server matched this set by name against
            // pokemontcg.io's set list (PokeTrace itself has none of this) —
            // undefined for anything that didn't match, which just falls
            // into the "Other Sets" bucket below with no logo.
            releaseDate: s.releaseDate || null,
            series: s.series || null,
            logo: s.logo || null,
            // Only present on the synthetic per-edition entries the server
            // splits out for the 10 WOTC-era sets (see WOTC_SET_EDITIONS in
            // server.js) — undefined for every other set.
            editionLabel: s.editionLabel || null,
            editionOrder: s.editionOrder ?? null,
            lang,
          }))
        );
      })
      .catch(() => { if (!cancelled) setSets([]); })
      .finally(() => { if (!cancelled) setSetsLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  // Stable era ordering (most recent era first, "Other Sets" always last),
  // computed once from the full unfiltered set list so era filter buttons
  // and grouped section order don't shuffle as the search/era filter change.
  const eraOrder = useMemo(() => {
    const eraByKey = new Map();
    const maxDateByKey = new Map();
    for (const s of sets) {
      const era = getEra(s.series);
      if (!eraByKey.has(era.key)) eraByKey.set(era.key, era);
      if (s.releaseDate) {
        const cur = maxDateByKey.get(era.key);
        if (!cur || s.releaseDate > cur) maxDateByKey.set(era.key, s.releaseDate);
      }
    }
    return [...eraByKey.keys()]
      .sort((a, b) => {
        if (a === 'other') return 1;
        if (b === 'other') return -1;
        return (maxDateByKey.get(b) || '').localeCompare(maxDateByKey.get(a) || '');
      })
      .map((k) => eraByKey.get(k));
  }, [sets]);

  /* ---- filtered & grouped sets, most-recent-first within each era ---- */
  const grouped = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    const filtered = sets.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (eraFilter !== 'all' && getEra(s.series).key !== eraFilter) return false;
      return true;
    });

    const byKey = new Map();
    for (const s of filtered) {
      const era = getEra(s.series);
      if (!byKey.has(era.key)) byKey.set(era.key, { era, sets: [] });
      byKey.get(era.key).sets.push(s);
    }
    for (const g of byKey.values()) {
      g.sets.sort(
        (a, b) =>
          (b.releaseDate || '').localeCompare(a.releaseDate || '') ||
          a.name.localeCompare(b.name) ||
          (a.editionOrder ?? 0) - (b.editionOrder ?? 0)
      );
    }
    return eraOrder.filter((era) => byKey.has(era.key)).map((era) => byKey.get(era.key));
  }, [sets, eraFilter, setSearch, eraOrder]);

  /* ---- open set modal ---- */
  const openSet = useCallback(
    async (set) => {
      setModalSet(set);
      setModalCards([]);
      setModalSearch('');
      setRarityFilter('all');
      setModalLoading(true);
      try {
        const cards = await fetchSetCards(set.id);
        setModalCards(
          (cards || []).map((c) => ({
            id: c.id,
            name: c.name,
            number: (c.cardNumber || '').split('/')[0].replace(/^0+(?=\d)/, ''),
            rarity: c.rarity || '',
            image: c.image || '',
          }))
        );
      } catch {
        setModalCards([]);
      } finally {
        setModalLoading(false);
      }
    },
    []
  );

  /* ---- filtered modal cards ---- */
  const filteredCards = useMemo(() => {
    let cards = modalCards;
    if (modalSearch) {
      const q = modalSearch.toLowerCase();
      cards = cards.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.number && c.number.toLowerCase().includes(q))
      );
    }
    if (rarityFilter !== 'all') {
      cards = cards.filter((c) => {
        const rc = rarityClass(c.rarity);
        if (rarityFilter === 'holo') return rc === 'holo' || rc === 'ultra' || rc === 'secret' || rc === 'special';
        if (rarityFilter === 'ultra') return rc === 'ultra' || rc === 'secret';
        if (rarityFilter === 'secret') return rc === 'secret';
        return true;
      });
    }
    return cards;
  }, [modalCards, modalSearch, rarityFilter]);

  /* ---- watchlist lookup ---- */
  const isOnWatchlist = useCallback(
    (cardId) => watchlist.some((w) => w.cardId === cardId || w.id === cardId),
    [watchlist]
  );

  /* ---- portfolio lookup ---- */
  const isInPortfolio = useCallback(
    (cardId) => (portfolio || []).some((p) => p.cardId === cardId || p.id === cardId),
    [portfolio]
  );

  /* ---- open add modal ---- */
  const openAddModal = (card, mode) => {
    setAddTarget(card);
    setAddMode(mode);
    setAddCondition('Near Mint');
    setAddEdition('Unlimited');
    setAddMaxPrice('');
    setAddPurchasePrice('');
    setAddPurchaseDate('');
    setAddNotes('');
    setAddGraded(false);
    setAddGradeTier('');
    setGradeOptions([]);
  };

  // Graded-tier options are discovered live per card from PokeTrace (see
  // fetchCardGrades) rather than guessed — PokeTrace only documents grading
  // *company* names (PSA/BGS/...), not the exact tier-string values.
  useEffect(() => {
    if (addMode !== 'portfolio' || !addGraded || !addTarget) {
      setGradeOptions([]);
      return;
    }
    let cancelled = false;
    setGradeOptionsLoading(true);
    fetchCardGrades(addTarget.id)
      .then((res) => {
        if (!cancelled) setGradeOptions(sortGradeOptions(res?.gradedOptions));
      })
      .catch(() => { if (!cancelled) setGradeOptions([]); })
      .finally(() => { if (!cancelled) setGradeOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [addMode, addGraded, addTarget]);

  const editionEligible = modalSet ? isEditionEligible(modalSet.name) : false;
  const editionOptions = editionsForSet(modalSet?.name);

  /* ---- submit add ---- */
  const handleAddSubmit = () => {
    if (!addTarget) return;
    const edition = editionEligible ? addEdition : null;

    if (addMode === 'watchlist') {
      addCard({
        id: addTarget.id,
        cardId: addTarget.id,
        name: addTarget.name,
        set: modalSet?.name || '',
        setId: modalSet?.id || '',
        number: addTarget.number,
        rarity: addTarget.rarity || '',
        image: addTarget.image || '',
        condition: addCondition,
        edition,
        maxPrice: addMaxPrice ? parseFloat(addMaxPrice) : null,
      });
      toast && toast(`${addTarget.name} added to watchlist`);
    } else {
      addItem({
        id: addTarget.id,
        cardId: addTarget.id,
        name: addTarget.name,
        set: modalSet?.name || '',
        setId: modalSet?.id || '',
        number: addTarget.number,
        rarity: addTarget.rarity || '',
        image: addTarget.image || '',
        condition: addGraded ? null : addCondition,
        edition,
        isGraded: addGraded,
        gradeTier: addGraded ? addGradeTier || null : null,
        gradeLabel: addGraded && addGradeTier ? formatGradeTier(addGradeTier) : null,
        purchasePrice: addPurchasePrice ? parseFloat(addPurchasePrice) : null,
        purchaseDate: addPurchaseDate || null,
        notes: addNotes,
      });
      toast && toast(`${addTarget.name} added to portfolio`);
    }

    setAddTarget(null);
  };

  return (
    <div className="catalogue-page">
      {/* ---- header ---- */}
      <div className="cat-header">
        <h2 className="listings-title">Set Catalogue</h2>
        <div className="cat-controls">
          <div className="cat-lang-tabs">
            <button
              className={`cat-lang-btn${lang === 'en' ? ' active' : ''}`}
              onClick={() => { setLang('en'); setEraFilter('all'); }}
            >
              English
            </button>
            <button
              className={`cat-lang-btn${lang === 'jp' ? ' active' : ''}`}
              onClick={() => { setLang('jp'); setEraFilter('all'); }}
            >
              Japanese
              <span className="cat-lang-badge">Coming Soon</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---- era filters + set search ---- */}
      <div className="era-filters">
        <button
          className={`era-btn${eraFilter === 'all' ? ' active' : ''}`}
          onClick={() => setEraFilter('all')}
        >
          All Eras
        </button>
        {eraOrder.map((era) => (
          <button
            key={era.key}
            className={`era-btn${eraFilter === era.key ? ' active' : ''}`}
            style={eraFilter === era.key ? { borderColor: era.color, color: era.color } : {}}
            onClick={() => setEraFilter(era.key)}
          >
            {era.label}
          </button>
        ))}
        <div className="modal-search-wrap cat-set-search">
          <input
            type="text"
            placeholder="Search sets..."
            value={setSearch}
            onChange={(e) => setSetSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ---- grouped sets, most recent era first ---- */}
      {setsLoading && (
        <div className="modal-loading">
          <div className="scan-spinner" />
          Loading sets...
        </div>
      )}
      {!setsLoading && grouped.map((group) => (
        <section key={group.era.key} className="cat-era-section">
          <div className="cat-era-heading">
            <span className="cat-era-title" style={{ color: group.era.color }}>
              {group.era.label}
            </span>
            <span className="cat-era-line" style={{ backgroundColor: group.era.color }} />
            <span className="cat-era-count">{group.sets.length} sets</span>
          </div>
          <div className="cat-sets-row">
            {group.sets.map((s) => (
              <div key={s.id} className="cat-set-card" onClick={() => openSet(s)}>
                <div className="cat-set-img-wrap">
                  {s.logo && (
                    <img
                      className="cat-set-logo"
                      src={s.logo}
                      alt={s.name}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                      }}
                    />
                  )}
                  <div
                    className="cat-set-logo-placeholder"
                    style={s.logo ? { display: 'none' } : undefined}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                <div className="cat-set-info">
                  <div className="cat-set-name">
                    {s.name}
                    {s.editionLabel && <span className="cat-edition-badge">{s.editionLabel}</span>}
                    {s.lang === 'jp' && <span className="jp-badge">JP</span>}
                  </div>
                  <div className="cat-set-meta">
                    {s.releaseDate && <span className="cat-set-date">{s.releaseDate.slice(0, 4)}</span>}
                    <span className="cat-set-count">{s.cardCount} cards</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!setsLoading && grouped.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">&#128270;</div>
          <p>No sets match this filter.</p>
        </div>
      )}

      {/* ---- set modal ---- */}
      {modalSet && (
        <div className="modal-overlay" onClick={() => setModalSet(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-sticky-top">
              <div className="modal-header">
                {modalSet.logo && (
                  <img
                    className="modal-set-logo"
                    src={modalSet.logo}
                    alt=""
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                    }}
                  />
                )}
                <div
                  className="cat-set-logo-placeholder"
                  style={modalSet.logo ? { display: 'none' } : undefined}
                >
                  {modalSet.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="modal-set-name">
                    {modalSet.name}
                    {modalSet.editionLabel && <span className="cat-edition-badge">{modalSet.editionLabel}</span>}
                  </h3>
                  <p className="modal-set-sub">
                    {modalSet.releaseDate && <>{modalSet.releaseDate} &middot; </>}
                    {modalSet.cardCount} cards
                  </p>
                </div>
                <button className="modal-close" onClick={() => setModalSet(null)}>
                  &times;
                </button>
              </div>

              <div className="modal-toolbar">
                <div className="modal-search-wrap">
                  <input
                    type="text"
                    placeholder="Search cards..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                  />
                </div>
                {RARITY_FILTERS.map((rf) => (
                  <button
                    key={rf.key}
                    className={`modal-filter-btn${rarityFilter === rf.key ? ' active' : ''}`}
                    onClick={() => setRarityFilter(rf.key)}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-body">
              {modalLoading ? (
                <div className="modal-loading">
                  <div className="scan-spinner" />
                  Loading cards...
                </div>
              ) : filteredCards.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">&#128196;</div>
                  <p>No cards found.</p>
                </div>
              ) : (
                <div className="cards-grid">
                  {filteredCards.map((card) => {
                    const rc = rarityClass(card.rarity);
                    const watched = isOnWatchlist(card.id);
                    const owned = isInPortfolio(card.id);
                    return (
                      <div
                        key={card.id}
                        className={`tcg-card${watched ? ' on-watchlist' : ''}${rc ? ' ' + rc : ''}`}
                      >
                        <div className="tcg-card-img-wrap">
                          <img
                            className="tcg-card-img"
                            src={card.image}
                            alt={card.name}
                            loading="lazy"
                          />
                        </div>
                        <div className="tcg-card-info">
                          <span className="tcg-card-name">{card.name}</span>
                          <span className="tcg-card-sub">
                            #{card.number}
                            {card.rarity && (
                              <span className={`rarity-badge ${rc}`}>{card.rarity}</span>
                            )}
                          </span>
                        </div>
                        <div className="tcg-card-actions">
                          <button
                            className="btn-add-watch"
                            disabled={watched}
                            onClick={() => {
                              if (watched) return;
                              openAddModal(card, 'watchlist');
                            }}
                          >
                            {watched ? 'Watching' : 'Watch'}
                          </button>
                          <button
                            className="btn-add-portfolio"
                            disabled={owned}
                            onClick={() => {
                              if (owned) return;
                              openAddModal(card, 'portfolio');
                            }}
                          >
                            {owned ? 'Owned' : 'Collect'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- add mini-modal ---- */}
      {addTarget && (
        <div className="add-modal-overlay" onClick={() => setAddTarget(null)}>
          <div className="add-modal" onClick={(e) => e.stopPropagation()}>
            <h4>
              Add "{addTarget.name}" to {addMode === 'watchlist' ? 'Watchlist' : 'Portfolio'}
            </h4>

            <div className="add-mode-tabs">
              <button
                className={`add-mode-btn${addMode === 'watchlist' ? ' active' : ''}`}
                onClick={() => setAddMode('watchlist')}
              >
                Watchlist
              </button>
              <button
                className={`add-mode-btn${addMode === 'portfolio' ? ' active' : ''}`}
                onClick={() => setAddMode('portfolio')}
              >
                Portfolio
              </button>
            </div>

            {addMode === 'portfolio' && (
              <div className="add-mode-tabs">
                <button
                  type="button"
                  className={`add-mode-btn${!addGraded ? ' active' : ''}`}
                  onClick={() => { setAddGraded(false); setAddGradeTier(''); }}
                >
                  Raw
                </button>
                <button
                  type="button"
                  className={`add-mode-btn${addGraded ? ' active' : ''}`}
                  onClick={() => setAddGraded(true)}
                >
                  Graded
                </button>
              </div>
            )}

            {addMode === 'portfolio' && addGraded ? (
              <div className="form-group">
                <label>Grade</label>
                {gradeOptionsLoading ? (
                  <div className="form-hint">Loading available grades…</div>
                ) : gradeOptions.length ? (
                  <select value={addGradeTier} onChange={(e) => setAddGradeTier(e.target.value)}>
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
                <select value={addCondition} onChange={(e) => setAddCondition(e.target.value)}>
                  <option>Near Mint</option>
                  <option>Lightly Played</option>
                  <option>Mod. Played</option>
                  <option>Heavily Played</option>
                  <option>Damaged</option>
                </select>
              </div>
            )}

            {editionEligible && (
              <div className="form-group">
                <label>Edition</label>
                <select value={addEdition} onChange={(e) => setAddEdition(e.target.value)}>
                  {editionOptions.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
            )}

            {addMode === 'watchlist' && (
              <div className="form-group">
                <label>Max Price ($)</label>
                <input
                  type="number"
                  placeholder="Optional"
                  value={addMaxPrice}
                  onChange={(e) => setAddMaxPrice(e.target.value)}
                />
              </div>
            )}

            {addMode === 'portfolio' && (
              <>
                <div className="form-group">
                  <label>Purchase Price ($)</label>
                  <input
                    type="number"
                    placeholder="Optional"
                    value={addPurchasePrice}
                    onChange={(e) => setAddPurchasePrice(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Date</label>
                  <input
                    type="date"
                    value={addPurchaseDate}
                    onChange={(e) => setAddPurchaseDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="add-modal-actions">
              <button className="btn btn-secondary" onClick={() => setAddTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddSubmit}>
                Add to {addMode === 'watchlist' ? 'Watchlist' : 'Portfolio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
