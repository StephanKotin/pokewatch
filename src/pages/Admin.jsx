import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchAdminOrders,
  updateOrderStatus,
} from '../api/store';
import { fmtPrice } from '../utils/format';
import './Admin.css';

const EMPTY_FORM = { type: 'single', name: '', description: '', image_url: '', price: '', stock: '', sku: '' };

export default function Admin({ toast }) {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const loadProducts = useCallback(() => {
    fetchAdminProducts().then(setProducts).catch((e) => toast && toast(e.message, 'error'));
  }, [toast]);

  const loadOrders = useCallback(() => {
    fetchAdminOrders().then(setOrders).catch((e) => toast && toast(e.message, 'error'));
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAdminProducts(), fetchAdminOrders()])
      .then(([p, o]) => {
        setProducts(p);
        setOrders(o);
      })
      .catch((e) => toast && toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      type: p.type,
      name: p.name,
      description: p.description || '',
      image_url: p.image_url || '',
      price: (p.price_cents / 100).toString(),
      stock: p.stock.toString(),
      sku: p.sku || '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      type: form.type,
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      price_cents: Math.round(parseFloat(form.price) * 100),
      stock: parseInt(form.stock, 10) || 0,
      sku: form.sku.trim() || null,
      active: 1,
    };
    if (!payload.name || !payload.price_cents) {
      toast && toast('Name and price are required', 'error');
      return;
    }
    try {
      if (editingId) {
        await updateProduct(editingId, payload);
        toast && toast('Product updated');
      } else {
        await createProduct(payload);
        toast && toast('Product added');
      }
      resetForm();
      loadProducts();
    } catch (err) {
      toast && toast(err.message || 'Save failed', 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this product from the store?')) return;
    try {
      await deleteProduct(id);
      loadProducts();
    } catch (err) {
      toast && toast(err.message || 'Delete failed', 'error');
    }
  }

  async function handleOrderStatus(id, status) {
    try {
      await updateOrderStatus(id, status);
      loadOrders();
    } catch (err) {
      toast && toast(err.message || 'Update failed', 'error');
    }
  }

  if (loading) return <div className="modal-loading">Loading admin…</div>;

  return (
    <div className="admin-page">
      <h2 className="admin-title">Store Admin</h2>
      <div className="store-filter-tabs">
        <button
          className={`store-filter-btn ${tab === 'products' ? 'active' : ''}`}
          onClick={() => setTab('products')}
        >
          Products
        </button>
        <button
          className={`store-filter-btn ${tab === 'orders' ? 'active' : ''}`}
          onClick={() => setTab('orders')}
        >
          Orders ({orders.length})
        </button>
      </div>

      {tab === 'products' && (
        <>
          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="form-row admin-form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="single">Single</option>
                  <option value="sealed">Sealed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Charizard VMAX"
                />
              </div>
              <div className="form-group">
                <label>Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="49.99"
                />
              </div>
              <div className="form-group">
                <label>Stock</label>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="10"
                />
              </div>
              <div className="form-group">
                <label>SKU</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="optional"
                />
              </div>
            </div>
            <div className="form-row admin-form-row">
              <div className="form-group admin-form-wide">
                <label>Image URL</label>
                <input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group admin-form-wide">
                <label>Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="optional"
                />
              </div>
              <button className="btn btn-primary" type="submit">
                {editingId ? 'Save Changes' : 'Add Product'}
              </button>
              {editingId && (
                <button className="btn btn-secondary" type="button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="admin-list">
            {products.map((p) => (
              <div key={p.id} className="card-row admin-row">
                <div className="card-info">
                  <div className="card-name">
                    {p.name} {!p.active && <span className="tag">inactive</span>}
                  </div>
                  <div className="card-meta">
                    <span className="tag">{p.type}</span>
                    <span className="tag">${fmtPrice(p.price_cents)}</span>
                    <span className="tag">{p.stock} in stock</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button className="btn-sm" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button className="btn-danger" onClick={() => handleDelete(p.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="admin-list">
          {orders.length === 0 ? (
            <div className="empty-state">
              <p>No orders yet.</p>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="card-row admin-row">
                <div className="card-info">
                  <div className="card-name">
                    {o.email || 'Guest'} — ${fmtPrice(o.total_cents)}
                  </div>
                  <div className="card-meta">
                    <span className={`tag ${o.status === 'paid' || o.status === 'fulfilled' ? 'grade' : ''}`}>
                      {o.status}
                    </span>
                    <span className="tag">
                      {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="admin-order-items">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        {i.quantity} &times; {i.name_snapshot}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-actions">
                  <select value={o.status} onChange={(e) => handleOrderStatus(o.id, e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
