# Company goals — human-directed

**Owner: a human.** Agents read this file, measure against it, and report on it.
**No agent writes here.**

**STATUS: unset** — no company goals have been set.

These are the goals that say what this business is trying to do. They **take
priority over every agent-developed goal**, and when the two compete for the same
block of time, these win without discussion.

The other class lives in `business/<domain>/goals.md`: goals an agent writes for
itself, scoped strictly to making *its own recurring work* better. Those are
subordinate to these by construction — an agent improving how it drafts a report
must never outrank the company deciding what to build.

## The two classes

| | Human-directed (this file) | Agent-developed (per domain) |
|---|---|---|
| **Written by** | you | the owning agent |
| **Scope** | what the business is trying to achieve | how that agent does its repetitive work |
| **Priority** | always wins | yields |
| **Examples** | first paying order; storefront launched; backup restored | cut report assembly from 5 agents to 3; replace a manual query with a script |

An agent-developed goal that changes **what gets built, what is charged, or what
a customer sees** is out of scope for an agent — it is a proposal for this file,
written into the domain file as `PROPOSED FOR COMPANY GOALS` and not acted on.

## Format

Same shape as the domain files, so they read alike — SMART, with a named source
for the current value.

```
### Short term (this quarter)

- **<specific outcome>**
  - Target: <number> by <date>
  - Measured from: <exact query, command, file, or "not yet measurable">
  - Current: <value> (as of <date>)

### Long term (12 months)

- **<specific outcome>**
  - Target: <number> by <date>
  - Measured from: <...>
  - Current: <value> (as of <date>)
```

## Candidates the first report surfaced

Not goals — just what the agents found with evidence, for you to accept, rewrite
or discard. Delete this section once real goals exist.

- **A restore-tested backup of `pokewatch.db`.** No drill has ever been run, and
  `min(data safety, recoverability, security) + 2` caps the architecture
  composite at 5 until one is. Blocks nothing else; ceilings everything.
- **The first real storefront order.** Measured from
  `sqlite3 pokewatch.db "SELECT COUNT(*) FROM orders"` — currently 0, alongside
  0 products and 1 user.
- **The second brand hostname live.** Needs DNS and a Caddyfile edit, neither in
  the repo, and turns `cors({ origin: APP_BASE_URL })` into a list.
- **Checkout exercised end to end against a Stripe sandbox.** Today the tests
  seed an order row rather than driving `/api/checkout` and `fulfillOrder`, so
  the money path's happy case is unproven. Raised by `cto` in report #1.
- **The droplet-only config written down.** The Caddyfile, TLS certs, Cloudflare
  DNS records and `pokewatch.service` are not in the repo, so `reset --hard`
  will not restore them and no diff will ever show them missing.
