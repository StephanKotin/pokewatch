# pokewatch

Pokémon card price tracker and watchlist. Single developer, single DigitalOcean
droplet, real user data (accounts, portfolios, Stripe orders). Match engineering
effort to those stakes — this is not a pre-Series-A platform, and it is also not
a toy.

## Orientation in 30 seconds

- **Backend**: one file. `server.js` (~1.7k lines) holds every route, the DB
  schema, auth, the PokeTrace/pokemontcg.io calls, Stripe, and the cron job.
  There is no `routes/`, `controllers/`, or `models/` split. This is deliberate;
  do not decompose it as a drive-by.
- **Frontend**: React 19 + Vite 7, no TypeScript, no router library (`src/App.jsx`
  hand-rolls tabs via `TAB_PATHS` + `history.pushState`), no CSS framework (one
  colocated `.css` per component/page). State is plain hooks in `src/hooks/`;
  `AuthContext` is the only shared store.
- **DB**: SQLite via `better-sqlite3`, synchronous. Schema is `CREATE TABLE IF NOT
  EXISTS` (`server.js:488-582`) plus an append-only block of
  `try { ALTER TABLE ... ADD COLUMN } catch {}` (`server.js:593-614`). **No
  migration framework.** New columns append to that block; nothing else.
- **Deploy**: push to `master` → CI runs Playwright → SSH to the droplet →
  `git reset --hard origin/master` → `npm install` (whose `postinstall` runs
  `vite build`) → `systemctl restart pokewatch`. See `.github/workflows/deploy.yml`.
- **Secrets**: `.env` on the droplet, gitignored, survives `reset --hard`. Every
  external API key is server-side only. `VITE_*` vars are the exception — Vite
  bakes them in at **build** time, so they are public by definition.

## Knowledge lives in skills, not in prompts

Three hand-written skills carry the expensive, hard-won knowledge. Load them
rather than re-deriving it:

| Skill | Owns |
|---|---|
| `cto` | Whole-system architecture, stack/dependency calls, blast radius, "is this a good idea here" |
| `poketrace-api-expert` | PokeTrace API: `/api/prices`, `/api/price-history`, `/api/listings`, `price_snapshots`, plan-tier gating |
| `catalogue-sync` | `/api/sets`, `/api/sets/:slug/cards`, `/api/cards/search`, `Catalogue.jsx`, `eraMap.js`, `editions.js` |

Stripe work is covered by the eight vendored `stripe-*` / `connect-*` skills,
committed alongside them in `.claude/skills/` and pinned in `skills-lock.json`.

## Agents

Delegation roster and rules: [.claude/agents/README.md](.claude/agents/README.md).

## House rules

- **Never add a bare `fetch` to an external API.** pokemontcg.io intermittently
  500s under normal load; PokeTrace calls go through `pokeTraceFetch`'s shared
  queue. Always check `response.ok` before `response.json()`.
- **Never widen a `.env` value into the client bundle.** If it isn't already
  `VITE_`-prefixed, it is a secret.
- **Verify UI changes in the real app**, not just by reading the diff. See the
  `verifier` agent and the `run` skill.
- Prefer editing `server.js` in place over introducing a new backend file. If a
  split is genuinely warranted, raise it — don't perform it silently.
