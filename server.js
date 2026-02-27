require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const POKETRACE_API_KEY = process.env.POKETRACE_API_KEY;
const POKETRACE_BASE = 'https://api.poketrace.com/v1';

const db = new Database(path.join(__dirname, 'pokewatch.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    set_name TEXT,
    condition TEXT,
    max_price REAL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    price REAL NOT NULL,
    low REAL,
    high REAL,
    source TEXT DEFAULT 'poketrace',
    captured_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS portfolio (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    set_name TEXT,
    condition TEXT,
    purchase_price REAL,
    purchase_date TEXT,
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    listing_title TEXT,
    price REAL,
    threshold REAL,
    fired_at INTEGER DEFAULT (strftime('%s','now')),
    url TEXT
  );
`);

app.use(cors());
app.use(express.json());
// Serve Vite build output in production, fall back to public/ for legacy
const fs = require('fs');
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
app.use(express.static(fs.existsSync(distPath) ? distPath : publicPath));

app.get('/api/prices', async (req, res) => {
  const { name, set } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const params = new URLSearchParams({ search: name, market: 'US' });
    if (set) params.set('set', set);
    const response = await fetch(`${POKETRACE_BASE}/cards?${params}`, {
      headers: { 'X-API-Key': POKETRACE_API_KEY }
    });
    const data = await response.json();
    const card = (data.data || [])[0];
    if (card && card.prices) {
      const conditions = { nm: 'NEAR_MINT', lp: 'LIGHTLY_PLAYED', mp: 'MODERATELY_PLAYED', hp: 'HEAVILY_PLAYED', dmg: 'DAMAGED' };
      const insert = db.prepare('INSERT INTO price_snapshots (card_id, grade, price, low, high) VALUES (?, ?, ?, ?, ?)');
      const src = card.prices.ebay || card.prices.tcgplayer || {};
      for (const [key, field] of Object.entries(conditions)) {
        const p = src[field];
        if (p && p.avg) insert.run(name.toLowerCase(), key, p.avg, p.low || null, p.high || null);
      }
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/listings', async (req, res) => {
  const { name, set, condition, maxPrice } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const query = [name, set, condition].filter(Boolean).join(' ');
    const params = new URLSearchParams({ search: query, market: 'US', limit: '20' });
    if (maxPrice) params.set('maxPrice', maxPrice);
    const response = await fetch(`${POKETRACE_BASE}/listings?${params}`, {
      headers: { 'X-API-Key': POKETRACE_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history/:cardId', (req, res) => {
  const rows = db.prepare('SELECT grade, price, low, high, captured_at FROM price_snapshots WHERE card_id = ? ORDER BY captured_at ASC').all(req.params.cardId.toLowerCase());
  res.json(rows);
});

app.get('/api/watchlist', (req, res) => {
  res.json(db.prepare('SELECT * FROM watchlist ORDER BY created_at DESC').all());
});

app.post('/api/watchlist', (req, res) => {
  const { id, name, set_name, condition, max_price } = req.body;
  db.prepare('INSERT OR REPLACE INTO watchlist (id, name, set_name, condition, max_price) VALUES (?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, max_price || null);
  res.json({ ok: true });
});

app.delete('/api/watchlist/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/portfolio', (req, res) => {
  res.json(db.prepare('SELECT * FROM portfolio ORDER BY created_at DESC').all());
});

app.post('/api/portfolio', (req, res) => {
  const { id, name, set_name, condition, purchase_price, purchase_date, notes } = req.body;
  db.prepare('INSERT OR REPLACE INTO portfolio (id, name, set_name, condition, purchase_price, purchase_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, purchase_price || null, purchase_date || null, notes || null);
  res.json({ ok: true });
});

app.delete('/api/portfolio/:id', (req, res) => {
  db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/alerts', (req, res) => {
  res.json(db.prepare('SELECT * FROM alerts ORDER BY fired_at DESC LIMIT 100').all());
});

app.post('/api/alerts', (req, res) => {
  const { card_id, card_name, listing_title, price, threshold, url } = req.body;
  db.prepare('INSERT INTO alerts (card_id, card_name, listing_title, price, threshold, url) VALUES (?, ?, ?, ?, ?, ?)').run(card_id, card_name, listing_title || null, price, threshold, url || null);
  res.json({ ok: true });
});

cron.schedule('0 */6 * * *', async () => {
  console.log('[cron] Running background price scan...');
  const cards = db.prepare('SELECT * FROM watchlist').all();
  for (const card of cards) {
    try {
      const params = new URLSearchParams({ search: card.name, market: 'US' });
      if (card.set_name) params.set('set', card.set_name);
      const response = await fetch(`${POKETRACE_BASE}/cards?${params}`, {
        headers: { 'X-API-Key': POKETRACE_API_KEY }
      });
      const data = await response.json();
      const pt = (data.data || [])[0];
      if (!pt || !pt.prices || !pt.prices.ebay) continue;
      const conditions = { nm: 'NEAR_MINT', lp: 'LIGHTLY_PLAYED', mp: 'MODERATELY_PLAYED', hp: 'HEAVILY_PLAYED', dmg: 'DAMAGED' };
      const insert = db.prepare('INSERT INTO price_snapshots (card_id, grade, price, low, high) VALUES (?, ?, ?, ?, ?)');
      const src = pt.prices.ebay || pt.prices.tcgplayer || {};
      for (const [key, field] of Object.entries(conditions)) {
        const p = src[field];
        if (p && p.avg) insert.run(card.id, key, p.avg, p.low || null, p.high || null);
      }
      if (card.max_price) {
        const rawPrice = src['NEAR_MINT'] && src['NEAR_MINT'].avg;
        if (rawPrice && rawPrice <= card.max_price) {
          db.prepare('INSERT INTO alerts (card_id, card_name, price, threshold) VALUES (?, ?, ?, ?)').run(card.id, card.name, rawPrice, card.max_price);
          console.log(`[alert] ${card.name} hit threshold: $${rawPrice} <= $${card.max_price}`);
        }
      }
    } catch (e) {
      console.error(`[cron] Error scanning ${card.name}:`, e.message);
    }
  }
  console.log('[cron] Scan complete.');
});

app.listen(PORT, () => {
  console.log(`PokéWatch server running on port ${PORT}`);
});
