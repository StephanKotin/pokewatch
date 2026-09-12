---
name: poketrace-api-expert
description: Use any time Claude Code works with the PokeTrace API in this project — editing server.js's pokeTraceFetch/resolvePokeTraceCard/lookupCardPrices, src/api/poketrace.js, the /api/prices, /api/price-history, or /api/listings routes, the price_snapshots table, or anything involving card price lookups, price history, grading tiers, set-slug/card-number matching, or PokeTrace rate limits and plan tiers. Also use when asked what PokeTrace's API can do, whether an endpoint/param exists, or how to add a new PokeTrace-backed feature (sets browsing, graded prices, websocket live updates, sold-listing comps, non-English cards).
---

# PokeTrace API Expert

Grounds two things that must not be confused: **how this app already talks to PokeTrace** (battle-tested, in `server.js` / `src/api/poketrace.js`) and **what PokeTrace's API actually documents today** (from their live OpenAPI spec, fetched and hash-verified 2026-08-11). Full endpoint tables live in [reference/endpoints.md](reference/endpoints.md) — load that file when you need exact params/response fields; keep this file for orientation and the gotchas.

## Ground truth sources

- Docs index: `https://poketrace.com/docs` (sub-pages: `/docs/cards`, `/docs/sets`, `/docs/price-history`, `/docs/listings`, `/docs/cardmarket`, `/docs/graded-prices`, `/docs/websocket`, `/docs/authentication`, `/docs/llm-integration`, `/docs/health`)
- Machine-readable spec (authoritative, most complete): `https://api.poketrace.com/v1/openapi.json` — title "PokeTrace API", version **1.7.0** as of this fetch
- API catalog: `https://poketrace.com/.well-known/api-catalog`
- Vendor-published agent skill (thin, mostly links — this skill supersedes it for depth): `https://poketrace.com/.well-known/agent-skills/poketrace-api/SKILL.md`

If something here looks stale (a param that 404s, a field that's missing), re-fetch `openapi.json` — it's the source of truth, this file is a snapshot of it.

## Base facts

- Base URL: `https://api.poketrace.com/v1`
- Auth: `X-API-Key` header. **Server-side only** — `POKETRACE_API_KEY` lives in `server.js`'s env and must never reach the client. The frontend (`src/api/poketrace.js`) never calls PokeTrace directly; it calls this app's own `/api/prices`, `/api/price-history`, `/api/listings`.
- Documented paths (verbatim from `openapi.json`): `/cards`, `/cards/{id}`, `/cards/{id}/prices/{tier}/history`, `/cards/{id}/listings`, `/sets`. That's the complete list — there is no documented top-level `/listings` or `/health` path in the spec itself (health is only in the API catalog, not the OpenAPI doc).
- **This project's `POKETRACE_API_KEY` is on the paid Growth plan.** Plan tiers gate features, not just volume: Free (US market, raw tiers only) → Pro (adds EU/CardMarket data + graded tiers) → **Growth (same data access as Pro, higher request capacity — this account)** → Scale (adds websocket + `/cards/{id}/listings` + higher limits). Practical effect for this project:
  - **Available on this key today, just unused:** EU/CardMarket data (`market=EU`), graded tiers (PSA/BGS/CGC/SGC/ACE/TAG), `/cards/{id}` detail, `/sets`, `variant`/`card_number`/`game`/`product_type`/`product_family` filters on `/cards`.
  - **Not available on this key at any price point below Scale:** WebSocket (`wss://.../v1/ws`) and `GET /cards/{id}/listings` — both are gated to the Scale plan specifically, one tier above Growth. Don't propose either as a quick win without flagging the plan upgrade they require.
- No numeric per-minute/per-day request quotas are published anywhere for any plan (checked docs, OpenAPI, and the developer hub — genuinely not documented, not an oversight in this skill). The only published numeric limit anywhere in the API is `/cards/{id}/listings`' 30 req/30s — which this account can't reach anyway. Treat quota exhaustion as something you'll only see as a 429 in practice, not something to precompute.

## Known drift: this app's `/api/listings` route

`server.js`'s `app.get('/api/listings', ...)` calls `GET ${POKETRACE_BASE}/listings?search=&market=&limit=&maxPrice=` — free-text search, no card ID. **That path does not exist in the current OpenAPI spec.** The only documented listings endpoint is `GET /cards/{id}/listings`, which:
- requires a card UUID (from `/cards` search first, not free text),
- is Scale-plan only and rate-limited to 30 requests/30s/account (`X-RateLimit-*` response headers),
- returns only **sold** comps (`listingType: "sold"`, `soldAt`, `grader`, `grade`), not live buy-now/auction listings,
- has no `type` or `timeLeft` field — but `src/api/poketrace.js#searchListingsAPI` reads exactly those two fields off the response.

This mismatch means either PokeTrace has a legacy/undocumented search-based listings endpoint still running behind `/listings`, or this route is silently degraded. **Don't assume it works.** Two compounding problems if you're touching this:

1. `app.get('/api/listings', ...)` in `server.js` never checks `response.ok` before calling `response.json()` — unlike every other PokeTrace-calling route in the file. A 404/403/error body from PokeTrace gets parsed as if it were a valid listings payload and passed straight to the client. If this route is misbehaving, that's the first thing to fix regardless of the endpoint question.
2. **Even if this app were changed to call the documented `/cards/{id}/listings` correctly, it would still fail on this account** — that endpoint requires the Scale plan, and this project's key is Growth. A "fix" that just swaps the URL isn't a fix without also upgrading the plan. Confirm plan-vs-endpoint compatibility before proposing changes here, and say so explicitly if a real fix requires an upgrade.

If it does turn out `/listings` is dead, the realistic options are: upgrade to Scale and rework the UI around sold-only comps (the only thing the documented endpoint offers — no live buy-now/auction data, no `type`/`timeLeft`), or drop the live-listings feature.

## Hard-won matching logic (don't regress these)

These live in `server.js` and encode real bugs found and fixed in production — see git history (`3a65245`, `80b59a5`, `57c79cb`) for the incidents:

- **Set-slug non-derivability.** PokeTrace's `set` filter on `/cards` wants their internal slug (e.g. `ex-firered-and-leafgreen`), not a display name, and the slug doesn't follow a guessable pattern from the name. `resolvePokeTraceCard`/`lookupCardPrices` (the price-lookup path this skill covers) still search by `search=<name>` only and fuzzy-match the returned `set.name` client-side (`findBestSetMatch`/`normalizeSetName`) — don't casually "fix" this into a slug guess. Note this is now solved *elsewhere*: the catalogue-browsing feature (`/api/sets`, `/api/sets/:slug/cards` in `server.js`) does call `GET /sets` and pass a real `set=<slug>` filter — see the `catalogue-sync` skill for that path and for real gotchas found hitting it live (`Set.releaseDate` is always null; a hard `market=US` filter silently empties out some real sets). Those gotchas apply to any future use of `/sets`/`set=` here too.
- **Card number format.** PokeTrace's `cardNumber` is `"198/193"` (zero-padded numerator/total); this app stores bare numerators (`"198"`). Always normalize both sides before comparing (`normalizePokeTraceNumber`: split on `/`, strip leading zeros). Raw string comparison silently fails on every card.
- **Promo sets reuse card names at different print numbers and wildly different prices** (e.g. "Vaporeon V" as SWSH150 vs SWSH181, $8 vs $86). When a print number is known, match on exact normalized `cardNumber` first (`findBestCardMatch`); only fall back to fuzzy set-name matching without one. The documented `card_number` query param on `/cards` could replace this client-side filtering if adopted — currently unused.
- **1st Edition / Unlimited are different collectibles for the same card_id.** Handled today by appending the edition to the free-text `search` term. PokeTrace actually documents a `variant` enum (`Normal, Holofoil, Reverse_Holofoil, 1st_Edition, 1st_Edition_Holofoil, Unlimited`) on `/cards` — an unused, more precise alternative to text-stuffing the search query.
- **No NEAR_MINT quote from PokeTrace** → falls back to pokemontcg.io's `tcgplayer.prices` market price, tagged `fallbackSource: 'pokemontcgio'` in the `price_snapshots.source` column so the UI/DB can distinguish real PokeTrace comps from the fallback.

## Rate limiting — reuse the existing queue, don't bypass it

PokeTrace enforces a burst limit well below the daily quota (confirmed by hand: ~40 simultaneous requests gets most of them 429'd). `server.js` funnels **every** PokeTrace call through `pokeTraceFetch`/`pokeTraceQueue`/`pokeTraceDrain`: max 3 concurrent requests, 150ms minimum spacing between dispatches, up to 4 attempts with `600 * attempt`ms backoff on 429. The one exception is `/api/listings`, which calls `fetch()` directly, bypassing the queue — worth fixing if that route is touched anyway. Any new PokeTrace call added to `server.js` must go through `pokeTraceFetch`, not a bare `fetch`.

Separately, the documented `/cards/{id}/listings` endpoint has its own explicit limit (30 req/30s/account, surfaced via `X-RateLimit-*` headers) — that's on top of, not instead of, the general burst limit.

## Caching layers already in place (don't duplicate or accidentally bypass)

1. `/api/prices` — checks `price_snapshots` for a per-grade row within 24h (`PRICE_CACHE_MAX_AGE_SECONDS`) before calling PokeTrace.
2. `/api/price-history` — in-memory cache (`priceHistoryCache`, keyed `${cardId}|${tier}`) for 6h.
3. `src/api/poketrace.js` — separate 15-minute in-memory cache in front of the app's own `/api/prices`, keyed `name|set`.
4. A `node-cron` job (`0 */6 * * *`, `scanPrices`) proactively refreshes every watchlist + portfolio card every 6 hours and fires threshold alerts — this is the main freshness mechanism, not on-demand fetches.

## Grade/condition key mapping

App's short keys → PokeTrace tier names (`PRICE_CONDITIONS` in `server.js`): `nm→NEAR_MINT, lp→LIGHTLY_PLAYED, mp→MODERATELY_PLAYED, hp→HEAVILY_PLAYED, dmg→DAMAGED`. These are **raw** condition tiers, stored under their short key in `price_snapshots.grade`.

**Graded tiers are now live in this app** (portfolio only, as of the graded-card feature). Confirmed live against `/cards/{id}`'s `gradedOptions` for a real card (Base Set Charizard): tier strings are `{COMPANY}_{GRADE}`, with half-grades as a *second underscored segment*, not a decimal — `PSA_10`, `BGS_9_5` (= BGS 9.5), `CGC_10`, `ACE_1`, `SGC_8`, `TAG_10`, etc. Graded tiers are stored verbatim (not through `PRICE_CONDITIONS`) in `price_snapshots.grade`, `portfolio.grade_tier`, and `portfolio.grade_label` (the pretty-printed form, e.g. "BGS 9.5" via `formatGradeTier` in `src/data/grades.js`). Never construct/guess a tier string — always discover it live per card via the new `GET /api/cards/:id/grades` route (proxies `/cards/{id}`, cached 6h), which is exactly what the skill previously warned this app should do instead of guessing.

**Raw portfolio cards now always price off `NEAR_MINT`/`nm` regardless of the recorded physical condition** (Lightly Played, Damaged, etc. no longer drive which PokeTrace tier gets queried) — condition is informational-only for raw cards now. This was a deliberate product decision, not a bug: PokeTrace's per-condition raw comps (LP/MP/HP/DMG) are thin/unreliable compared to NEAR_MINT. See `priceTierField`/`historyGradeKey` in `src/pages/Portfolio.jsx` and the comment in `usePortfolioPrices.js`.

## Capabilities documented but not used anywhere in this app

Useful to know when scoping a new feature — none of these require touching existing logic, they're additive. Split by whether this account's Growth plan can actually reach them:

**Now in use:**
- `GET /cards/{id}` — used via the new `GET /api/cards/:id/grades` route (added for the graded-portfolio feature) to read `gradedOptions`/`hasGraded` for a specific card. Still unused: its `conditionOptions`, `topPrice`, `totalSaleCount` fields.
- Graded tiers (PSA/BGS/CGC/SGC/ACE/TAG) — portfolio cards can now be marked graded and priced off their real graded tier (discovered live per card, never guessed). See "Grade/condition key mapping" above for the confirmed tier-string format.

**Reachable today on this account's key, still never called:**
- `market=EU` / CardMarket data — Growth includes Pro-level EU access, but the *pricing* code path (`/api/prices`, `/api/price-history`, `/api/listings`, `resolvePokeTraceCard`) is hardcoded `market: 'US'` everywhere. EU pricing is buildable today, not gated by plan. (The separate catalogue-browsing routes deliberately do *not* filter by market — see `catalogue-sync`.)
- `variant` / `card_number` / `product_type` / `product_family` filters on `/cards` — none used by the pricing path; `variant` in particular (`1st_Edition`, `Unlimited`, etc.) is a more precise replacement for today's text-stuffed edition search. (`GET /sets` and `/cards`' `set=`/`game=` filters *are* now used — by the catalogue-browsing feature, not this pricing path — see `catalogue-sync`.)

**NOT reachable on this account's Growth plan (would need a Scale upgrade):**
- WebSocket (`wss://api.poketrace.com/v1/ws`) — real-time `price.card-updated` push, would let alerts fire without waiting for the 6h cron. See [reference/endpoints.md](reference/endpoints.md) for message formats.
- `GET /cards/{id}/listings` — the documented sold-listings endpoint. See "Known drift" above.

Don't build any of these speculatively — surface them when the user's ask actually calls for it (e.g. "can we show PSA 10 prices" → graded tiers, buildable now; "can alerts be instant" → websocket, needs a Scale upgrade first, say so).
