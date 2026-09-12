# pokewatch

Pokémon card price tracker and watchlist. Single developer, single DigitalOcean
droplet, real user data (accounts, portfolios, Stripe orders). Match engineering
effort to those stakes — this is not a pre-Series-A platform, and it is also not
a toy.

## Zones: what this repo actually contains

One repo, two brands served by one process, and satellites that never deploy.
Know which zone you are in before you change anything.

| Zone | What | Deployed? |
|---|---|---|
| repo root | the app: `server.js`, `src/`, `index.html`, `tests/` | **yes** |
| `packages/` | never-deployed satellites. Today: `packages/world` (Agent World) | no |
| `business/` | markdown the non-engineering agents own: roadmap, brand, research, finance | inert |

**Two brands, one process.** The same Node process, the same Vite bundle and the
same SQLite file serve both **PokéWatch** (the collector tool — portfolio,
watchlist, alerts, catalogue, prices) and **tcgoftexas.com** (a storefront for
singles and sealed product). The storefront is a set of tabs in the same
`TAB_PATHS` map in `src/App.jsx`, rendered *above* the login gate via
`PUBLIC_TABS` — so the split between the two products is auth-gate ordering, not
routing. Don't propose a second process or a vhost per brand.

**`packages/` holds only satellites.** Never deployed, never imported by root
code, never npm workspaces: each has its own `package.json`, its own lockfile,
its own `node_modules`. A satellite may *read* the repo (file paths, `.claude/`)
but must never be imported by it. **Adding a `workspaces` key to the root
`package.json` is the tripwire** — if you need one, you've stopped building a
satellite. `packages/world` runs Vite 8 against the root's Vite 7; that only
works because nothing links them.

**`business/` is markdown, and only markdown.** It is "inert" rather than "no"
in the table above because `git reset --hard` does ship it to the droplet — it
just lands as files nothing reads. Two rules keep it that way: **no file in
`src/` or `server.js` may ever import or read from it**, and **nothing goes in
there you would not publish** — no customer names, order IDs, emails, or keys,
since it sits on a box serving public HTTP. See `business/README.md`.

Two things that follow:

- **Don't move the app under `packages/`.** `DB_PATH` defaults to
  `path.join(__dirname, 'pokewatch.db')`. Move `server.js` and `__dirname` moves
  with it — so unless `DB_PATH` is set on the droplet first, the app boots fine,
  creates a brand-new empty DB, and every portfolio silently disappears.
- **"`server.js`" is ambiguous.** There are two: the app's, at the repo root, and
  `packages/world/bridge/server.js`. Say which one you mean.

## Orientation in 30 seconds

- **Backend**: one file. `server.js` (~1.7k lines) holds every route, the DB
  schema, auth, the PokeTrace/pokemontcg.io calls, Stripe, and two cron jobs
  (`grep -n 'cron.schedule' server.js` — the 6-hourly price scan and the weekday
  daily-report email).
  There is no `routes/`, `controllers/`, or `models/` split, and no
  `express.Router()` — every route is `app.*` on one instance. This is
  deliberate; do not decompose it as a drive-by. The storefront's ~11 routes sit
  in three contiguous islands rather than interleaved with the collector's ~19:
  the Stripe client near the top, `fulfillOrder` + the webhook (which **must**
  stay mounted before `express.json()` for raw-body signature verification), and
  the products/checkout/admin routes.
- **Frontend**: React 19 + Vite 7, no TypeScript, no router library (`src/App.jsx`
  hand-rolls tabs via `TAB_PATHS` + `history.pushState`), no CSS framework (one
  colocated `.css` per component/page). State is plain hooks in `src/hooks/`;
  `AuthContext` is the only shared store.
- **DB**: SQLite via `better-sqlite3`, synchronous. Schema is ten
  `CREATE TABLE IF NOT EXISTS` statements in one `db.exec` (`server.js:487-590`)
  plus an append-only block of `try { ALTER TABLE ... ADD COLUMN } catch {}`
  (`server.js:593-622`). **No migration framework.** New columns append to that
  block; nothing else. The two products' tables are cleanly separated —
  collector: `watchlist`, `price_snapshots`, `portfolio`, `alerts`,
  `user_settings`; storefront: `products`, `orders`, `order_items`; shared:
  `users`, `app_cache`. The only declared foreign key in the whole schema is
  `user_settings.user_id → users(id)`, and the only live coupling between the two
  products is `users.role`. Keep that seam clean: don't join a collector table to
  a storefront table without deciding to.
- **Deploy**: push to `master` → CI runs Playwright → SSH to the droplet →
  `git reset --hard origin/master` → `npm install` (whose `postinstall` runs
  `vite build`) → `systemctl restart pokewatch`. See `.github/workflows/deploy.yml`.
  The `deploy` job declares `needs: test`, so a red suite blocks the deploy —
  that gate is the only safety net in the pipeline (no staging, no rollback but
  revert-and-repush). Never loosen a spec or the blanked test credentials to get
  a deploy through. Note what is **not** in the repo and so not protected by
  `reset --hard`: the Caddyfile, the TLS certs, the Cloudflare DNS records, and
  the `pokewatch.service` unit. A change needing one of those has a manual step
  that no diff will show.
- **Secrets**: `.env` on the droplet, gitignored, survives `reset --hard`. Every
  external API key is server-side only. `VITE_*` vars are the exception — Vite
  bakes them in at **build** time, so they are public by definition.

## Knowledge lives in skills, not in prompts

These hand-written skills carry the expensive, hard-won knowledge. Load them
rather than re-deriving it:

| Skill | Owns |
|---|---|
| `cto` | Whole-system architecture, stack/dependency calls, blast radius, "is this a good idea here" |
| `poketrace-api-expert` | PokeTrace API: `/api/prices`, `/api/price-history`, `/api/listings`, `price_snapshots`, plan-tier gating |
| `catalogue-sync` | `/api/sets`, `/api/sets/:slug/cards`, `/api/cards/search`, `Catalogue.jsx`, `eraMap.js`, `editions.js` |
| `agent-world` | `packages/world` — the local agent dispatch console: its bridge, clearance model, transcript redaction, tilemaps and art |
| `architecture-scorecard` | Rating the architecture-quality impact of a change: the seven dimensions, the current baseline, the composite cap, anti-gaming rules |

Stripe work is covered by the eight vendored `stripe-*` / `connect-*` skills,
committed alongside them in `.claude/skills/` and pinned in `skills-lock.json`.

## Agents

Two tiers: seven executives that decide and route (`cto`, `cpo`, `cfo`, `cmo`,
`vp-support`, `vp-design`, `vp-research`), over workers that do the repetitive
half. Only `cto`'s workers — `backend`, `frontend`, `verifier`, `release-guard` —
may touch code; every other executive and worker is fenced to `business/` and to
drafting. `cfo` never moves money, `cmo` never publishes, `vp-support` never
sends.

Five of them — `cto`, `cpo`, `cmo`, `vp-design`, `vp-research` — file a daily
report section into `business/daily/` via the `daily-report` skill. Every claim
in it carries evidence, and "no change" is a correct answer.

They work from `business/tenets.md`, a human-owned constitution of ordered
tenets. Goals come in two classes: `business/goals.md` is human-directed and
always wins; `business/<domain>/goals.md` is written by the owning agent and
scoped strictly to improving its own repetitive work. A tenet past its cadence
with an unmoved `Last acted` date is reported stale — that is how the scanning
tenets avoid quietly rotting.

Org chart, model choices and the seams between roles:
[.claude/agents/README.md](.claude/agents/README.md).

## House rules

- **Never add a bare `fetch` to an external API.** pokemontcg.io intermittently
  500s under normal load; PokeTrace calls go through `pokeTraceFetch`'s shared
  queue. Always check `response.ok` before `response.json()`.
- **Never widen a `.env` value into the client bundle.** If it isn't already
  `VITE_`-prefixed, it is a secret.
- **Never return 401 from a route a shopper can hit.** `src/api/poketrace.js`
  sends the Bearer token on every call, and its `handle401` deletes the token and
  reloads the page. On `/api/checkout` that signs a customer out mid-payment. Use
  middleware that attaches a user when one is present and calls `next()`
  regardless.
- **`user_id` comes from the verified token, never from a body or query param.**
- **Verify UI changes in the real app**, not just by reading the diff. See the
  `verifier` agent and the `run` skill.
- **Report the architecture impact of a major change, and defend it.** A new
  route, table, column, dependency, env var, deploy step, auth path or package —
  or anything touching money, user data or the deploy pipeline — ends with a
  per-dimension delta, a stated trade-off, and a falsifier. Load
  `architecture-scorecard` for the rubric, the current baseline and the
  anti-gaming rules. Two consequences worth knowing before you start, because
  they change what is worth building: the composite is capped at
  `min(data safety, recoverability, security) + 2`, so **no amount of clean code
  raises it past 5 until the database has a restore-tested backup**; and most
  good feature work scores zero across every dimension, which is a success, not
  a failing grade. Trivial changes say `Architecture impact: none` in one line —
  filing a report to look thorough is how the rubric stops being read.
- Prefer editing `server.js` in place over introducing a new backend file. If a
  split is genuinely warranted, raise it — don't perform it silently.
