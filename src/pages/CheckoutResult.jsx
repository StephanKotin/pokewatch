import React from 'react';
import './CheckoutResult.css';

export default function CheckoutResult({ status, onGoToShop, onViewOrders, user }) {
  const success = status === 'success';
  return (
    <div className="checkout-result-page">
      <div className="checkout-result-icon">{success ? '✅' : '↩️'}</div>
      <h2>{success ? 'Order confirmed!' : 'Checkout cancelled'}</h2>
      <p>
        {success
          ? "Thanks for your order — a confirmation email is on its way."
          : "No charge was made. Your cart is still saved if you'd like to try again."}
      </p>
      {/* Only offered to signed-in buyers: a guest's order isn't attached to
          any account yet, so the page would just look empty to them. */}
      {success && user && onViewOrders && (
        <button className="btn btn-primary" onClick={onViewOrders}>
          View My Orders
        </button>
      )}
      <button className="btn btn-primary" onClick={onGoToShop}>
        Back to Shop
      </button>
    </div>
  );
}
