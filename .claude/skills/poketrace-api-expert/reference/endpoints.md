# PokeTrace API — Full Endpoint Reference

Derived from `https://api.poketrace.com/v1/openapi.json`, title "PokeTrace API", **version 1.7.0**, fetched 2026-08-11. Servers: `https://api.poketrace.com/v1` (Production). Contact: `contact@poketrace.com`. Re-fetch the live spec if anything here seems out of date — this is a point-in-time snapshot, not a live mirror.

All endpoints below except `/sets` search require `X-API-Key`. This is the **complete** path list per the spec — there is no other documented path (specifically: no top-level `/listings`, no `/health` in the OpenAPI doc itself, no dedicated CardMarket path — CardMarket data comes back via `market=EU` on existing endpoints).

---

## `GET /cards`

List/search cards with filters and pagination.

| Param | Location | Type | Default | Notes |
|---|---|---|---|---|
| `limit` | query | integer | 20 | min 1, max **20** |
| `cursor` | query | string | — | pagination cursor |
| `set` | query | string | — | **set slug**, not display name — resolve via `/sets` first |
| `search` | query | string | — | name search |
| `card_number` | query | string | — | exact/partial card number filter (unused by this app — it fetches broad `search` results and filters `cardNumber` client-side instead) |
| `variant` | query | string | — | `Normal`, `Holofoil`, `Reverse_Holofoil`, `1st_Edition`, `1st_Edition_Holofoil`, `Unlimited` |
| `rarity` | query | string | — | rarity filter |
| `game` | query | string | — | `pokemon`, `pokemon-japanese`, `pokemon-chinese`, `pokemon-thai`, `pokemon-indonesian` |
| `product_type` | query | string | — | `single`, `sealed`, `code_card`, `accessory` |
| `product_family` | query | string | — | `card`, `code_card`, `booster_box`, `booster_pack`, `booster_bundle`, `elite_trainer_box`, `tin`, `deck`, `box_collection`, `blister`, `sealed_case`, `coin`, `accessory`, `other_sealed`, `other` |
| `market` | query | string | — | `US`, `EU` (EU requires Pro+) |
| `tcgplayer_ids` | query | string | — | comma-separated, max 20; alias `tcgplayerIds` |
| `cardmarket_ids` | query | string | — | comma-separated, max 20; alias `cardmarketIds` |
| `has_graded` | query | boolean | — | only cards with graded prices |

**Response 200 — `CardListResponse`**
```
data: Card[]
  id: uuid
  name: string
  cardNumber: string        // e.g. "198/193"
  set: { slug, name }
  variant: string
  rarity: string
  productType: single | sealed | code_card | accessory
  productFamily: <see enum above>
  image: uri
  game: <see enum above>
  market: US | EU
  currency: string
  refs: { tcgplayerId, cardmarketId } | null
  marketplaceUrls: { tcgplayer, cardmarket, ebay } | null
  prices: { [source]: { [tier]: TierPrice } }   // see TierPrice below
  lastUpdated: date-time
pagination: { hasMore: bool, nextCursor: string, count: int }
```

**Confirmed live (2026-08-11): a hard `market=US` filter combined with `set=<slug>` can return zero rows even when `/sets` reports a nonzero `cardCount` for that exact slug** — e.g. `set=destined-rivals` (cardCount 410 per `/sets`) returns 410 rows with no market filter but **0** under `market=US`; the entire set turned out to be EU/Cardmarket-sourced on PokeTrace's side. Also: searching by name can return multiple distinct `slug`s for what a human would call one real-world set (e.g. "Destined Rivals" search hits `destined-rivals`, `destined-rivals-additionals`, and `sv10-destined-rivals` as three separate entries with different card counts, apparently split by data source/market). Don't assume one slug = one real set, and don't hardcode `market=US` on a browsing/listing query — only the pricing path (which wants US-only comps deliberately) should do that.

**This app's usage:** `resolvePokeTraceCard()` in `server.js` calls this with `search`, `market: 'US'`, `limit: '20'` only, then does its own client-side `set`/`cardNumber` matching (see SKILL.md gotchas) instead of using the `set`/`card_number`/`variant` params directly.

---

## `GET /cards/{id}`

Detailed single-card info with pricing by source and tier.

| Param | Location | Type | Required |
|---|---|---|---|
| `id` | path | uuid | yes |

**Response 200 — `CardDetailResponse`**: same `Card` shape as above, plus:
```
gradedOptions: string[]     // available graded tier names for this card, e.g. PSA_10
conditionOptions: string[]  // available raw tier names
topPrice: number
totalSaleCount: integer
hasGraded: boolean
```
**Response 404**: card not found.

**This app's usage:** never called. All lookups go through `/cards?search=` and take `data[0]`/best match.

---

## `GET /cards/{id}/prices/{tier}/history`

Price history for one card, one tier.

| Param | Location | Type | Default | Notes |
|---|---|---|---|---|
| `id` | path | uuid | — | required |
| `tier` | path | string | — | required, e.g. `NEAR_MINT`, `PSA_10` |
| `period` | query | string | `7d` | `7d`, `30d`, `90d`, `1y`, `all` |
| `limit` | query | integer | 50 | max entries per page |
| `cursor` | query | string | — | pagination cursor |

**Response 200 — `PriceHistoryResponse`**
```
data: [
  date: date
  source: ebay | tcgplayer | cardmarket | cardmarket_unsold
  avg, low, high: number
  saleCount: integer
  approxSaleCount: boolean
  avg1d, avg7d, avg30d: number
  median3d, median7d, median30d: number
  country: { ... per-country/language breakdown, nested }
  language: { ... per-language fallback, nested }
]
pagination: { hasMore, nextCursor, count }
```

**This app's usage:** `/api/price-history` calls this with `period: '90d'`, `limit: '100'`, tier from `PRICE_CONDITIONS`. Only reads `r.avg/low/high/date` — ignores `source`, the rolling-average/median fields, and the country/language breakdowns entirely. Those are available if trend/sparkline features ever want finer granularity than the flat 90d series currently shown.

---

## `GET /cards/{id}/listings`

Sold eBay listing comps for a card. **Scale plan required.**

| Param | Location | Type | Default | Notes |
|---|---|---|---|---|
| `id` | path | uuid | — | required |
| `limit` | query | integer | 20 | max 20 |
| `cursor` | query | string | — | pagination cursor |
| `grader` | query | string | — | `PSA`, `BGS`, `CGC`, `SGC` |
| `grade` | query | string | — | grade filter |
| `min_price` | query | number | — | |
| `max_price` | query | number | — | |
| `sort` | query | string | `sold_at_desc` | `sold_at_desc`, `sold_at_asc`, `price_desc`, `price_asc` |

**Response headers:** `X-RateLimit-Limit: 30`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds).

**Response 200 — `ListingsResponse`**
```
data: [
  id: integer
  sourceItemId: string
  listingType: "sold"
  title: string
  price: number
  currency: string
  listingUrl: uri
  condition: string
  grader: string
  grade: string
  soldAt: date-time
  anomalyFlag: string
  anomalyReason: string
]
pagination: { hasMore, nextCursor, count }
```
**Response 403:** `"Scale plan required"`. **Response 429:** `"Rate limit exceeded (30 requests per 30 seconds per account)"`.

**⚠️ This is NOT what `server.js`'s `/api/listings` route calls.** See SKILL.md's "Known drift" section — the app calls a free-text-search `/listings` path that doesn't appear anywhere in this spec, and the frontend expects `type`/`timeLeft` fields that don't exist on this documented `Listing` shape at all.

---

## `GET /sets`

List/search card sets.

| Param | Location | Type | Default | Notes |
|---|---|---|---|---|
| `search` | query | string | — | name search |
| `game` | query | string | — | same enum as `/cards`' `game` param |
| `limit` | query | integer | 20 | max 100 |
| `cursor` | query | string | — | pagination cursor |

**Response 200 — `SetListResponse`**
```
data: [ { slug: string, name: string, releaseDate: date, cardCount: integer } ]
pagination: { hasMore, nextCursor, count }
```
**Confirmed live (2026-08-11, not in the OpenAPI doc): `releaseDate` is `null` on every entry, for every `game` value** — checked across the full 502-set `game=pokemon` catalogue, not a sampling artifact. Don't build anything (era grouping, sort-by-date) that assumes this field is populated.

**This app's usage:** called by the catalogue-browsing feature (`/api/sets` in `server.js`, see `catalogue-sync` skill) — this was previously the direct fix for the "set slug isn't derivable from the display name" problem noted in SKILL.md, and now is: a name→slug lookup here lets `/cards` be called with a real `set=` filter instead of over-fetching by name and fuzzy-matching client-side. The pricing path (`resolvePokeTraceCard`) still doesn't use it and still fuzzy-matches — that's a separate, still-open gap.

---

## `TierPrice` object (nested under `Card.prices[source][tier]`)

```
avg, low, high: number
trend: up | down | stable
confidence: high | medium | low
saleCount: integer
avg1d, avg7d, avg30d: number
median3d, median7d, median30d: number
country: { ... nested per-country/language breakdown }
language: { ... nested top-level per-language fallback }
```

This app's `extractGradePrice()` (`src/api/poketrace.js`) only reads `avg/low/high` off this object — `trend`, `confidence`, and the sale-count/rolling-average fields are all available but unused. `trend`/`confidence` in particular would be cheap wins for UI (e.g. a trend arrow) without any extra API calls, since they ride along on data already being fetched.

---

## WebSocket (Scale plan, early access)

- URL: `wss://api.poketrace.com/v1/ws`
- Auth: `X-API-Key` header
- Limits: max 3 concurrent connections/user, 30 messages/min, 1KB max message size
- On connect: `{"event": "connected", "data": {"message": "Connected to PokeTrace real-time feed"}}`
- Keepalive: client/server exchange `{"type": "ping"}` / `{"type": "pong"}`
- Event: `price.card-updated` — fields vary by source but commonly include `id`, `source` (`eBay`/`TCGPlayer`/`Cardmarket`), `tier`, `price`, `currency`, `timestamp`; some include `avg1d`/`avg7d`/`avg30d`; Cardmarket messages add `country`.

Not used anywhere in this app (which relies on the 6h `node-cron` poll instead). Would require a Scale-plan key.

---

## Plan tiers (feature gating, from `/docs/authentication`, `/docs/graded-prices`, `/docs/websocket`, `/developers`)

| Plan | Unlocks |
|---|---|
| Free | Base US-market, raw-condition-tier access only, "low daily limits" (no number published) |
| Pro | + EU/CardMarket data (`market=EU`), + graded tiers (PSA/BGS/CGC/SGC/ACE/TAG per `/docs/graded-prices`) |
| **Growth ← this project's `POKETRACE_API_KEY`** | Same data access as Pro (EU + graded included), higher request capacity than Pro |
| Scale | + WebSocket access, + `GET /cards/{id}/listings`, + higher rate limits |

This account can reach every documented endpoint and filter **except** WebSocket and `GET /cards/{id}/listings` — both explicitly gated one tier up, at Scale. Everything else in this reference (graded tiers, `market=EU`, `/sets`, `/cards/{id}`, all `/cards` filters) works on the current key today.

A 403 with a plan-required message on `/cards/{id}/listings` or a refused WebSocket connection is the expected failure mode on this account, not a bug — don't spend time debugging auth for those two specifically without first checking whether the account has since been upgraded.

## Not publicly documented (checked and confirmed absent, not just unfound)

Re-fetching these will not turn up more — every documentation surface (`/docs/*` pages, `openapi.json`, `/developers`, `/.well-known/api-catalog`, `llms.txt`) was checked and converges on the same gaps as of 2026-08-11:
- Exact numeric request quotas per plan (requests/minute or /day) for Free, Pro, Growth, or Scale — only the Scale-only `/cards/{id}/listings` publishes a number (30/30s).
- How to obtain/rotate an API key, or any self-service key-management flow.
- A full enumeration of graded tier values — only grading *company* names are documented (PSA, BGS, CGC, SGC, ACE, TAG). The actual tier strings are only discoverable live, per-card, via `/cards/{id}`'s `gradedOptions` field — this app now does exactly that (`GET /api/cards/:id/grades`, added for the graded-portfolio feature). Confirmed live against a real card (Base Set Charizard): tier strings are `{COMPANY}_{GRADE}`, with half-grades as a second underscored segment rather than a decimal — `PSA_10`, `PSA_9`, `BGS_9_5` (= BGS 9.5), `CGC_10`, `ACE_1`, `SGC_8`, `TAG_10`, etc. Not all tiers PokeTrace supports in general are necessarily priced for every card — `gradedOptions` reflects what's actually available for that specific card, which is the whole reason to call it live instead of hardcoding a list.
- `/health`'s response body schema — path and method are documented, the JSON shape isn't.
- A general auth-failure error body/status code (401 shape) — only endpoint-specific errors are documented (`/cards/{id}` 404, `/cards/{id}/listings` 403/429).
- Request signing, IP allowlisting, or key scopes — no mention anywhere.

If any of these become load-bearing for a task, say so explicitly rather than guessing a plausible-looking number or shape.
