---
name: architecture-scorecard
description: Use when completing or proposing a major change to this repo — a new route, table, column, dependency, env var, deploy step, auth path, package, or anything touching money, user data, or the deploy pipeline. Produces a per-dimension architecture-impact report with a defended delta and a falsifier, so trade-offs are visible before they are paid for. Also use when asked to rate the architecture, score a change, weigh a trade-off, or check whether a past impact hypothesis held. Not for typo fixes, copy tweaks, or single-file edits that add no concept — those score zero and should say so in one line, not a report.
---

# Architecture scorecard

A change is not "good" or "bad" in one number. It buys something and it spends
something, and the job here is to say which, in a form that can later be shown
wrong. This produces a **hypothesis**, not a grade.

The output is for a solo developer deciding whether a trade is worth it on a live
app with real accounts, real portfolios and real Stripe orders. Be useful, be
short, and be honest about costs — a report with no negative entries is usually a
report that wasn't trying.

## When this fires

**Required** for any change that does one of:

- adds or alters a route, table, column, index, or env var
- adds a dependency, a top-level file, or anything under `packages/`
- touches auth, `optionalAuth`/`authenticate`, `linkGuestOrders`, Stripe, the
  webhook, or the cron job
- changes `.github/workflows/deploy.yml`, `package.json` scripts, or anything
  the droplet runs
- moves data between the two products, or widens a seam between them

**Not required** for: copy and CSS tweaks, a bug fix inside one existing
function that adds no concept, comments, or test-only additions to an already
covered path. For these, say `Architecture impact: none` and move on. Resist the
urge to file a report to look thorough — ceremony on trivial changes is how a
rubric like this stops being read.

## The seven dimensions

Each is anchored to a way *this* project actually breaks, not a generic virtue.

**D — Data safety.** Can this lose, corrupt, or silently fail to persist real
data? Check: new columns are additive, nullable-or-defaulted, and appended to the
`try { ALTER TABLE } catch {}` block — never added to a `CREATE TABLE` body for a
table that already exists on the droplet (it never re-runs, so the column
silently never appears). Check anything that resolves a path from `__dirname`
(`DB_PATH` is the trap: move the file and the app cheerfully creates an empty DB).
Check whether a half-failed deploy can leave rows in an in-between state.

**R — Recoverability.** If this is wrong in production, how fast and how safely
does it come back? There is no staging and no rollback but revert-and-repush. The
CI gate (`deploy: needs: test`) is the only thing standing between a red suite
and a live deploy. Penalise anything that needs a manual droplet step, and
anything that adds to the pile of load-bearing config not in the repo — the
Caddyfile, certs, DNS records and the systemd unit are all outside `git reset
--hard`'s reach today.

**C — Coupling.** Does this widen a seam? The two products share exactly two live
couplings: `users.role` and `orders.user_id`. Ten tables, one declared foreign
key. `src/api/*` calls only this app's own routes, never an external API. Nothing
in `packages/` is imported by root code, and **a `workspaces` key in the root
`package.json` is the tripwire** — if a change wants one, it has stopped being a
satellite. A third cross-product coupling is not forbidden, but it is never free
and must be named.

**V — Verification.** Can the new behaviour actually fail a test? The bar is not
"a test exists" — it is **"I ran it and watched it fail without the fix."** 7
specs cover a 1.7k-line backend, and the money path (`/api/checkout`,
`fulfillOrder`) is not driven against a real Stripe sandbox: `orders.spec.js`
seeds the row the webhook would have written. Any change to payments that leaves
that true is capped at 0 here, however many assertions it adds.

**S — Security & privacy.** `user_id` comes from the verified token, never a body
or query param. `/api/checkout` must never answer 401 — `handle401` deletes the
token and reloads the page, so a 401 there signs a customer out mid-payment.
Secrets stay server-side; `VITE_`-prefixed means public by definition. The
webhook is signature-verified and `fulfillOrder` is idempotent on
`status === 'paid'`. Known gaps, so don't re-report them as new: no CSP, rate
limiting only on `/api/auth/*`, and `authenticate` not re-checking `users.status`
(a rejected account works for the rest of its 7-day token). Also counts here:
PII or infrastructure identifiers landing in committed files.

**T — Truthfulness.** After this change, do `CLAUDE.md`, the four hand-written
skills and the four agent definitions still describe reality? This dimension
decays *by default* and silently — nothing fails, the next reader is just
confidently misdirected. Two rules learned the hard way: cite locations as
`grep -n` recipes, not line numbers (`server.js:446` was 180 lines off and
pointing at an unrelated comment); and treat claims about what the app does
**not** do as the dangerous class, because they age into licence to rebuild
something that already exists.

**X — Restraint.** Was the complexity earned by the change at hand? The standing
refusals are: no migration framework, no router library, no state library, no
TypeScript, no npm workspaces or monorepo tooling, no second process or vhost per
brand, no splitting `server.js`. None of these is permanent — test-gated CI was
on this list until a real need arrived — but graduating one is a decision to
argue for, not to perform. A new dependency, file, concept or env var each needs
a reason tied to *this* change.

## Current baseline

Snapshot at commit `40d20b2` (2026-09-11). Re-derive anything load-bearing before
trusting it; see "Keeping this current".

| | Dimension | Now | Why it sits there |
|---|---|---|---|
| **D** | Data safety | **3** | Real accounts, portfolios and paid orders in one SQLite file on one droplet. Additive-ALTER discipline is sound and documented. **No restore-tested backup has been confirmed** — the largest unquantified risk in the project. |
| **R** | Recoverability | **3** | CI gate is real. No staging, no rollback but revert-and-repush, and the Caddyfile, certs, DNS and systemd unit live only on the box. |
| **C** | Coupling | **6** | Ten tables, one declared FK, two deliberate cross-product couplings, a documented satellite rule with a tripwire. |
| **V** | Verification | **3** | 7 specs. Auth and order-linking covered for real; the money path is seeded, not driven. Storefront UI untested. |
| **S** | Security | **5** | helmet, single-origin CORS, 100kb body cap, auth rate limiting, correct `trust proxy`, verified idempotent webhook. No CSP, limiter only on auth, status not re-checked. |
| **T** | Truthfulness | **6** | Just corrected end to end and converted to grep recipes. Decays by default. |
| **X** | Restraint | **6** | Deliberate simplicity with written reasons and an explicit refusal list. |

### The composite, and why it is not an average

**Composite: 5 / 7.**

Averaging would be gameable — you could buy a high score with documentation and
tests while the app could still lose its data. So:

```
composite ≤ min(D, R, S) + 2,  capped at 7
```

`min(3, 3, 5) + 2 = 5`. The composite is a judgment call that may sit *below* the
cap but never above it. Practically: **this project cannot exceed 5 until data
safety and recoverability improve**, no matter how good the code gets. Restore-
testing a backup is worth more than any refactor currently available.

## How to report

Only dimensions that move. No row for a zero unless the reader would expect
movement and be wrong.

```
Architecture impact — link store orders to collector accounts
  C  coupling      6 → 5  (−1)  second cross-product coupling: orders.user_id
  V  verification  3 → 3  ( 0)  5 new specs, but the money path is still seeded, not driven
  S  security      5 → 5  ( 0)  401-on-payment invariant now tested, pre-existing gaps unchanged
  Composite 5 → 5   (cap: min(D,R,S)+2 = 5)

Trade-off: buys the feature and a tested invariant; spends the clean two-coupling
seam. Worth it — the coupling is the feature. Cheapest buy-back is not removing
it but covering /api/checkout against a Stripe sandbox, which lifts V and is the
gate on this whole area.

Falsifier: if a later change needs to read orders from collector code, or the
storefront needs a users join beyond role, the −1 was really −2 and the seam is
eroding rather than being spent once.
```

Then: **one paragraph defending the number you are least sure of.** Not all seven
— the one a skeptical reader would push on.

## Anti-gaming rules

These are the teeth. Without them this becomes self-congratulation with a table.

1. **No Verification credit for a test you have not watched fail.** Write the
   test, break the fix, observe red, restore, observe green. Say you did. If you
   didn't, the delta is 0.
2. **You cannot bank credit for cleaning up your own mess.** Removing a risk you
   introduced earlier in the same session or change is 0, not +1. Fixing
   something that predates the session is fair.
3. **A docs-only change cannot exceed T +2 and must be 0 everywhere else.**
   Writing that a gap exists does not close it.
4. **No falsifier, no delta.** If you cannot name an observation that would show
   the claim wrong, you are asserting a preference. Report 0.
5. **Name every cost before every benefit.** If a report has no negative or zero
   entry, re-read the change looking for what it spent. Most changes spend
   something; a genuinely free win is rare enough to be worth remarking on.
6. **Never report a composite above the cap**, and never move D, R, S upward on
   intention. "We should back up the DB" is not +1; a restore you performed is.
7. **Deltas are −2..+2 integers.** A change that claims ±2 on more than one
   dimension is either a very large change or an overstated one; say which.
8. **Do not optimise the score.** If the highest-scoring option is not the best
   option, say so plainly and recommend the better one. A rubric that overrides
   judgment has failed. Flag it here if that keeps happening — the rubric is
   wrong, not the judgment.

## Calibration: real changes from 2026-09-11

Scored honestly, including the one that cost something.

**Commit `6dde5af` — correct the cto skill, document the zones.** 408 insertions
across 7 files.
`T 4 → 6 (+2)`. Everything else 0. The skill had claimed no helmet, no rate
limiting, no CI gate and no tests — four things that were false, in the direction
that makes an agent re-harden hardened code. *A large diff moving exactly one
dimension is normal.* Size is not impact.

**Commit `485ecc8` — commit the agent layer, rewrite settings.json.**
`S 4 → 5 (+1)` — deleted a pre-approved unattended `ssh … sudo bash -s` root
channel to production, plus PII and a nvm-pinned arbitrary-code wildcard, and
fixed `deny` rules that were cwd-relative and so failed open inside
`packages/world/`. `R 2 → 3 (+1)` — a fresh clone now gets the tooling it was
silently losing. Not claimed: any D movement, because nothing about the database
changed.

**Commit `ebd5120` — split APP_BASE_URL / STORE_BASE_URL.**
`S 5 → 5 (0)`, and this is the interesting zero. It *declined* to introduce a
spoofable input: deriving return URLs from `req.hostname` would have been more
elegant and wrong, because `trust proxy` is a hop count, so `trust(addr, 0)` is
always true and Express honours `X-Forwarded-Host` unconditionally. Avoiding a
regression is not an improvement. `X 6 → 6 (0)` — one env var with a transparent
default is not meaningful complexity. Composite unchanged. **Most good feature
work scores zero across the board, and that is a success.**

**Commit `d48a1d6` — link store orders to collector accounts.** The worked
example above. `C −1`, everything else 0, composite flat. The −1 is the honest
cost of a deliberately chosen feature, and surfacing it is the point.

## Settling up

A hypothesis that is never checked is a decoration. When a report's falsifier
becomes observable, check it and say what happened — especially when the
prediction was wrong, which is the only case that improves calibration.

Two standing ones:

- **`d48a1d6`'s `C −1`**: watch whether the coupling stays a single named link or
  becomes a habit of joining across products.
- **`ebd5120`'s deferred client half**: the two-brand seam exists server-side
  with no second hostname. If that domain never arrives, the env var was
  unearned complexity and `X` should drop by 1.

## Keeping this current

Same discipline as the `cto` skill, for the same reason — this file is a snapshot
and will rot silently.

- **Update the baseline table in the same change that moves a score**, not as
  follow-up. A report claiming `V 3 → 4` must edit the table to say 4.
- **Locations as `grep -n` recipes**, never line numbers.
- **Re-derive a "gap" before reporting it.** The single most damaging thing this
  file can contain is a stale claim that something is missing. Check, don't
  recall.
- If a dimension stops earning its place, or two always move together, collapse
  them. Seven dimensions that get read beat nine that get skipped.
