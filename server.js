require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const POKETRACE_API_KEY = process.env.POKETRACE_API_KEY;
const POKETRACE_BASE = 'https://api.poketrace.com/v1';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    alert_webhook_url TEXT DEFAULT '',
    alert_email TEXT DEFAULT '',
    last_scan TEXT,
    scan_interval INTEGER DEFAULT 0,
    sound_alerts INTEGER DEFAULT 0,
    browser_notifications INTEGER DEFAULT 0,
    include_auctions INTEGER DEFAULT 1,
    us_only INTEGER DEFAULT 0,
    free_shipping INTEGER DEFAULT 0
  );
`);

// Add user_id columns to existing tables (idempotent)
try { db.exec("ALTER TABLE watchlist ADD COLUMN user_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN user_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE alerts ADD COLUMN user_id TEXT"); } catch(e) {}

// Auth middleware
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.use(cors());
app.use(express.json());
// Serve Vite build output in production, fall back to public/ for legacy
const fs = require('fs');
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
app.use(express.static(fs.existsSync(distPath) ? distPath : publicPath));

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, email.toLowerCase(), passwordHash);
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(id);

  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, email: email.toLowerCase() } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user });
});

// --- Settings Routes ---

app.get('/api/settings', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId);
  if (!row) return res.json({});
  res.json({
    alertWebhookUrl: row.alert_webhook_url || '',
    alertEmail: row.alert_email || '',
    lastScan: row.last_scan || null,
    scanInterval: row.scan_interval || 0,
    soundAlerts: !!row.sound_alerts,
    browserNotifications: !!row.browser_notifications,
    includeAuctions: row.include_auctions !== 0,
    usOnly: !!row.us_only,
    freeShipping: !!row.free_shipping,
  });
});

app.put('/api/settings', authenticate, (req, res) => {
  const fields = {
    alertWebhookUrl: 'alert_webhook_url',
    alertEmail: 'alert_email',
    lastScan: 'last_scan',
    scanInterval: 'scan_interval',
    soundAlerts: 'sound_alerts',
    browserNotifications: 'browser_notifications',
    includeAuctions: 'include_auctions',
    usOnly: 'us_only',
    freeShipping: 'free_shipping',
  };

  const updates = [];
  const values = [];
  for (const [camel, snake] of Object.entries(fields)) {
    if (req.body[camel] !== undefined) {
      updates.push(`${snake} = ?`);
      const val = req.body[camel];
      values.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
    }
  }

  if (updates.length > 0) {
    values.push(req.userId);
    db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
  }

  res.json({ ok: true });
});

// --- Public Routes (shared data, no auth needed) ---

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

// --- Protected Routes (user-scoped) ---

app.get('/api/watchlist', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').all(req.userId));
});

app.post('/api/watchlist', authenticate, (req, res) => {
  const { id, name, set_name, condition, max_price } = req.body;
  db.prepare('INSERT OR REPLACE INTO watchlist (id, name, set_name, condition, max_price, user_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, max_price || null, req.userId);
  res.json({ ok: true });
});

app.delete('/api/watchlist/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

app.get('/api/portfolio', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM portfolio WHERE user_id = ? ORDER BY created_at DESC').all(req.userId));
});

app.post('/api/portfolio', authenticate, (req, res) => {
  const { id, name, set_name, condition, purchase_price, purchase_date, notes } = req.body;
  db.prepare('INSERT OR REPLACE INTO portfolio (id, name, set_name, condition, purchase_price, purchase_date, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, purchase_price || null, purchase_date || null, notes || null, req.userId);
  res.json({ ok: true });
});

app.delete('/api/portfolio/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM portfolio WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

app.get('/api/alerts', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY fired_at DESC LIMIT 100').all(req.userId));
});

app.post('/api/alerts', authenticate, (req, res) => {
  const { card_id, card_name, listing_title, price, threshold, url } = req.body;
  db.prepare('INSERT INTO alerts (card_id, card_name, listing_title, price, threshold, url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(card_id, card_name, listing_title || null, price, threshold, url || null, req.userId);
  res.json({ ok: true });
});

// --- Cron Job ---

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
          db.prepare('INSERT INTO alerts (card_id, card_name, price, threshold, user_id) VALUES (?, ?, ?, ?, ?)').run(card.id, card.name, rawPrice, card.max_price, card.user_id);
          console.log(`[alert] ${card.name} hit threshold: $${rawPrice} <= $${card.max_price}`);
        }
      }
    } catch (e) {
      console.error(`[cron] Error scanning ${card.name}:`, e.message);
    }
  }
  console.log('[cron] Scan complete.');
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  const indexPath = path.join(fs.existsSync(distPath) ? distPath : publicPath, 'index.html');
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`PokéWatch server running on port ${PORT}`);
});
