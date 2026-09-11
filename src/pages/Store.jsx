import React, { useEffect, useState } from 'react';
import { fetchProducts } from '../api/store';
import { fmtPrice } from '../utils/format';
import './Store.css';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'single', label: 'Singles' },
  { key: 'sealed', label: 'Sealed' },
];

export default function Store({ onAddToCart, onOpenProduct, toast }) {
  const [filter, setFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProducts(filter === 'all' ? undefined : filter)
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((e) => console.warn('Failed to load products:', e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="store-page">
      <div className="store-header">
        <h2 className="store-title">Shop</h2>
        <div className="store-filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`store-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="modal-loading">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <p>No products available yet. Check back soon.</p>
        </div>
      ) : (
        <div className="cards-grid store-grid">
          {products.map((p) => (
            <div key={p.id} className="tcg-card store-card" onClick={() => onOpenProduct(p.id)}>
              <div className="tcg-card-img-wrap store-img-wrap">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="tcg-card-img" />
                ) : (
                  <div className="tcg-card-img-placeholder">{p.type === 'sealed' ? '📦' : '🃏'}</div>
                )}
              </div>
              <div className="tcg-card-info">
                <div className="tcg-card-name">{p.name}</div>
                <div className="tcg-card-sub">{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</div>
                <div className="store-price">${fmtPrice(p.price_cents)}</div>
                <button
                  className="btn-add-watch"
                  disabled={p.stock <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCart(p);
                    toast && toast(`Added "${p.name}" to cart`);
                  }}
                >
                  {p.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
