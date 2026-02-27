import React, { useState, useMemo, useCallback } from 'react';
import { ALL_SETS, JP_SETS } from '../data/sets';
import { ERAS, getEra } from '../data/eraMap';
import { fetchTCGCards, TCG_CDN } from '../api/poketrace';
import { rarityClass } from '../utils/format';
import './Catalogue.css';

const RARITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'holo', label: 'Holo+' },
  { key: 'ultra', label: 'Ultra Rare' },
  { key: 'secret', label: 'Secret' },
];

export default function Catalogue({ tcgApiKey, watchlist, addCard, portfolio, addItem, toast }) {
  const [lang, setLang] = useState('en');
  const [search, setSearch] = useState('');
  const [eraFilter, setEraFilter] = useState('all');
  const [modalSet, setModalSet] = useState(null);
  const [modalCards, setModalCards] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [addTarget, setAddTarget] = useState(null);
  const [addMode, setAddMode] = useState('watchlist');
  const [addCondition, setAddCondition] = useState('Near Mint');
  const [addMaxPrice, setAddMaxPrice] = useState('');
  const [addPurchasePrice, setAddPurchasePrice] = useState('');
  const [addPurchaseDate, setAddPurchaseDate] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const sets = lang === 'jp' ? JP_SETS : ALL_SETS;

  /* ---- derived era list ---- */
  const eras = useMemo(() => {
    const seen = new Set();
    return sets.reduce((acc, s) => {
      const era = getEra(s.series);
      if (!seen.has(era.key)) {
        seen.add(era.key);
        acc.push(era);
      }
      return acc;
    }, []);
  }, [sets]);

  /* ---- filtered & grouped sets ---- */
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = sets.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.series.toLowerCase().includes(q))
        return false;
      if (eraFilter !== 'all' && getEra(s.series).key !== eraFilter) return false;
      return true;
    });

    const groups = [];
    const seen = new Set();
    for (const s of filtered) {
      const era = getEra(s.series);
      if (!seen.has(era.key)) {
        seen.add(era.key);
        groups.push({ era, sets: [] });
      }
      groups.find((g) => g.era.key === era.key).sets.push(s);
    }
    return groups;
  }, [sets, search, eraFilter]);

  /* ---- open set modal ---- */
  const openSet = useCallback(
    async (set) => {
      setModalSet(set);
      setModalCards([]);
      setModalSearch('');
      setRarityFilter('all');
      setModalLoading(true);
      try {
        const cards = await fetchTCGCards(set.id, tcgApiKey);
        setModalCards(cards);
      } catch {
        // fallback: generate placeholder cards from CDN
        const fallback = Array.from({ length: set.total || set.printedTotal }, (_, i) => ({
          id: `${set.id}-${i + 1}`,
          name: `Card #${i + 1}`,
          number: String(i + 1),
          rarity: '',
          images: { small: `${TCG_CDN}/${set.id}/${i + 1}.png` },
        }));
        setModalCards(fallback);
      } finally {
        setModalLoading(false);
      }
    },
    [tcgApiKey]
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
    setAddMaxPrice('');
    setAddPurchasePrice('');
    setAddPurchaseDate('');
    setAddNotes('');
  };

  /* ---- submit add ---- */
  const handleAddSubmit = () => {
    if (!addTarget) return;

    if (addMode === 'watchlist') {
      addCard({
        id: addTarget.id,
        cardId: addTarget.id,
        name: addTarget.name,
        set: modalSet?.name || '',
        setId: modalSet?.id || '',
        number: addTarget.number,
        rarity: addTarget.rarity || '',
        image: addTarget.images?.small || `${TCG_CDN}/${modalSet?.id}/${addTarget.number}.png`,
        condition: addCondition,
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
        image: addTarget.images?.small || `${TCG_CDN}/${modalSet?.id}/${addTarget.number}.png`,
        condition: addCondition,
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
          <div className="cat-search-wrap">
            <span className="cat-search-icon">&#128269;</span>
            <input
              type="text"
              placeholder="Search sets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cat-lang-tabs">
            <button
              className={`cat-lang-btn${lang === 'en' ? ' active' : ''}`}
              onClick={() => { setLang('en'); setEraFilter('all'); setSearch(''); }}
            >
              EN
            </button>
            <button
              className={`cat-lang-btn${lang === 'jp' ? ' active' : ''}`}
              onClick={() => { setLang('jp'); setEraFilter('all'); setSearch(''); }}
            >
              JP
            </button>
          </div>
        </div>
      </div>

      {/* ---- era filters ---- */}
      <div className="era-filters">
        <button
          className={`era-btn${eraFilter === 'all' ? ' active' : ''}`}
          onClick={() => setEraFilter('all')}
        >
          All Eras
        </button>
        {eras.map((era) => (
          <button
            key={era.key}
            className={`era-btn${eraFilter === era.key ? ' active' : ''}`}
            style={eraFilter === era.key ? { borderColor: era.color, color: era.color } : {}}
            onClick={() => setEraFilter(era.key)}
          >
            {era.label}
          </button>
        ))}
      </div>

      {/* ---- grouped sets ---- */}
      {grouped.map((group) => (
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
                  <img
                    className="cat-set-logo"
                    src={`https://images.pokemontcg.io/${s.id}/logo.png`}
                    alt={s.name}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                    }}
                  />
                  <div className="cat-set-logo-placeholder" style={{ display: 'none' }}>
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                <div className="cat-set-info">
                  <div className="cat-set-name">
                    {s.name}
                    {s.lang === 'jp' && <span className="jp-badge">JP</span>}
                  </div>
                  <div className="cat-set-meta">
                    <span className="cat-set-date">{s.releaseDate?.slice(0, 4)}</span>
                    <span className="cat-set-count">{s.printedTotal || s.total} cards</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">&#128270;</div>
          <p>No sets match your search.</p>
        </div>
      )}

      {/* ---- set modal ---- */}
      {modalSet && (
        <div className="modal-overlay" onClick={() => setModalSet(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <img
                className="modal-set-logo"
                src={`https://images.pokemontcg.io/${modalSet.id}/logo.png`}
                alt=""
                onError={(e) => (e.target.style.display = 'none')}
              />
              <div>
                <h3 className="modal-set-name">{modalSet.name}</h3>
                <p className="modal-set-sub">
                  {modalSet.series} &middot; {modalSet.releaseDate} &middot;{' '}
                  {modalSet.printedTotal || modalSet.total} cards
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
                            src={card.images?.small || `${TCG_CDN}/${modalSet.id}/${card.number}.png`}
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
