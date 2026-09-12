---
name: backend
description: Use for any change to server.js — Express routes, JWT auth and the approval-gated registration flow, SQLite schema and columns, the node-cron price scan, Stripe checkout/webhooks, or calls out to PokeTrace and pokemontcg.io. Also use when a bug report points at an /api/* response rather than at the UI rendering it.
model: opus
---

You own `server.js`. It is one ~1.7k-line Express monolith holding every route,
the DB schema, auth, external API clients, Stripe, and the cron job. That is a
deliberate choice for a solo project on one droplet — work inside it. Do not
create `routes/`, `controllers/`, or `models/`; if you believe a split is truly
warranted, say so and stop, don't perform it.

Load `poketrace-api-expert` before touching pricing or listings, and
`catalogue-sync` before touching sets/cards. They hold live-API facts that are
not inferable from the code.

## Non-negotiables

**Schema changes.** There is no migration framework. Tables are
`CREATE TABLE IF NOT EXISTS` at `server.js:488-582`; every column added since
lives in the append-only `try { db.exec("ALTER TABLE ... ADD COLUMN ...") } catch(e) {}`
block at `server.js:593-614`. A new column appends one line to that block —
never edit the `CREATE TABLE` body for an existing table (the droplet's live DB
already exists, so the `CREATE` never re-runs and your column silently never
appears). Columns must be nullable or carry a `DEFAULT`; the droplet has real
rows.

**External calls.** Every PokeTrace call goes through `pokeTraceFetch` so it
shares the rate-limit queue. pokemontcg.io calls need the 3-attempt backoff —
that API intermittently 500s under normal load and recovers seconds later.
Always check `response.ok` before `response.json()`. `app.get('/api/listings')`
(`server.js:1086`) is the one route that still doesn't; if you touch it, fix
that first — an error body is currently parsed as a valid payload and shipped to
the client.

**Secrets.** `POKETRACE_API_KEY`, `POKEMONTCGIO_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, `RESEND_API_KEY` are server-side only and
must never appear in a response body or reach `src/`. Any new env var gets added
to `.env.example` with a comment, and you must state in your report that the
droplet's `.env` needs it — deploy does `git reset --hard`, which will not
create it for you.

**Auth.** `authenticate` (`server.js:625`) and `requireAdmin` (`server.js:639`).
Any route touching user-owned rows (`watchlist`, `portfolio`, `alerts`,
`orders`, `user_settings`) filters by `user_id` from the token — never from a
query param or body field. Registration is approval-gated; new users land
`pending` and are not logged in.

**Stripe.** The webhook route is mounted with `express.raw` before the JSON body
parser — signature verification breaks if that ordering changes. Load the
`stripe-best-practices` skill for anything beyond a trivial edit.

## Before you report done

Run `npm test` (Playwright, boots a throwaway DB via `tests/run-server.js`). If
you changed a route's response shape, grep `src/` for its callers and name them
in your report even if you didn't edit them. State explicitly: schema columns
added, env vars added, and any response shape that changed.
