import React, { useEffect, useState } from 'react';
import { fetchMyOrders } from '../api/store';
import { fmtPrice } from '../utils/format';
import './Orders.css';

// The full vocabulary the server accepts, per the guard on
// PUT /api/admin/orders/:id. 'pending' never reaches this page (the query
// filters it out as an abandoned Stripe session) but is listed so the set is
// the same one the admin dropdown writes — the two drifting apart is exactly
// how a customer ends up reading a raw lowercase status.
const STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  fulfilled: 'Shipped',
  cancelled: 'Cancelled',
};

function orderDate(epochSeconds) {
  if (!epochSeconds) return '';
  return new Date(epochSeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// shipping_address is stored as the JSON blob Stripe hands back, so it's parsed
// here rather than in the route — the route stays a passthrough and a
// malformed blob costs a missing address line, not a 500.
function formatAddress(raw) {
  if (!raw) return null;
  let a;
  try {
    a = JSON.parse(raw);
  } catch {
    return null;
  }
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postal_code]
    .filter(Boolean)
    .join(' · ');
}

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyOrders()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load your orders.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Couldn't load orders</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (orders === null) {
    return <div className="orders-loading">Loading your orders…</div>;
  }

  if (!orders.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📦</div>
        <h3>No orders yet</h3>
        {/* Says the quiet part out loud: someone who bought as a guest on a
            different address won't see it here, and would otherwise assume the
            page is broken. */}
        <p>Anything you buy from the shop shows up here, including orders you placed before making an account — as long as they used this same email address.</p>
      </div>
    );
  }

  return (
    <div className="orders-page">
      {orders.map((order) => {
        const address = formatAddress(order.shipping_address);
        return (
          <div className="order-card" key={order.id}>
            <div className="order-head">
              <div>
                <div className="order-date">{orderDate(order.created_at)}</div>
                {/* Stripe's session id is long and means nothing to a buyer;
                    the short prefix is enough to quote in an email. */}
                <div className="order-ref">#{order.id.slice(0, 8)}</div>
              </div>
              <span className={`order-status status-${order.status}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            <ul className="order-items">
              {order.items.map((item, i) => (
                <li key={i}>
                  <span className="item-qty">{item.quantity}×</span>
                  <span className="item-name">{item.name_snapshot}</span>
                  <span className="item-price">${fmtPrice(item.price_cents_snapshot * item.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="order-totals">
              <div><span>Subtotal</span><span>${fmtPrice(order.subtotal_cents)}</span></div>
              {order.shipping_cents > 0 && (
                <div><span>Shipping</span><span>${fmtPrice(order.shipping_cents)}</span></div>
              )}
              {order.tax_cents > 0 && (
                <div><span>Tax</span><span>${fmtPrice(order.tax_cents)}</span></div>
              )}
              <div className="order-total"><span>Total</span><span>${fmtPrice(order.total_cents)}</span></div>
            </div>

            {address && (
              <div className="order-shipping">
                <span className="shipping-label">Shipped to</span>
                {order.shipping_name ? `${order.shipping_name} · ` : ''}{address}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
