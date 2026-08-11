import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { EDITIONS, isEditionEligible } from '../data/editions';
import { fetchSets, fetchSetCards } from '../api/poketrace';
import { rarityClass } from '../utils/format';
import './Catalogue.css';

const RARITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'holo', label: 'Holo+' },
  { key: 'ultra', label: 'Ultra Rare' },
  { key: 'secret', label: 'Secret' },
];

export default function Catalogue({ watchlist, addCard, portfolio, addItem, toast }) {
  const [lang, setLang] = useState('en');
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
            lang,
          }))
        );
      })
      .catch(() => { if (!cancelled) setSets([]); })
      .finally(() => { if (!cancelled) setSetsLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  // PokeTrace's /sets doesn't return a usable releaseDate (confirmed null
  // across the catalogue live), so there's no signal left to group sets
  // into eras — just an alphabetical, searchable list instead. With
  // hundreds of English sets in PokeTrace's catalogue, a name filter is
  // the only practical way to find one.
  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    const filtered = q ? sets.filter((s) => s.name.toLowerCase().includes(q)) : sets;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, setSearch]);

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
  };

  const editionEligible = modalSet ? isEditionEligible(modalSet.name) : false;

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
        condition: addCondition,
        edition,
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
              onClick={() => setLang('jp')}
            >
              Japanese
              <span className="cat-lang-badge">Coming Soon</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---- set search ---- */}
      <div className="era-filters">
        <div className="modal-search-wrap">
          <input
            type="text"
            placeholder="Search sets..."
            value={setSearch}
            onChange={(e) => setSetSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ---- set grid ---- */}
      {setsLoading && (
        <div className="modal-loading">
          <div className="scan-spinner" />
          Loading sets...
        </div>
      )}
      {!setsLoading && filteredSets.length > 0 && (
        <div className="cat-sets-row">
          {filteredSets.map((s) => (
            <div key={s.id} className="cat-set-card" onClick={() => openSet(s)}>
              <div className="cat-set-img-wrap">
                <div className="cat-set-logo-placeholder">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="cat-set-info">
                <div className="cat-set-name">
                  {s.name}
                  {s.lang === 'jp' && <span className="jp-badge">JP</span>}
                </div>
                <div className="cat-set-meta">
                  <span className="cat-set-count">{s.cardCount} cards</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!setsLoading && filteredSets.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">&#128270;</div>
          <p>No sets match this filter.</p>
        </div>
      )}

      {/* ---- set modal ---- */}
      {modalSet && (
        <div className="modal-overlay" onClick={() => setModalSet(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="cat-set-logo-placeholder">
                {modalSet.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="modal-set-name">{modalSet.name}</h3>
                <p className="modal-set-sub">{modalSet.cardCount} cards</p>
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

            {editionEligible && (
              <div className="form-group">
                <label>Edition</label>
                <select value={addEdition} onChange={(e) => setAddEdition(e.target.value)}>
                  {EDITIONS.map((e) => (
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
