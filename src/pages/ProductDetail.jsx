import React, { useEffect, useState } from 'react';
import { fetchProduct } from '../api/store';
import { fmtPrice } from '../utils/format';
import './ProductDetail.css';

export default function ProductDetail({ productId, onAddToCart, onBack, toast }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setQuantity(1);
    fetchProduct(productId)
      .then((data) => {
        if (!cancelled) setProduct(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) return <div className="modal-loading">Loading...</div>;

  if (notFound || !product) {
    return (
      <div className="empty-state">
        <p>Product not found.</p>
        <button className="btn btn-secondary" onClick={onBack}>
          Back to Shop
        </button>
      </div>
    );
  }

  return (
    <div className="product-detail-page">
      <button className="btn-sm product-back-btn" onClick={onBack}>
        ← Back to Shop
      </button>
      <div className="product-detail-grid">
        <div className="tcg-card-img-wrap product-detail-img-wrap">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="tcg-card-img" />
          ) : (
            <div className="tcg-card-img-placeholder">{product.type === 'sealed' ? '📦' : '🃏'}</div>
          )}
        </div>
        <div className="product-detail-info">
          <span className="tag">{product.type === 'sealed' ? 'Sealed Product' : 'Single'}</span>
          <h2 className="product-detail-name">{product.name}</h2>
          <div className="product-detail-price">${fmtPrice(product.price_cents)}</div>
          {product.description && <p className="product-detail-desc">{product.description}</p>}
          <div className="product-detail-stock">
            {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
          </div>
          {product.stock > 0 && (
            <div className="product-detail-actions">
              <input
                type="number"
                min="1"
                max={product.stock}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(product.stock, parseInt(e.target.value, 10) || 1)))
                }
                className="product-qty-input"
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  onAddToCart(product, quantity);
                  toast && toast(`Added "${product.name}" to cart`);
                }}
              >
                Add to Cart
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
