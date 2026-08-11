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

// PokeTrace's own Set object has no releaseDate/series/logo (confirmed live:
// releaseDate is null on every entry, for every game value — there is
// nothing to fall back to). pokemontcg.io's public set list has exactly
// those fields, so it's used here purely as read-only display metadata,
// matched onto PokeTrace's sets by (normalized) name — PokeTrace remains
// the source of truth for which sets/cards exist. Cached much longer on
// success than on failure so one flaky moment (see the note above
// fetchPokemonTcgIoPrice) doesn't strand the catalogue without era/date
// data for a full day.
const POKEMONTCGIO_SETS_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;
const POKEMONTCGIO_SETS_RETRY_CACHE_MAX_AGE_SECONDS = 5 * 60;
let pokemonTcgIoSetsCache = null; // { byName: Map<normalizedName, meta>, cachedAt, ok }

async function fetchPokemonTcgIoSets(attempt = 1) {
  const MAX_ATTEMPTS = 3;
  try {
    const headers = { 'User-Agent': 'pokewatch/1.0' };
    if (POKEMONTCGIO_API_KEY) headers['X-Api-Key'] = POKEMONTCGIO_API_KEY;
    const response = await fetch(`${POKEMONTCGIO_BASE}/sets?pageSize=250`, { headers });
    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        return fetchPokemonTcgIoSets(attempt + 1);
      }
      return null;
    }
    const { data } = await response.json();
    return data || [];
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(400 * attempt);
      return fetchPokemonTcgIoSets(attempt + 1);
    }
    console.warn('[pokemontcgio] set list fetch failed:', e.message);
    return null;
  }
}

async function getPokemonTcgIoSetsByName() {
  const maxAge = pokemonTcgIoSetsCache?.ok
    ? POKEMONTCGIO_SETS_CACHE_MAX_AGE_SECONDS
    : POKEMONTCGIO_SETS_RETRY_CACHE_MAX_AGE_SECONDS;
  if (pokemonTcgIoSetsCache && (Date.now() - pokemonTcgIoSetsCache.cachedAt) / 1000 < maxAge) {
    return pokemonTcgIoSetsCache.byName;
  }
  const sets = await fetchPokemonTcgIoSets();
  const byName = new Map();
  for (const s of sets || []) {
    byName.set(normalizeSetName(s.name), {
      releaseDate: s.releaseDate ? s.releaseDate.replace(/\//g, '-') : null,
      series: s.series || null,
      logo: s.images?.logo || null,
    });
  }
  pokemonTcgIoSetsCache = { byName, cachedAt: Date.now(), ok: !!sets };
  return byName;
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

// resolvePokeTraceCard does a live PokeTrace search every time it's called —
// fine for /api/prices, which only reaches it on a genuine snapshot-cache
// miss (needs fresh live numbers), but /api/price-history was calling it
// unconditionally on *every* request just to find the card's id, before
// even checking its own history cache below. Confirmed live: with a ~200-
// item portfolio, that's ~200 unnecessary PokeTrace searches serialized
// through the rate-limit queue on every single page load/refresh — 40
// sample items took ~8s wall time for this reason alone. A card's identity
// doesn't change, so just the id lookup (not the live price data) is safe
// to cache far longer than the history data itself.
const CARD_ID_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;
const cardIdCache = new Map(); // `${name}|${set}|${edition}|${number}` -> { cardId, cachedAt }

async function resolveCardId(name, set, edition, number) {
  const key = [name, set || '', edition || '', number || ''].join('|').toLowerCase();
  const cached = cardIdCache.get(key);
  if (cached && (Date.now() - cached.cachedAt) / 1000 < CARD_ID_CACHE_MAX_AGE_SECONDS) {
    return cached.cardId;
  }
  const card = await resolvePokeTraceCard(name, set, edition, number);
  const cardId = card?.id || null;
  cardIdCache.set(key, { cardId, cachedAt: Date.now() });
  return cardId;
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
try { db.exec("ALTER TABLE portfolio ADD COLUMN is_graded INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN grade_tier TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE portfolio ADD COLUMN grade_label TEXT"); } catch(e) {}
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

// Restored: this existed earlier, checking price_snapshots for a per-grade
// row within the cache window before ever calling PokeTrace, so a page load
// that already has fresh data doesn't re-spend API quota. It got dropped
// somewhere during the number/edition-matching rework and every /api/prices
// call was silently hitting PokeTrace live again regardless of age — this
// is what "store the price once every 24h" is supposed to actually do.
const PRICE_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;

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

// Raw conditions are stored under their short key (nm/lp/...) and translated
// back to PokeTrace's full tier name via PRICE_CONDITIONS. Graded tiers have
// no short key — they're stored under their real PokeTrace tier string
// (e.g. "PSA_10") directly, so passing that value straight through here is
// correct as-is rather than a fallback.
function cardFromSnapshotRows(id, name, rows) {
  const prices = {};
  for (const row of rows) {
    const field = PRICE_CONDITIONS[row.grade] || row.grade;
    prices[field] = { avg: row.price, low: row.low, high: row.high };
  }
  return { id, name, prices: { tcgplayer: prices } };
}

app.get('/api/prices', async (req, res) => {
  const { name, set, cardId, edition, number, gradeTier } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // 1st Edition and Unlimited copies of the same card_id are different
    // collectibles with very different prices — keep their snapshots apart.
    const editionSuffix = edition && edition !== 'Unlimited' ? '-1st' : '';
    const snapshotId = (cardId || name).toLowerCase() + editionSuffix;

    const cached = getFreshSnapshot(snapshotId, PRICE_CACHE_MAX_AGE_SECONDS);
    // A cache hit only covers what it actually contains — if this request
    // wants a graded tier that hasn't been snapshotted yet (e.g. the first
    // time this card is looked up as graded), the raw-only cache from an
    // earlier request isn't enough and still needs a live fetch to fill it.
    const cachedHasGradeTier = !gradeTier || (cached && cached.some((r) => r.grade === gradeTier));
    if (cached && cachedHasGradeTier) {
      return res.json({ data: [cardFromSnapshotRows(cardId || null, name, cached)] });
    }

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
      if (gradeTier) {
        const gp = src[gradeTier];
        if (gp && gp.avg) insert.run(snapshotId, gradeTier, gp.avg, gp.low || null, gp.high || null, 'poketrace');
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
  const { name, set, edition, grade, number, gradeTier } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  // Graded tiers (e.g. "PSA_10") are already PokeTrace's real tier string —
  // used as-is. Raw requests go through the short-key -> tier-name map,
  // defaulting to nm/NEAR_MINT for anything unrecognized.
  const gradeKey = gradeTier || (PRICE_CONDITIONS[grade] ? grade : 'nm');
  const tier = gradeTier || PRICE_CONDITIONS[gradeKey];
  try {
    const cardId = await resolveCardId(name, set, edition, number);
    if (!cardId) return res.json([]);

    const cacheKey = `${cardId}|${tier}`;
    const cached = priceHistoryCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) / 1000 < PRICE_HISTORY_CACHE_MAX_AGE_SECONDS) {
      return res.json(cached.data);
    }

    const params = new URLSearchParams({ period: PRICE_HISTORY_PERIOD, limit: '100' });
    const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards/${cardId}/prices/${tier}/history?${params}`);
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

// --- Catalogue (PokeTrace is the catalogue source of truth — no local
// database of sets/cards; these routes crawl PokeTrace's own paginated
// endpoints and cache the result, same pattern as priceHistoryCache below) ---

const CATALOGUE_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;
const setsCache = new Map(); // game -> { data, cachedAt, maxAge }
const setCardsCache = new Map(); // slug -> { data, cachedAt, maxAge }

function catalogueCacheFresh(entry) {
  return entry && (Date.now() - entry.cachedAt) / 1000 < entry.maxAge;
}

// PokeTrace splits some sets across market-specific entries (US/TCGplayer
// vs EU/Cardmarket) for what's physically the same print, so a hard
// `market=US` filter silently empties out any set/search that happens to
// only have EU-sourced rows (confirmed live: "destined-rivals" returns 0
// cards under market=US despite reporting 410 in /sets). Fetch across all
// markets instead and dedupe same-card entries, preferring US.
function dedupeCards(cards) {
  const byKey = new Map();
  for (const c of cards) {
    const key = `${(c.cardNumber || '').trim()}|${(c.name || '').trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || (existing.market !== 'US' && c.market === 'US')) byKey.set(key, c);
  }
  return [...byKey.values()];
}

app.get('/api/sets', async (req, res) => {
  const game = req.query.game === 'pokemon-japanese' ? 'pokemon-japanese' : 'pokemon';
  const cached = setsCache.get(game);
  if (catalogueCacheFresh(cached)) return res.json(cached.data);
  try {
    let all = [];
    let cursor = null;
    do {
      const params = new URLSearchParams({ game, limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const response = await pokeTraceFetch(`${POKETRACE_BASE}/sets?${params}`);
      if (!response.ok) break;
      const { data, pagination } = await response.json();
      all = all.concat(data || []);
      cursor = pagination?.hasMore ? pagination.nextCursor : null;
    } while (cursor);

    // Enrich with releaseDate/series/logo from pokemontcg.io where a set's
    // name matches — see getPokemonTcgIoSetsByName. pokemontcg.io's public
    // set list is English-only, so Japanese sets are left as-is (no era
    // grouping/logo for those, same as any PokeTrace set with no match).
    //
    // Confirmed live: a service restart clears this cache along with
    // pokemonTcgIoSetsCache, so the *next* request has to redo enrichment
    // from scratch. If that request lands during one of pokemontcg.io's
    // documented transient 500/502 blips, enrichment silently no-ops (every
    // set keeps releaseDate: null) and — without this maxAge distinction —
    // that degraded catalogue used to get locked into this cache for the
    // full 24h even after pokemontcg.io recovered seconds later, since nothing
    // here knew the enrichment attempt had failed. Mirroring
    // getPokemonTcgIoSetsByName's own short retry window here means a failed
    // enrichment gets retried on the next request instead of being stuck.
    let enriched = true;
    if (game === 'pokemon') {
      const metaByName = await getPokemonTcgIoSetsByName();
      enriched = !!pokemonTcgIoSetsCache?.ok;
      all = all.map((s) => {
        const meta = metaByName.get(normalizeSetName(s.name));
        return meta ? { ...s, releaseDate: meta.releaseDate, series: meta.series, logo: meta.logo } : s;
      });
    }

    const maxAge = enriched ? CATALOGUE_CACHE_MAX_AGE_SECONDS : POKEMONTCGIO_SETS_RETRY_CACHE_MAX_AGE_SECONDS;
    setsCache.set(game, { data: all, cachedAt: Date.now(), maxAge });
    res.json(all);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sets/:slug/cards', async (req, res) => {
  const { slug } = req.params;
  const cached = setCardsCache.get(slug);
  if (catalogueCacheFresh(cached)) return res.json(cached.data);
  try {
    let all = [];
    let cursor = null;
    do {
      const params = new URLSearchParams({ set: slug, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards?${params}`);
      if (!response.ok) break;
      const { data, pagination } = await response.json();
      all = all.concat(data || []);
      cursor = pagination?.hasMore ? pagination.nextCursor : null;
    } while (cursor);
    const deduped = dedupeCards(all);
    setCardsCache.set(slug, { data: deduped, cachedAt: Date.now(), maxAge: CATALOGUE_CACHE_MAX_AGE_SECONDS });
    res.json(deduped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CSV-import fallback for rows whose set name doesn't resolve to a known
// slug — lets PokeTrace's own search cover the "which set is this card
// actually in" question instead of scanning a locally-held catalogue.
app.get('/api/cards/search', async (req, res) => {
  const { name, number } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const params = new URLSearchParams({ search: name, limit: '20' });
    const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards?${params}`);
    if (!response.ok) return res.json([]);
    const { data } = await response.json();
    const filtered = number
      ? (data || []).filter((c) => (c.cardNumber || '').split('/')[0].replace(/^0+(?=\d)/, '') === number.split('/')[0].replace(/^0+(?=\d)/, ''))
      : (data || []);
    res.json(dedupeCards(filtered));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PokeTrace doesn't publish a fixed list of graded tier strings (grading
// company names like PSA/BGS/CGC are documented, but not the exact per-card
// tier keys, e.g. "PSA_10") — they only exist per-card, in /cards/{id}'s
// gradedOptions field. So availability has to be discovered live per card
// rather than guessed/constructed client-side. Cached the same as
// priceHistoryCache since a card's set of graded tiers changes rarely.
const CARD_DETAIL_CACHE_MAX_AGE_SECONDS = 6 * 60 * 60;
const cardDetailCache = new Map(); // cardId -> { data, cachedAt }

app.get('/api/cards/:id/grades', async (req, res) => {
  const { id } = req.params;
  const cached = cardDetailCache.get(id);
  if (cached && (Date.now() - cached.cachedAt) / 1000 < CARD_DETAIL_CACHE_MAX_AGE_SECONDS) {
    return res.json(cached.data);
  }
  try {
    const response = await pokeTraceFetch(`${POKETRACE_BASE}/cards/${encodeURIComponent(id)}`);
    if (!response.ok) return res.json({ gradedOptions: [], hasGraded: false });
    const { data } = await response.json();
    const result = { gradedOptions: data?.gradedOptions || [], hasGraded: !!data?.hasGraded };
    cardDetailCache.set(id, { data: result, cachedAt: Date.now() });
    res.json(result);
  } catch (e) {
    console.warn('[grades] lookup failed:', e.message);
    res.json({ gradedOptions: [], hasGraded: false });
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
  const { id, name, set_name, condition, purchase_price, purchase_date, notes, card_id, image, number, set_id, edition, is_graded, grade_tier, grade_label } = req.body;
  db.prepare('INSERT OR REPLACE INTO portfolio (id, name, set_name, condition, purchase_price, purchase_date, notes, card_id, image, number, set_id, edition, is_graded, grade_tier, grade_label, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, set_name || null, condition || null, purchase_price || null, purchase_date || null, notes || null, card_id || null, image || null, number || null, set_id || null, edition || null, is_graded ? 1 : 0, grade_tier || null, grade_label || null, req.userId);
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
    if (!targets.has(key)) targets.set(key, { name: item.name, set: item.set_name, realCardId: item.card_id || null, edition: item.edition, number: item.number, gradeTier: item.grade_tier || null });
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
      if (target.gradeTier) {
        const gp = src[target.gradeTier];
        if (gp && gp.avg) insert.run(snapshotId, target.gradeTier, gp.avg, gp.low || null, gp.high || null, 'poketrace');
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
