---
name: cto
description: Use for any cross-cutting technical-ownership question on pokewatch — system architecture, stack/dependency choices, data model and migrations, auth/security posture, deployment and ops risk, "what should we build/refactor next," reviewing an approach or trade-off, or estimating the blast radius of a change across frontend/backend/DB/deploy. Also use whenever no narrower skill fits but the question is "how does this whole thing actually work" or "is this a good idea for this codebase." Defers to catalogue-sync for catalogue/era logic and poketrace-api-expert for PokeTrace API specifics — this skill is for the whole system, not one subsystem. Snapshot taken at commit b09b93e (2026-09-11); re-orient with `git log --oneline b09b93e..HEAD` before trusting stack facts on an older checkout. Locations here are given as `grep` recipes rather than line numbers, deliberately — see "Keeping this current."
---

# CTO

Act with the technical ownership of this project's CTO: the person who knows why every dependency, table, and deploy step is there, holds the whole system in their head at once, and gives advice calibrated to what this codebase actually is — a single-developer, single-VPS Pokémon card price tracker, not a startup pre-Series-A platform. Judgment here means matching engineering effort to actual stakes: real user data (auth, portfolios) deserves care; a solo project's internal tooling doesn't need enterprise ceremony. See "Engineering judgment for this project" below before recommending anything that adds process or infrastructure.

## The stack, grounded

- **Frontend**: React 19 + Vite 7, no router library — `src/App.jsx` hand-rolls tab routing via `TAB_PATHS`/`window.history.pushState`/`popstate`. No CSS framework: one `.css` file per component/page, colocated (`Portfolio.jsx` + `Portfolio.css`). Charts via `recharts` (`PriceChart.jsx`, `Sparkline.jsx`). State is plain hooks in `src/hooks/` (`usePortfolio`, `useWatchlist`, `useAlerts`, `useSettings`, `usePortfolioPrices`, `useWatchlistPrices`) — no Redux/Zustand/Context-as-store beyond `AuthContext`. No TypeScript.
- **Backend**: single-file Express monolith, `server.js` (~1.7k lines, all routes/DB/cron/auth/Stripe in one place — no `routes/`, `controllers/`, or `models/` split, and no `express.Router()` anywhere: every route is `app.*` on one instance). Not a deliberate anti-pattern to "fix" by decomposing — see judgment section.
- **Database**: SQLite via `better-sqlite3`, synchronous queries, one file (`DB_PATH` env var or `./pokewatch.db`). Schema is created inline with `CREATE TABLE IF NOT EXISTS` plus a block of `try { db.exec("ALTER TABLE ... ADD COLUMN ...") } catch(e){}` for every column added since — there is **no migration framework** (no Knex/Prisma/Drizzle, no versioned migration files). This is the append-only-ALTER pattern; see "Data model" below before adding a column.
- **Auth**: `jsonwebtoken` + `bcryptjs`, hand-rolled `authenticate` middleware (`grep -n 'function authenticate' server.js`) reading `Bearer` tokens, with `requireAdmin` beside it gating `/api/admin/*` on `users.role`. Registration is approval-gated: new accounts land in a pending `status`, an email (via Resend) goes to `ADMIN_EMAIL` with signed approve/reject links (`/api/admin/approve/:token`, `/api/admin/reject/:token`).
- **External APIs**: PokeTrace (primary, pricing + catalogue — see `poketrace-api-expert` skill) and pokemontcg.io (fallback pricing + set era/logo/date enrichment — see `catalogue-sync` skill). Both called server-side only; API keys never reach the client.
- **Scheduled work**: `node-cron` job (`scanPrices`, every 6h) refreshes watchlist/portfolio prices and fires threshold alerts — the app's main freshness mechanism, not on-demand polling.
- **Analytics**: PostHog (`posthog-js`), client-side only, gated on `VITE_POSTHOG_KEY` being set at **build time** (Vite bakes `import.meta.env.VITE_*` in, it isn't read at server runtime like the other env vars). Deliberately unset in local dev so testing doesn't pollute real analytics (`src/analytics.js`).
- **Payments**: `stripe` (API version pinned in `server.js` — `grep -n 'STRIPE_API_VERSION' server.js`), used only by the storefront: Checkout Sessions, a signature-verified webhook, and Stripe Tax. The client is lazily optional, so with no `STRIPE_SECRET_KEY` the checkout route 503s and the rest of the app boots normally — the collector tool has **zero** runtime dependency on Stripe. No Connect, no Billing, no subscriptions (despite the eight vendored `stripe-*`/`connect-*` skills being present). PokeWatch accounts are free; their only gate is admin approval.
- **Testing**: Playwright, and it is **wired into CI as a deploy gate** — `.github/workflows/deploy.yml` has a `test` job (`npm ci`, `npx playwright install chromium`, `npm test`) and the `deploy` job declares `needs: test`, so a failing spec blocks the deploy. `tests/smoke.spec.js` currently covers auth only (sign-in succeeds, wrong password rejected); `tests/test-env.js` + `playwright.config.js` boot a real server on an isolated `DB_PATH` with deliberately blanked credentials. Coverage is thin — the storefront has none — but the gate is real, so a red suite is a blocked deploy, not an advisory.
- **Node**: pinned via `.nvmrc` to `20`.

## Where things live (map, not a rule to enforce)

```
server.js                 everything backend: routes, DB schema+migrations, auth, PokeTrace/pokemontcg.io
                           calls, Stripe, cron, static-file serving of the Vite build
src/api/poketrace.js       frontend's thin wrapper around this app's OWN /api/* routes (never calls
                           PokeTrace directly — server.js does that). Sends the Bearer token on every
                           call, and its handle401 DELETES the token and reloads the page — so any
                           route the client hits must not 401 unless signing the user out is intended
src/api/store.js           same idea for the storefront routes (/api/products, /api/checkout, /api/admin/*)
src/pages/                 one file per tab. Collector: Portfolio, Watchlist, Catalogue, Alerts,
                           Listings, Settings. Storefront: Store, ProductDetail, Cart, CheckoutResult,
                           Admin. Shared: Login. Each + matching .css
src/hooks/                 data-fetching/state hooks, one per domain concept (useCart is localStorage-only,
                           never synced to the server — guest checkout by design)
src/context/AuthContext.jsx  the one piece of real shared state (current user, token)
src/data/                  small hand-written constant tables (eraMap, editions, grades) — not synced
                           from anywhere, edited by hand when the underlying facts change
tests/                     Playwright specs + the isolated-DB harness. This is the CI deploy gate
packages/                  never-deployed satellites. See "Zones" below. Currently: packages/world
                           (Agent World, a local agent dispatch console)
dist/                      Vite build output, gitignored — regenerated on the droplet by `npm install`'s
                           `postinstall: vite build` hook every deploy, served directly by Express
.github/workflows/deploy.yml  the entire CD pipeline
```

## Zones: two products and one satellite, in one repo

This is the structural fact that no amount of reading a single file will tell you.

**The deployed app is the repo root**, and it serves **two brands from one process**:

- **PokéWatch** — the collector tool, usable by anyone: portfolio, watchlist,
  alerts, catalogue, price history. ~19 routes.
- **tcgoftexas.com** — a storefront selling singles and sealed product. ~11
  routes, sitting in three *contiguous islands* in `server.js` rather than
  interleaved with collector code: the Stripe client and tax readiness check near
  the top, `fulfillOrder` + the webhook (which must stay mounted **before**
  `express.json()` for raw-body signature verification), and the
  products/checkout/admin routes. Find them with
  `grep -n 'stripe\|/api/products\|/api/checkout\|/api/admin' server.js`.

Each product has its own base URL — `APP_BASE_URL` for the collector tool,
`STORE_BASE_URL` for the store (defaulting to it) — so Stripe returns a buyer to
the site they shopped on and approval emails point at the tracker. These are
static values on purpose: `trust proxy` is a hop count, which makes Express
honour `X-Forwarded-Host` unconditionally, so **never derive an outbound URL
from `req.hostname`.** Still unbuilt, and waiting on a hostname that does not
exist yet: the client half — per-brand title, favicon, nav and default tab.

Otherwise both are one Vite bundle, one `express.static`, one SPA, one SQLite
file, one systemd unit. The storefront is a set of tabs in the same `TAB_PATHS` map,
rendered *above* the login gate via `PUBLIC_TABS` — the split between the two
products is auth-gate ordering, not routing. There is no second process and no
vhost per brand; don't propose one, it re-splits what one-process-two-brands
deliberately joined.

**`packages/` holds only satellites that are never deployed**, never imported by
root code, and never npm workspaces: each has its own `package.json`, its own
lockfile, its own `node_modules`. A satellite may *read* the repo (file paths,
`.claude/`) but must never be imported by it. **Adding a `workspaces` key to the
root `package.json` is the tripwire** — if you need one, you've stopped building
a satellite. `packages/world` runs `vite ^8` against the root's `vite ^7`, which
only works because nothing links them.

Two corollaries that bite:

- **Don't move the app under `packages/`.** `DB_PATH` defaults to
  `path.join(__dirname, 'pokewatch.db')`. Move `server.js` and `__dirname` moves
  with it, so unless `DB_PATH` is set on the droplet *first*, the app boots fine,
  runs `CREATE TABLE IF NOT EXISTS` against a brand-new empty file, and every
  user's portfolio silently "disappears" with no error anywhere. Data-loss-shaped
  with no staging to catch it.
- **"`server.js`" is ambiguous now.** There are two: the app's, at the repo root,
  and `packages/world/bridge/server.js`. Say which.

## Data model

Ten tables, all in `server.js`'s single `db.exec(...)` block (`grep -n 'CREATE TABLE IF NOT EXISTS' server.js`), bucketed by product:

- **Collector**: `watchlist`, `price_snapshots`, `portfolio`, `alerts`, `user_settings`
- **Storefront**: `products`, `orders`, `order_items`
- **Shared**: `users`, `app_cache` (a generic KV used by both catalogue and price caching)

**The seam between the two products is deliberately narrow.** The only declared `REFERENCES` in the entire schema is `user_settings.user_id → users(id)`; every other user scoping is a bare `TEXT` column with no FK constraint. The two live couplings are `users.role`, which `requireAdmin` reads to gate `/api/admin/*`, and `orders.user_id`, which links a store order to a collector account. Don't add a third without deciding to.

**Accounts converge, and the linking rule is load-bearing** (`grep -n 'linkGuestOrders\|optionalAuth' server.js`). An order acquires its `user_id` on one of three paths: at checkout when the buyer is signed in; in `fulfillOrder`, matching Stripe's `customer_details.email` against `users`; or via `linkGuestOrders`, called from the **admin approval route and from login — never from registration.**

That exclusion is a security decision, not an oversight. With no email verification, an address at registration is only a claim, so linking there would let someone sign up as `victim@example.com` and inherit their orders, shipping address included. Approval is a human checking the address, and is the only identity verification this app has. Login is safe without a human because the harm runs the other way: the email on an order was typed into Stripe by whoever paid, so a wrong one exposes the *payer's* own order to the real owner of that address.

The other invariant on this path: **`/api/checkout` must never answer 401.** It uses `optionalAuth`, which attaches a user when a token is present and calls `next()` regardless, because `src/api/poketrace.js`'s `handle401` deletes the token and reloads the page — a 401 there signs a customer out mid-payment. `tests/orders.spec.js` asserts 503-not-401 across four shapes of bad header.

`watchlist`/`portfolio` rows are scoped to a user via a `user_id` column that was **added after the tables were**, through the ALTER-and-catch pattern — this tells you the intended workflow for schema changes here: add the column to the `CREATE TABLE IF NOT EXISTS` block for new installs *and* add a matching `ALTER TABLE ... ADD COLUMN` wrapped in `try/catch` for existing ones, in the same change. Never assume a column exists on an existing DB just because it's in the `CREATE TABLE` block — the DB on the droplet predates most of them.

This is a real, accepted trade-off for a single-SQLite-file, single-developer app: no down-migrations, no migration history table, no dry-run — correctness relies on every `ALTER` being idempotent (`catch(e){}` swallows "column already exists") and additive-only. Don't propose a migration framework unprompted; do flag it if a change needs something the pattern can't do safely (renaming/dropping a column, a NOT NULL backfill, anything where "run it twice, it's fine" stops being true).

## Auth & security posture — what is actually in place

This section previously listed a set of "real gaps" that have since been closed, which is worse than saying nothing: an agent reading it re-hardens hardened code, or reasons about a new route's exposure from a false baseline. What is really there (`grep -n 'app.use(helmet\|app.use(cors\|app.use(express.json\|rateLimit({\|trust proxy' server.js`):

- **`helmet`**, with `contentSecurityPolicy: false`. The CSP is off **deliberately and for a stated reason** — the built page pulls Google Fonts' stylesheet and talks to PostHog cross-origin, both of which a default CSP blocks, and there is no staging environment to catch that kind of breakage before production. The rest of helmet's headers carry no such risk. Don't "fix" this without a way to test it.
- **`cors({ origin: APP_BASE_URL })`** — restricted to a single origin, not wide open. Note the implication for two brands: one origin means one brand, so adding a second front door means this becomes a list.
- **`express.json({ limit: '100kb' })`** — body size limit is set.
- **`express-rate-limit`**, as `authLimiter` — but applied **only** to `/api/auth/register` and `/api/auth/login`. That is the accurate nuance: brute force on auth is covered; the rest of `/api/*` is not rate-limited. Say that precisely rather than either "no rate limiting" or "rate limiting is handled."
- **`app.set('trust proxy', 2)`** — Caddy behind Cloudflare, two hops. This is what makes the rate limiter key on the real visitor instead of every visitor sharing Caddy's address. It has a second, non-obvious consequence: the numeric form compiles to `(addr, i) => i < 2`, so `trust(addr, 0)` is **always true**, which means Express honors `X-Forwarded-Host` unconditionally whenever it is present. So `req.hostname` is attacker-influenceable in principle — if you ever branch on it, validate against an allowlist and never build an outbound URL from it.
- **`JWT_SECRET`** must be set in production (`.env.example` warns: unset means a random secret per restart, invalidating every session on every deploy — and every deploy restarts the process). The deploy workflow generates and persists one if `.env` lacks it, so a fresh droplet can't crash-loop.
- **Registration is approval-gated by design** (pending → admin gets approve/reject links) — the actual access-control mechanism for a small user base, not a stopgap to "finish." It is also the only identity verification in the system, which makes it the right hook for anything that needs a human to vouch for an email.
- **Stripe webhook signature is verified**, and `fulfillOrder` is idempotent on `order.status === 'paid'` because Stripe retries deliveries that don't 2xx in time.

Remaining real gaps, stated as gaps: no rate limiting outside auth, no email verification, no CSP, and no per-route authorization beyond `authenticate`/`requireAdmin`. Don't silently fix these — name them and let the user decide, per "Engineering judgment" below. Do treat them as real when reasoning about new surface area.

One non-negotiable that is easy to get wrong: **`user_id` comes from the verified token, never from a request body or query param.** And because `src/api/poketrace.js`'s `handle401` deletes the token and reloads the page, returning 401 from a route a *shopper* can hit (checkout, say) signs them out mid-flow — prefer middleware that attaches a user when present and calls `next()` regardless.

## Deployment & ops reality

`.github/workflows/deploy.yml`: push to `master` → SSH (`appleboy/ssh-action`) into a DigitalOcean droplet → `git fetch && git reset --hard origin/master` in `/opt/pokewatch` → `npm install` (which runs `postinstall: vite build`) → `sudo systemctl restart pokewatch`. Implications worth internalizing:

- **There is no staging environment.** Push to `master` *is* the deploy. Anything merged is live within the workflow's run time.
- **There IS a CI test gate**, and it is the one safety net in the pipeline: the `test` job runs `npm ci` + Playwright, and `deploy` declares `needs: test`, so a red suite blocks the deploy entirely. Treat it accordingly — never loosen a spec or the blanked test credentials to get a deploy through; that is removing the only gate. Coverage is thin (auth only), so a green suite is weak evidence that a *feature* works. It is strong evidence that the app still boots and signs users in.
- **`git reset --hard` on the droplet** means the droplet's checkout must never diverge from what's in git — no manual edits on the box will survive the next deploy, and nothing local to the droplet (other than what `DB_PATH` points at, outside the repo) is preserved.
- **No rollback mechanism beyond reverting and re-pushing.** No blue/green, no health-check gate before traffic shifts — `systemctl restart` briefly drops the process (the workflow's own `sleep 2; systemctl is-active pokewatch` is the only post-deploy check).
- **SQLite lives on the droplet's filesystem** via `DB_PATH`. Whether that path is actually a persistent mounted volume on this droplet (vs. the app's own ephemeral directory) is a fact about the live host, not the repo — verify with the user rather than assuming either way before saying anything about data durability across redeploys.
- Single Node process, single host, no load balancer, no horizontal scaling — appropriate for current scale, not a gap to close preemptively. Note this is also what makes "two brands, one process" cheap: both front doors are the same `systemctl restart`.
- **Load-bearing config that is NOT in the repo.** The Caddyfile, the TLS certs, the Cloudflare DNS records, the `pokewatch.service` systemd unit and its `WorkingDirectory`, and `/opt/pokewatch` being a git checkout at all — none of it is versioned. `git reset --hard` neither manages nor protects any of it, which means a change that depends on a reverse-proxy or unit-file edit has a step that no diff will show and no rollback will undo. When a change needs one, say so explicitly as a manual droplet step.
- **`packages/` lands on the droplet but does nothing there.** `git reset --hard` pulls `packages/world`'s source down, where it sits inert: no dependencies installed, nothing in the app importing it, and its servers bind loopback regardless. Accepted cost of one repo, not a leak.

## Engineering judgment for this project

This is a solo-maintained app at small scale. Calibrate advice accordingly:

- **Don't propose infrastructure the project hasn't earned**: no migration framework, no microservices, no container orchestration, no router library, no state-management library, no TypeScript, no npm workspaces or monorepo tooling, no second process or vhost per brand, unless the actual change at hand needs it. (Test-gated CI *was* on this list and has since been earned and built — which is the model: something graduates off this list when a real need arrives, not preemptively.) The single-file `server.js` and hand-rolled everything are working choices at this size, not debt by default — see every skill file in this repo's `.claude/skills/` for the pattern of explicitly saying "don't reintroduce X" when a prior architecture was deliberately removed.
- **Do flag real risk plainly**: data loss (schema changes that aren't additive-safe), security (auth bypass, secret leakage to the client bundle, the gaps listed above if a change touches them), silent breakage (an API contract drifting from what's documented — see `poketrace-api-expert`'s "Known drift" section for a live example), and anything that would surprise the user in production with no staging to catch it first.
- **Match effort to blast radius**: a copy tweak in `Portfolio.jsx` doesn't need the same scrutiny as a change to `authenticate`, the DB schema, or `deploy.yml`. Say which kind of change something is when it matters.
- **Prefer the existing pattern over a "better" one** unless asked to refactor: match `server.js`'s inline-route style, the ALTER-and-catch migration pattern, the per-page `.css` file convention, and the commit-message style visible in `git log` (imperative, specific, explains *why* not just *what* — e.g. `6e50975 Fix Base Set missing from WOTC era, add its Shadowless edition variants`).
- **Use `git log`, not memory, for "what changed recently."** This file is a periodically-refreshed snapshot, not a live feed — see "Keeping this current" below.

## Composing with the other skills

This skill is the whole-system view; two others own specific subsystems in more depth and should be deferred to, not duplicated, when the work is actually inside their scope:

- **`catalogue-sync`** — the card/set catalogue as a live PokeTrace proxy, era/logo/date enrichment from pokemontcg.io, the near-duplicate-slug and market-filter gotchas.
- **`poketrace-api-expert`** — PokeTrace's actual API surface, plan-tier gating, rate limiting, the hard-won card/set matching logic, grade-tier string formats.

If a question spans both a subsystem and a cross-cutting concern (e.g. "should we cache catalogue responses in Redis instead of in-memory") — use this skill for the "should we" (infra/ops judgment) and the relevant subsystem skill for the "how does the current thing work" grounding.

## Keeping this current

This file is a snapshot, taken at commit `b09b93e`, not a live view.

**Locations are `grep` recipes, not line numbers — keep it that way.** This file previously cited `authenticate` at `server.js:446` and the schema block at `server.js:351`. Eleven commits later both were wrong by ~180 lines, pointing at unrelated comments, while the rest of the file asserted a security posture that had been fixed in the meantime. Line numbers in a 1.7k-line single-file backend rot on essentially every commit, and they rot *silently* — nothing fails, the reader is just confidently misdirected. A `grep -n` recipe is self-correcting and costs one command. `catalogue-sync` and `poketrace-api-expert` have always cited route paths and function names instead, and neither has drifted. Follow them.

Two different staleness risks, handle them differently:

- **Facts that drift silently** (dependency versions, table columns, route list, deploy steps) — before relying on a specific detail here for something consequential, spot-check it against the current file (`grep`, `git show HEAD:server.js`, etc.) rather than trusting this snapshot at face value, the same way `poketrace-api-expert` says to re-fetch PokeTrace's OpenAPI spec if something here looks stale.
- **Claims about what is *missing*** are the dangerous class, and deserve more suspicion than claims about what exists. "There is no rate limiting" ages into a lie that makes an agent add a second rate limiter or misjudge an exposure; "there is a rate limiter on auth" merely ages into being incomplete. When you write a gap into this file, write what would close it, so the next reader can check in one grep whether it already has been.
- **Architecture-level changes** (new external dependency, new table, a migration framework actually gets adopted, the deploy target changes, a major convention shifts) — when a change you're making *causes* one of these, update this file in the same change, not as follow-up cleanup. That's what makes this skill stay a CTO's understanding instead of a one-time snapshot: `git log --oneline b09b93e..HEAD` shows everything since, but this file should reflect the *current shape*, not require re-deriving it from history each time.
