import React from 'react';
import './CheckoutResult.css';

export default function CheckoutResult({ status, onGoToShop }) {
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
      <button className="btn btn-primary" onClick={onGoToShop}>
        Back to Shop
      </button>
    </div>
  );
}
