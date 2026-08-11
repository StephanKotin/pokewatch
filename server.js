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

// PokeTrace enforces a burst rate limit well below the daily quota (confirmed
// by hand: firing ~40 requests at once gets most of them 429'd with "Too many
// requests. Slow down."). A page with a large portfolio/watchlist fans out
// one request per card, so every outbound call is funneled through this
// queue instead of firing all at once. Concurrency alone isn't enough — a
// handful of in-flight requests can still add up to a high *rate* if each
// one resolves quickly — so dispatch is also spaced out with a minimum
// interval, on top of a couple of backoff retries for any 429s that still
// slip through under contention.
const POKETRACE_MAX_CONCURRENT = 3;
const POKETRACE_MIN_DISPATCH_INTERVAL_MS = 150;
let pokeTraceActive = 0;
let pokeTraceLastDispatch = 0;
const pokeTraceQueue = [];

function pokeTraceDrain() {
  if (!pokeTraceQueue.length || pokeTraceActive >= POKETRACE_MAX_CONCURRENT) return;
  const wait = pokeTraceLastDispatch + POKETRACE_MIN_DISPATCH_INTERVAL_MS - Date.now();
  if (wait > 0) {
    setTimeout(pokeTraceDrain, wait);
    return;
  }
  pokeTraceLastDispatch = Date.now();
  pokeTraceQueue.shift()();
  pokeTraceDrain();
}

function pokeTraceFetch(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      pokeTraceActive++;
      try {
        const response = await fetch(url, { headers: { 'X-API-Key': POKETRACE_API_KEY } });
        if (response.status === 429 && attempt < 4) {
          await sleep(600 * attempt);
          resolve(pokeTraceFetch(url, attempt + 1));
          return;
        }
        resolve(response);
      } catch (e) {
        reject(e);
      } finally {
        pokeTraceActive--;
        pokeTraceDrain();
      }
    };
    pokeTraceQueue.push(run);
    pokeTraceDrain();
  });
}

const POKEMONTCGIO_API_KEY = process.env.POKEMONTCGIO_API_KEY;
const POKEMONTCGIO_BASE = 'https://api.pokemontcg.io/v2';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PokeWatch <onboarding@resend.dev>';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Sends via Resend's REST API — no SDK needed, just a POST. Missing config
// (no key set yet, or the request fails) logs a warning instead of throwing,
// so a registration never gets stuck just because email isn't wired up.
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email:', subject);
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!response.ok) {
      console.error('[email] send failed:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] send error:', e.message);
    return false;
  }
}

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
// PokeTrace's `set` filter takes its own internal slug ("ex-firered-and-
// leafgreen"), not the display name we store ("FireRed & LeafGreen") — and
// that slug doesn't follow a guessable pattern (confirmed by hand against
// their real catalog). Searching by name alone and matching against the
// `set.name` each result already carries is far more reliable than trying
// to construct their slug ourselves.
function normalizeSetName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findBestSetMatch(results, wantedSet) {
  const wanted = normalizeSetName(wantedSet);
  if (!wanted) return results[0] || null;
  const exact = results.find((c) => normalizeSetName(c.set?.name) === wanted);
  if (exact) return exact;
  const partial = results.find((c) => {
    const rs = normalizeSetName(c.set?.name);
    return rs && (rs.includes(wanted) || wanted.includes(rs));
  });
  return partial || results[0] || null;
}

// PokeTrace formats cardNumber as "198/193" (numerator/set-total, zero
// padded); we store the bare numerator ("198"). Comparing those directly
// never matches, silently defeating the number-match safeguard below on
// every single card — confirmed live: "Bramblin" in Paldea Evolved exists
// as both 022/193 (Common) and 198/193 (Illustration Rare), and the broken
// comparison was letting a rare card's price fall back to the common one.
function normalizePokeTraceNumber(n) {
  return (n || '').split('/')[0].trim().replace(/^0+(?=\d)/, '');
}

// Set-name matching alone isn't enough to pick the right card: promo sets in
// particular reuse the same card name across many different numbered prints
// (e.g. "Vaporeon V" appears as both SWSH150 and SWSH181 in the same "Sword &
// Shield Promo Cards" set, at wildly different prices — $8 vs $86, confirmed
// by hand). Every watchlist/portfolio row already stores the exact print
// number from the card catalog, so an exact number match is checked first
// and only falls back to fuzzy set-name matching when we don't have one.
function findBestCardMatch(results, wantedSet, wantedNumber) {
  if (wantedNumber) {
    const wantedNorm = normalizePokeTraceNumber(wantedNumber);
    const exact = results.find((c) => normalizePokeTraceNumber(c.cardNumber) === wantedNorm);
    if (exact) return exact;
  }
  return findBestSetMatch(results, wantedSet);
}

// pokemontcg.io has no concept of print edition (checked — the source data
// has exactly one entry per card, 1st Edition or not), so this is the only
// place "1st Edition" can factor in: as extra search text against
// PokeTrace's real eBay comps.
async function resolvePokeTraceCard(name, set, edition, number) {
  try {
    const searchName = edition && edition !== 'Unlimited' ? `${name} ${edition}` : name;
    const params = new URLSearchParams({ search: searchName, market: 'US', limit: '20' });
    const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards?${params}`);
    const data = await response.json();
    const results = data.data || [];
    if (!set && !number) return results[0] || null;
    return findBestCardMatch(results, set, number);
  } catch (e) {
    console.warn('[poketrace] card resolution failed:', e.message);
    return null;
  }
}

async function lookupCardPrices(name, set, realCardId, edition, number) {
  let card = await resolvePokeTraceCard(name, set, edition, number);

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

// DB_PATH lets a host with a persistent volume (e.g. Railway) point SQLite
// at mounted storage instead of the app's own ephemeral directory, so data
// survives redeploys. Defaults to the old behavior for local dev.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pokewatch.db');
const db = new Database(DB_PATH);
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
    status TEXT NOT NULL DEFAULT 'approved',
    approval_token TEXT,
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
// Existing accounts (created before approval-gating existed) default to
// 'approved' so nobody already using the app gets locked out retroactively.
try { db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN approval_token TEXT"); } catch(e) {}

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

  const normalizedEmail = email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const approvalToken = crypto.randomBytes(24).toString('hex');

  db.prepare('INSERT INTO users (id, email, password_hash, status, approval_token) VALUES (?, ?, ?, ?, ?)')
    .run(id, normalizedEmail, passwordHash, 'pending', approvalToken);
  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(id);

  if (ADMIN_EMAIL) {
    const approveUrl = `${APP_BASE_URL}/api/admin/approve/${approvalToken}`;
    const rejectUrl = `${APP_BASE_URL}/api/admin/reject/${approvalToken}`;
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `PokeWatch: approve ${normalizedEmail}?`,
      html: `
        <p><strong>${normalizedEmail}</strong> just requested a PokeWatch account.</p>
        <p>
          <a href="${approveUrl}" style="background:#57cc99;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;margin-right:8px;">Approve</a>
          <a href="${rejectUrl}" style="background:#e63946;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Reject</a>
        </p>
      `,
    }).catch(() => {});
  } else {
    console.warn('[auth] ADMIN_EMAIL not set — nobody was notified of new registration:', normalizedEmail);
  }

  res.json({
    pending: true,
    message: "Your account request has been sent for approval. You'll be able to sign in once it's approved.",
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'pending') return res.status(403).json({ error: 'Your account is still awaiting approval' });
  if (user.status === 'rejected') return res.status(403).json({ error: 'This account request was declined' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, email, status FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.status !== 'approved') return res.status(403).json({ error: 'Account not approved' });
  res.json({ user });
});

// --- Admin approval links (opened directly from the notification email) ---

function approvalPage(message, color) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d0d0f;color:#e8e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;">
      <h2 style="color:${color};">${message}</h2>
      <p><a href="${APP_BASE_URL}" style="color:#4cc9f0;">Return to PokeWatch</a></p>
    </div>
  </body></html>`;
}

app.get('/api/admin/approve/:token', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE approval_token = ? AND status = 'pending'").get(req.params.token);
  if (!user) return res.status(404).send(approvalPage('Request not found or already handled.', '#94a3b8'));
  db.prepare("UPDATE users SET status = 'approved', approval_token = NULL WHERE id = ?").run(user.id);
  sendEmail({
    to: user.email,
    subject: 'Your PokeWatch account is approved!',
    html: `<p>You're approved — <a href="${APP_BASE_URL}">sign in here</a>.</p>`,
  }).catch(() => {});
  res.send(approvalPage(`Approved ${user.email}.`, '#57cc99'));
});

app.get('/api/admin/reject/:token', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE approval_token = ? AND status = 'pending'").get(req.params.token);
  if (!user) return res.status(404).send(approvalPage('Request not found or already handled.', '#94a3b8'));
  db.prepare("UPDATE users SET status = 'rejected', approval_token = NULL WHERE id = ?").run(user.id);
  res.send(approvalPage(`Declined ${user.email}.`, '#e63946'));
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
  const { name, set, cardId, edition, number } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // 1st Edition and Unlimited copies of the same card_id are different
    // collectibles with very different prices — keep their snapshots apart.
    const editionSuffix = edition && edition !== 'Unlimited' ? '-1st' : '';
    const snapshotId = (cardId || name).toLowerCase() + editionSuffix;

    const { card, fallbackSource } = await lookupCardPrices(name, set, cardId, edition, number);
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

// PokeTrace's own price-history endpoint has real, server-side history per
// grading tier (up to a year) — far deeper than our local price_snapshots,
// which only cover cards from whenever polling started. Cached in-memory for
// a few hours (matching the cron's cadence) so repeat page loads don't
// re-spend quota re-fetching a card's history that hasn't changed yet.
const PRICE_HISTORY_PERIOD = '90d';
const PRICE_HISTORY_CACHE_MAX_AGE_SECONDS = 6 * 60 * 60;
const priceHistoryCache = new Map(); // `${cardId}|${tier}` -> { data, cachedAt }

app.get('/api/price-history', async (req, res) => {
  const { name, set, edition, grade, number } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  const gradeKey = PRICE_CONDITIONS[grade] ? grade : 'nm';
  const tier = PRICE_CONDITIONS[gradeKey];
  try {
    const card = await resolvePokeTraceCard(name, set, edition, number);
    if (!card) return res.json([]);

    const cacheKey = `${card.id}|${tier}`;
    const cached = priceHistoryCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) / 1000 < PRICE_HISTORY_CACHE_MAX_AGE_SECONDS) {
      return res.json(cached.data);
    }

    const params = new URLSearchParams({ period: PRICE_HISTORY_PERIOD, limit: '100' });
    const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards/${card.id}/prices/${tier}/history?${params}`);
    if (!response.ok) return res.json([]);
    const { data: rows } = await response.json();
    const mapped = (rows || [])
      .map((r) => ({
        grade: gradeKey,
        price: r.avg,
        low: r.low,
        high: r.high,
        captured_at: Math.floor(new Date(r.date).getTime() / 1000),
      }))
      .sort((a, b) => a.captured_at - b.captured_at);

    priceHistoryCache.set(cacheKey, { data: mapped, cachedAt: Date.now() });
    res.json(mapped);
  } catch (e) {
    console.warn('[price-history] lookup failed:', e.message);
    res.json([]);
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
    targets.set(keyFor(card.id, card.edition), { name: card.name, set: card.set_name, realCardId: card.id, edition: card.edition, number: card.number, watchlistCard: card });
  }
  for (const item of db.prepare('SELECT * FROM portfolio').all()) {
    const key = keyFor(item.card_id || item.name, item.edition);
    if (!targets.has(key)) targets.set(key, { name: item.name, set: item.set_name, realCardId: item.card_id || null, edition: item.edition, number: item.number });
  }

  const insert = db.prepare('INSERT INTO price_snapshots (card_id, grade, price, low, high, source) VALUES (?, ?, ?, ?, ?, ?)');

  for (const [snapshotId, target] of targets) {
    try {
      const { card, fallbackSource } = await lookupCardPrices(target.name, target.set, target.realCardId, target.edition, target.number);
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
