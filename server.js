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
const POKEMONTCGIO_API_KEY = process.env.POKEMONTCGIO_API_KEY;
const POKEMONTCGIO_BASE = 'https://api.pokemontcg.io/v2';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const PRICE_CONDITIONS = { nm: 'NEAR_MINT', lp: 'LIGHTLY_PLAYED', mp: 'MODERATELY_PLAYED', hp: 'HEAVILY_PLAYED', dmg: 'DAMAGED' };

// pokemontcg.io prices by print variant (normal/holofoil/etc.), not by wear
// condition, so it can only stand in for a Near Mint quote. Used as a free
// fallback when PokeTrace has no eBay/TCGPlayer comps for a card, keyed by
// pokemontcg.io's own card id (the same id we already store as card_id).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// pokemontcg.io's Cloudflare front intermittently 500s/502s under normal
// load (confirmed by hand, recovering seconds later) with no fault of the
// request itself. Without a retry, that one blip permanently strands a card
// on "No data" until something unrelated happens to re-trigger the fetch —
// e.g. a page refresh, which is why prices only seemed to show up on reload.
async function fetchPokemonTcgIoPrice(cardId, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  try {
    const headers = { 'User-Agent': 'pokewatch/1.0' };
    if (POKEMONTCGIO_API_KEY) headers['X-Api-Key'] = POKEMONTCGIO_API_KEY;
    const response = await fetch(`${POKEMONTCGIO_BASE}/cards/${encodeURIComponent(cardId)}`, { headers });
    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        return fetchPokemonTcgIoPrice(cardId, attempt + 1);
      }
      return null;
    }
    const { data: card } = await response.json();
    const variants = card && card.tcgplayer && card.tcgplayer.prices;
    if (!variants) return null;
    const preferred = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal'];
    for (const variant of preferred) {
      const v = variants[variant];
      if (v && v.market) return { avg: v.market, low: v.low ?? v.market, high: v.high ?? v.market };
    }
    return null;
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(400 * attempt);
      return fetchPokemonTcgIoPrice(cardId, attempt + 1);
    }
    console.warn('[pokemontcgio] lookup failed:', e.message);
    return null;
  }
}

// Looks up a card's price via PokeTrace (real per-condition eBay/TCGPlayer
// comps); if it has no Near Mint quote and a real card id is known, fills
// that gap from pokemontcg.io. Returns a card shaped like PokeTrace's own
// response so callers don't need to know which source actually answered.
async function lookupCardPrices(name, set, realCardId, edition) {
  let card = null;
  try {
    // pokemontcg.io has no concept of print edition (checked — the source
    // data has exactly one entry per card, 1st Edition or not), so this is
    // the only place "1st Edition" can factor in: as extra search text
    // against PokeTrace's real eBay comps.
    const searchName = edition && edition !== 'Unlimited' ? `${name} ${edition}` : name;
    const params = new URLSearchParams({ search: searchName, market: 'US' });
    if (set) params.set('set', set);
    const response = await fetch(`${POKETRACE_BASE}/cards?${params}`, {
      headers: { 'X-API-Key': POKETRACE_API_KEY }
    });
    const data = await response.json();
    card = (data.data || [])[0] || null;
  } catch (e) {
    console.warn('[prices] PokeTrace lookup failed:', e.message);
  }

  const hasNearMint = (card?.prices?.ebay?.NEAR_MINT?.avg) || (card?.prices?.tcgplayer?.NEAR_MINT?.avg);
  let fallbackSource = null;
  if (!hasNearMint && realCardId) {
    const fb = await fetchPokemonTcgIoPrice(realCardId);
    if (fb) {
      card = card || { id: realCardId, name };
      card.prices = { ...(card.prices || {}) };
      card.prices.tcgplayer = { ...(card.prices.tcgplayer || {}), NEAR_MINT: fb };
      fallbackSource = 'pokemontcgio';
    }
  }
  return { card, fallbackSource };
}

const db = new Database(path.join(__dirname, 'pokewatch.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    set_name TEXT,
    condition TEXT,
    max_price REAL,
    image TEXT,
    number TEXT,
    set_id TEXT,
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
try { db.exec("ALTER TABLE watchlist ADD COLUMN image TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE watchlist ADD COLUMN number TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE watchlist ADD COLUMN set_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE watchlist ADD COLUMN edition TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN user_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN card_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN image TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN number TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN set_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN edition TEXT"); } catch(e) {}
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

const PRICE_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60; // "once per day" per card

// Returns the most recent snapshot per grade for a card, but only the ones
// still within the cache window — so a card with only a week-old Near Mint
// snapshot counts as stale, not "partially fresh".
function getFreshSnapshot(snapshotId, maxAgeSeconds) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
  const rows = db
    .prepare(
      `SELECT grade, price, low, high, MAX(captured_at) AS captured_at
       FROM price_snapshots
       WHERE card_id = ? AND captured_at >= ?
       GROUP BY grade`
    )
    .all(snapshotId, cutoff);
  return rows.length ? rows : null;
}

function cardFromSnapshotRows(id, name, rows) {
  const prices = {};
  for (const row of rows) {
    const field = PRICE_CONDITIONS[row.grade];
    if (field) prices[field] = { avg: row.price, low: row.low, high: row.high };
  }
  return { id, name, prices: { tcgplayer: prices } };
}

app.get('/api/prices', async (req, res) => {
  const { name, set, cardId, edition } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // 1st Edition and Unlimited copies of the same card_id are different
    // collectibles with very different prices — keep their snapshots apart.
    const editionSuffix = edition && edition !== 'Unlimited' ? '-1st' : '';
    const snapshotId = (cardId || name).toLowerCase() + editionSuffix;

    const cached = getFreshSnapshot(snapshotId, PRICE_CACHE_MAX_AGE_SECONDS);
    if (cached) {
      return res.json({ data: [cardFromSnapshotRows(cardId || null, name, cached)] });
    }

    const { card, fallbackSource } = await lookupCardPrices(name, set, cardId, edition);
    if (card && card.prices) {
      const insert = db.prepare('INSERT INTO price_snapshots (card_id, grade, price, low, high, source) VALUES (?, ?, ?, ?, ?, ?)');
      const src = card.prices.ebay || card.prices.tcgplayer || {};
      for (const [key, field] of Object.entries(PRICE_CONDITIONS)) {
        const p = src[field];
        if (p && p.avg) {
          const label = field === 'NEAR_MINT' && fallbackSource ? fallbackSource : 'poketrace';
          insert.run(snapshotId, key, p.avg, p.low || null, p.high || null, label);
        }
      }
    }
    res.json({ data: card ? [card] : [] });
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
  const rows = db.prepare('SELECT grade, price, low, high, source, captured_at FROM price_snapshots WHERE card_id = ? ORDER BY captured_at ASC').all(req.params.cardId.toLowerCase());
  res.json(rows);
});

// --- Protected Routes (user-scoped) ---

app.get('/api/watchlist', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').all(req.userId));
});

app.post('/api/watchlist', authenticate, (req, res) => {
  const { id, name, set_name, condition, max_price, image, number, set_id, edition } = req.body;
  db.prepare('INSERT OR REPLACE INTO watchlist (id, name, set_name, condition, max_price, image, number, set_id, edition, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, max_price || null, image || null, number || null, set_id || null, edition || null, req.userId);
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
  const { id, name, set_name, condition, purchase_price, purchase_date, notes, card_id, image, number, set_id, edition } = req.body;
  db.prepare('INSERT OR REPLACE INTO portfolio (id, name, set_name, condition, purchase_price, purchase_date, notes, card_id, image, number, set_id, edition, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, purchase_price || null, purchase_date || null, notes || null, card_id || null, image || null, number || null, set_id || null, edition || null, req.userId);
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

async function scanPrices() {
  console.log('[cron] Running background price scan...');

  // De-duplicate watchlist + portfolio into one lookup per snapshot key,
  // matching how the frontend keys price_snapshots (cardId, falling back to
  // name, with a -1st suffix keeping 1st Edition copies out of the same
  // bucket as Unlimited copies of the same card).
  const targets = new Map();
  const keyFor = (id, edition) => id.toLowerCase() + (edition && edition !== 'Unlimited' ? '-1st' : '');

  for (const card of db.prepare('SELECT * FROM watchlist').all()) {
    targets.set(keyFor(card.id, card.edition), { name: card.name, set: card.set_name, realCardId: card.id, edition: card.edition, watchlistCard: card });
  }
  for (const item of db.prepare('SELECT * FROM portfolio').all()) {
    const key = keyFor(item.card_id || item.name, item.edition);
    if (!targets.has(key)) targets.set(key, { name: item.name, set: item.set_name, realCardId: item.card_id || null, edition: item.edition });
  }

  const insert = db.prepare('INSERT INTO price_snapshots (card_id, grade, price, low, high, source) VALUES (?, ?, ?, ?, ?, ?)');

  for (const [snapshotId, target] of targets) {
    try {
      const { card, fallbackSource } = await lookupCardPrices(target.name, target.set, target.realCardId, target.edition);
      if (!card || !card.prices) continue;
      const src = card.prices.ebay || card.prices.tcgplayer || {};
      for (const [key, field] of Object.entries(PRICE_CONDITIONS)) {
        const p = src[field];
        if (p && p.avg) {
          const label = field === 'NEAR_MINT' && fallbackSource ? fallbackSource : 'poketrace';
          insert.run(snapshotId, key, p.avg, p.low || null, p.high || null, label);
        }
      }
      const watchlistCard = target.watchlistCard;
      if (watchlistCard && watchlistCard.max_price) {
        const rawPrice = src['NEAR_MINT'] && src['NEAR_MINT'].avg;
        if (rawPrice && rawPrice <= watchlistCard.max_price) {
          db.prepare('INSERT INTO alerts (card_id, card_name, price, threshold, user_id) VALUES (?, ?, ?, ?, ?)').run(watchlistCard.id, watchlistCard.name, rawPrice, watchlistCard.max_price, watchlistCard.user_id);
          console.log(`[alert] ${watchlistCard.name} hit threshold: $${rawPrice} <= $${watchlistCard.max_price}`);
        }
      }
    } catch (e) {
      console.error(`[cron] Error scanning ${target.name}:`, e.message);
    }
  }
  console.log('[cron] Scan complete.');
}

cron.schedule('0 */6 * * *', scanPrices);

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  const indexPath = path.join(fs.existsSync(distPath) ? distPath : publicPath, 'index.html');
  res.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`PokéWatch server running on port ${PORT}`);
});
