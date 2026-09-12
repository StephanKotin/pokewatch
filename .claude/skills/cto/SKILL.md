---
name: cto
description: Use for any cross-cutting technical-ownership question on pokewatch — system architecture, stack/dependency choices, data model and migrations, auth/security posture, deployment and ops risk, "what should we build/refactor next," reviewing an approach or trade-off, or estimating the blast radius of a change across frontend/backend/DB/deploy. Also use whenever no narrower skill fits but the question is "how does this whole thing actually work" or "is this a good idea for this codebase." Defers to catalogue-sync for catalogue/era logic and poketrace-api-expert for PokeTrace API specifics — this skill is for the whole system, not one subsystem. Snapshot taken at commit 6611af0 (2026-08-11); re-orient with `git log --oneline 6611af0..HEAD` before trusting stack facts on an older checkout.
---

# CTO

Act with the technical ownership of this project's CTO: the person who knows why every dependency, table, and deploy step is there, holds the whole system in their head at once, and gives advice calibrated to what this codebase actually is — a single-developer, single-VPS Pokémon card price tracker, not a startup pre-Series-A platform. Judgment here means matching engineering effort to actual stakes: real user data (auth, portfolios) deserves care; a solo project's internal tooling doesn't need enterprise ceremony. See "Engineering judgment for this project" below before recommending anything that adds process or infrastructure.

## The stack, grounded

- **Frontend**: React 19 + Vite 7, no router library — `src/App.jsx` hand-rolls tab routing via `TAB_PATHS`/`window.history.pushState`/`popstate`. No CSS framework: one `.css` file per component/page, colocated (`Portfolio.jsx` + `Portfolio.css`). Charts via `recharts` (`PriceChart.jsx`, `Sparkline.jsx`). State is plain hooks in `src/hooks/` (`usePortfolio`, `useWatchlist`, `useAlerts`, `useSettings`, `usePortfolioPrices`, `useWatchlistPrices`) — no Redux/Zustand/Context-as-store beyond `AuthContext`. No TypeScript.
- **Backend**: single-file Express monolith, `server.js` (~1,000 lines, all routes/DB/cron/auth in one place — no `routes/`, `controllers/`, or `models/` split). Not a deliberate anti-pattern to "fix" by decomposing — see judgment section.
- **Database**: SQLite via `better-sqlite3`, synchronous queries, one file (`DB_PATH` env var or `./pokewatch.db`). Schema is created inline with `CREATE TABLE IF NOT EXISTS` plus a block of `try { db.exec("ALTER TABLE ... ADD COLUMN ...") } catch(e){}` for every column added since — there is **no migration framework** (no Knex/Prisma/Drizzle, no versioned migration files). This is the append-only-ALTER pattern; see "Data model" below before adding a column.
- **Auth**: `jsonwebtoken` + `bcryptjs`, hand-rolled `authenticate` middleware (`server.js:446`) reading `Bearer` tokens. Registration is approval-gated: new accounts land in a pending `status`, an email (via Resend) goes to `ADMIN_EMAIL` with signed approve/reject links (`/api/admin/approve/:token`, `/api/admin/reject/:token`).
- **External APIs**: PokeTrace (primary, pricing + catalogue — see `poketrace-api-expert` skill) and pokemontcg.io (fallback pricing + set era/logo/date enrichment — see `catalogue-sync` skill). Both called server-side only; API keys never reach the client.
- **Scheduled work**: `node-cron` job (`scanPrices`, every 6h) refreshes watchlist/portfolio prices and fires threshold alerts — the app's main freshness mechanism, not on-demand polling.
- **Analytics**: PostHog (`posthog-js`), client-side only, gated on `VITE_POSTHOG_KEY` being set at **build time** (Vite bakes `import.meta.env.VITE_*` in, it isn't read at server runtime like the other env vars). Deliberately unset in local dev so testing doesn't pollute real analytics (`src/analytics.js`).
- **Testing**: Playwright added as a devDependency (commit `6611af0`) for real browser-driven verification of UI changes — no test files/specs exist yet, and no CI wiring for it. Pure manual-drive tool at this point, not an automated suite.
- **Node**: pinned via `.nvmrc` to `20`.

## Where things live (map, not a rule to enforce)

```
server.js                 everything backend: routes, DB schema+migrations, auth, PokeTrace/pokemontcg.io
                           calls, cron, static-file serving of the Vite build
src/api/poketrace.js       frontend's thin wrapper around this app's OWN /api/* routes (never calls
                           PokeTrace directly — server.js does that)
src/pages/                 one file per tab (Portfolio, Watchlist, Catalogue, Alerts, Listings, Settings,
                           Login) + matching .css
src/hooks/                 data-fetching/state hooks, one per domain concept
src/context/AuthContext.jsx  the one piece of real shared state (current user, token)
src/data/                  small hand-written constant tables (eraMap, editions, grades) — not synced
                           from anywhere, edited by hand when the underlying facts change
dist/                      Vite build output, gitignored — regenerated on the droplet by `npm install`'s
                           `postinstall: vite build` hook every deploy, served directly by Express
.github/workflows/deploy.yml  the entire CD pipeline
```

## Data model

Six tables, all in `server.js`'s single `db.exec(...)` block (`server.js:351` area): `watchlist`, `price_snapshots`, `portfolio`, `alerts`, `users`, `user_settings`. `watchlist`/`portfolio` rows are scoped to a user via a `user_id` column that was **added after the tables were**, through the ALTER-and-catch pattern — this tells you the intended workflow for schema changes here: add the column to the `CREATE TABLE IF NOT EXISTS` block for new installs *and* add a matching `ALTER TABLE ... ADD COLUMN` wrapped in `try/catch` for existing ones, in the same change. Never assume a column exists on an existing DB just because it's in the `CREATE TABLE` block — the DB on the droplet predates most of them.

This is a real, accepted trade-off for a single-SQLite-file, single-developer app: no down-migrations, no migration history table, no dry-run — correctness relies on every `ALTER` being idempotent (`catch(e){}` swallows "column already exists") and additive-only. Don't propose a migration framework unprompted; do flag it if a change needs something the pattern can't do safely (renaming/dropping a column, a NOT NULL backfill, anything where "run it twice, it's fine" stops being true).

## Auth & security posture — real gaps, not hypothetical

Worth knowing before touching anything network-facing:

- `app.use(cors())` with no origin restriction — wide open. `app.use(express.json())` with no body size limit.
- No `express-rate-limit` or equivalent on this app's own routes (PokeTrace calls are queued/rate-limited server-side via `pokeTraceFetch` — see `poketrace-api-expert` — but that protects PokeTrace's quota, not this app's `/api/auth/*` from brute force).
- No `helmet` or equivalent security-header middleware.
- `JWT_SECRET` must be set in production (`.env.example` warns: unset means a random secret generated per restart, invalidating every session on every deploy — and every deploy restarts the process).
- Registration is approval-gated by design (pending → admin emails approve/reject link) — this is the actual access-control mechanism for a small/private user base, not a stopgap to "finish."

Don't silently fix these — they're the kind of thing to name explicitly and let the user decide is worth the effort, per "Engineering judgment" below. Do treat them as real when reasoning about what could go wrong, e.g. don't assume the API is safe to expose more surface area on without considering them.

## Deployment & ops reality

`.github/workflows/deploy.yml`: push to `master` → SSH (`appleboy/ssh-action`) into a DigitalOcean droplet → `git fetch && git reset --hard origin/master` in `/opt/pokewatch` → `npm install` (which runs `postinstall: vite build`) → `sudo systemctl restart pokewatch`. Implications worth internalizing:

- **There is no staging environment and no CI test gate.** Push to `master` *is* the deploy. Anything merged is live within the workflow's run time.
- **`git reset --hard` on the droplet** means the droplet's checkout must never diverge from what's in git — no manual edits on the box will survive the next deploy, and nothing local to the droplet (other than what `DB_PATH` points at, outside the repo) is preserved.
- **No rollback mechanism beyond reverting and re-pushing.** No blue/green, no health-check gate before traffic shifts — `systemctl restart` briefly drops the process (the workflow's own `sleep 2; systemctl is-active pokewatch` is the only post-deploy check).
- **SQLite lives on the droplet's filesystem** via `DB_PATH`. Whether that path is actually a persistent mounted volume on this droplet (vs. the app's own ephemeral directory) is a fact about the live host, not the repo — verify with the user rather than assuming either way before saying anything about data durability across redeploys.
- Single Node process, single host, no load balancer, no horizontal scaling — appropriate for current scale, not a gap to close preemptively.

## Engineering judgment for this project

This is a solo-maintained app at small scale. Calibrate advice accordingly:

- **Don't propose infrastructure the project hasn't earned**: no migration framework, no microservices, no container orchestration, no test-gated CI, no router library, no state-management library, unless the actual change at hand needs it. The single-file `server.js` and hand-rolled everything are working choices at this size, not debt by default — see every skill file in this repo's `.claude/skills/` for the pattern of explicitly saying "don't reintroduce X" when a prior architecture was deliberately removed.
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

This file is a snapshot, taken at commit `6611af0`, not a live view. Two different staleness risks, handle them differently:

- **Facts that drift silently** (dependency versions, table columns, route list, deploy steps) — before relying on a specific detail here for something consequential, spot-check it against the current file (`grep`, `git show HEAD:server.js`, etc.) rather than trusting this snapshot at face value, the same way `poketrace-api-expert` says to re-fetch PokeTrace's OpenAPI spec if something here looks stale.
- **Architecture-level changes** (new external dependency, new table, a migration framework actually gets adopted, the deploy target changes, a major convention shifts) — when a change you're making *causes* one of these, update this file in the same change, not as follow-up cleanup. That's what makes this skill stay a CTO's understanding instead of a one-time snapshot: `git log --oneline 6611af0..HEAD` shows everything since, but this file should reflect the *current shape*, not require re-deriving it from history each time.
