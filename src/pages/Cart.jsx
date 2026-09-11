import React, { useState } from 'react';
import { fmtPrice } from '../utils/format';
import { createCheckoutSession } from '../api/store';
import './Cart.css';

export default function Cart({ cart, onGoToShop, toast }) {
  const { items, removeItem, updateQuantity, subtotalCents } = cart;
  const [checkingOut, setCheckingOut] = useState(false);

  async function handleCheckout() {
    setCheckingOut(true);
    try {
      const { url } = await createCheckoutSession(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      );
      window.location.href = url;
    } catch (e) {
      toast && toast(e.message || 'Checkout failed', 'error');
      setCheckingOut(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🛒</div>
        <p>Your cart is empty.</p>
        <button className="btn btn-primary" onClick={onGoToShop}>
          Browse the Shop
        </button>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h2 className="cart-title">Your Cart</h2>
      <div className="cart-items">
        {items.map((i) => (
          <div key={i.productId} className="card-row cart-item">
            {i.image ? (
              <img src={i.image} alt={i.name} className="cart-item-img" />
            ) : (
              <div className="cart-item-img cart-item-img-placeholder">🃏</div>
            )}
            <div className="cart-item-info">
              <div className="card-name">{i.name}</div>
              <div className="cart-item-price">${fmtPrice(i.priceCents)} each</div>
            </div>
            <input
              type="number"
              min="1"
              max={i.stock || 99}
              value={i.quantity}
              onChange={(e) => updateQuantity(i.productId, Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="product-qty-input"
            />
            <div className="cart-item-total">${fmtPrice(i.priceCents * i.quantity)}</div>
            <button className="btn-danger" onClick={() => removeItem(i.productId)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <div className="cart-subtotal">
          Subtotal: <strong>${fmtPrice(subtotalCents)}</strong>
        </div>
        <div className="form-hint">Shipping and tax are calculated at checkout.</div>
        <button className="btn btn-primary" onClick={handleCheckout} disabled={checkingOut}>
          {checkingOut ? 'Redirecting…' : 'Checkout'}
        </button>
      </div>
    </div>
  );
}
