# Worked example — what a report looks like in steady state

> **Every value below is illustrative.** This is a specimen showing the *shape*
> of a mature report — goals set, tenets being acted on, a real debate. It is
> dated in the future and lives in the skill directory, not `business/daily/`,
> so it can never be read as a filed report. **Do not copy its numbers.** Copy
> its structure, its citation density, and its willingness to say "no change".
>
> Two sections are the ones worth studying: **Design**, which is mostly "no
> change" and is a *correct* section — and **Hotly debated topics**, which only
> the assembler writes.

---

# Company daily report — 2026-10-14

**Report #23.** Anchor: `business/daily/2026-10-11.md` (3 days — the 12th and
13th were not run). Window for all git evidence: `--since="2026-10-11"`.

**Contributing:** engineering, product, marketing, design, research.
`cfo` joins when the first real order lands; `vp-support` at the first customer
message. Neither trigger has fired.

**Company goals** (`business/goals.md`, human-directed, outrank everything):
storefront taking real orders by 2026-11-30 · restore-tested backup by 2026-10-31.

---

## Engineering — 2026-10-14

### 1. Goals and tenet coverage

**Company goals this domain moves:**

- *Restore-tested backup by 2026-10-31* — **now 1 drill completed, target 1
  monthly.** Source: `business/engineering/drills/2026-10-13-restore.md`.
  First drill ever run. Unblocks the `min(D,R,S)+2` cap described in T1.

**Agent-developed goals** (mine; scoped to my own repetitive work):

- **Cut daily-report assembly from 5 agent runs to 3 on quiet days**
  - Serves: `T3`
  - Baseline: 5 runs/day, ~240k tokens (measured 2026-10-04, 7-day mean)
  - Target: ≤3 runs on any day where 3+ domains filed "no change"
  - Measured from: `ls business/*/daily/ | wc -l` per date
  - Current: 5 (unchanged) · Status: active
- **Every new `.env` read reaches `.env.example` in the same commit**
  - Serves: `E3`
  - Baseline: 2 of 5 historical env vars were added without it
  - Target: 100%, checked at each `release-guard` pass
  - Measured from: `git log -S'process.env.' --oneline` vs `.env.example` diffs
  - Current: 3/3 since goal set · Status: active
- **PROPOSED — needs a human:** adopt `better-sqlite3`'s backup API for the
  drill instead of `cp`. New dependency surface on the data path, so it stays a
  proposal regardless of how well it tested.

**Tenet coverage:**

- **Stale: `E2`** (weekly capability scan) — `Last acted: 2026-10-02`, 12 days
  ago. Not scanned this window; carried from the last two reports. This is the
  second consecutive report naming it, which is itself the signal.
- **Uncovered: none.** T1, T3, T4, T5, E1, E3 each have a goal or a drill.

### 2. Progress since the last report

- Restore drill count — was 0, now 1 — `business/engineering/drills/2026-10-13-restore.md`
- `.env.example` coverage — was 2/2, now 3/3 — commit `c41a9e2`
- Report assembly cost — unchanged at 5 runs — `ls business/*/daily/2026-10-13.md`
- Deploy failures — `not yet measurable`; the only post-deploy signal in the repo
  is `systemctl is-active pokewatch` in `deploy.yml`, which nothing records.

### 3. Highlights

- **First restore drill ever completed** (`c41a9e2`, 2026-10-13). Restored a
  copy of `pokewatch.db` into a scratch path and verified row counts matched
  across all ten tables. Took 4 minutes. T1 is no longer `Last acted: never`.
- **`release-guard` caught a `NOT NULL` column with no default** before push
  (`8b2d017`, reverted in `f90ac33`). Exactly the failure mode it exists for:
  `CREATE TABLE IF NOT EXISTS` would not have re-run on the droplet.

### 4. Headwinds / blockers

- **`E2` has not been scanned in 12 days.** Not blocked on anything external —
  it loses to whatever else is in the window, every time. Clears by scheduling
  it rather than intending it, which is a proposal in section 5.
- **Blocked on a human:** the Stripe MCP server is still unauthorized, so
  nothing can reconcile against Stripe. Needs an interactive session.
- **Looming, not blocking:** the second brand hostname needs DNS and a Caddyfile
  edit, neither in the repo, and turns `cors({ origin: APP_BASE_URL })` into a
  list — a security-control change that no diff will show.

### 5. Learnings

- The restore drill took 4 minutes, not the half-day I had implicitly priced it
  at when deferring it three reports running. **Behavioural change:** measure the
  cost of a deferred T1 task before deferring it a second time.
- **Capability scan (`T2`/`E2`): not run this window.** No finding to report —
  recorded as an absence, not dressed up as a quiet result.

### 6. Hotly debated topics

`CONTESTED: whether the weekly E2 scan should be a scheduled job.`
My position: it should. Twelve days of it losing to other work is evidence the
cadence does not survive contact with a busy window.
Who may disagree: `cpo`, on the grounds that a scheduled scan spends tokens on
quiet weeks whether or not there is anything to find.
What would settle it: the hit rate of the last six scans. I have not computed it.

### 7. Skill and agent updates

**Automated** (`.claude/`-touching commits this window):

- `a17c3d0` — added the `PROPOSED FOR COMPANY GOALS` marker to
  `.claude/agents/cto.md`. Changes what I may act on unilaterally; adopted.
- `d02f8e1` — `daily-report` skill: heading levels fixed at `##`/`###`.

**Proposed:** promote the `E2` scan to a scheduled job rather than a cadence
line in `tenets.md` — see the CONTESTED flag above. Blocked on the hit-rate
number, which I should compute before arguing for it.

---

## Design — 2026-10-14

> *This is the section worth studying. Four of its seven parts are "no change",
> and it is a complete, correct section. Nothing happened in this domain; the
> report says so in the fewest words that remain accurate.*

### 1. Goals and tenet coverage

**Company goals this domain moves:** none this period.

**Agent-developed goals:**

- **Seed `principles.md` from shipped tokens rather than inventing it**
  - Serves: `D1`
  - Baseline: 0 of 7 live custom properties documented (measured 2026-09-20)
  - Target: all 7, by 2026-10-31
  - Measured from: `grep -c '^\s*--' business/design/principles.md`
  - Current: 7/7 · **Status: done 2026-10-08**

**Tenet coverage:**

- **Stale: `D2`** (monthly tooling scan) — `Last acted: 2026-09-14`, 30 days ago.
  Due now, not yet run.
- **Uncovered: none.**

### 2. Progress since the last report

- Documented tokens — unchanged at 7/7 (goal completed 2026-10-08)
- No other metric in this domain moved.

### 3. Highlights

None this period. No CSS or art files changed in the window — verified with
`git show --stat` on all four commits, not inferred from their subject lines.

### 4. Headwinds / blockers

None blocking. `D2` is due and unrun, which is a scheduling fact rather than an
obstacle — nothing external is in the way.

### 5. Learnings

None this period.

### 6. Hotly debated topics

None this period — no `CONTESTED:` flags from this domain.

### 7. Skill and agent updates

**Automated:** none of this window's `.claude/` commits touched
`.claude/agents/vp-design.md` or `.claude/agents/design-review.md` — checked with
`git log --oneline -- <both paths>`, empty.

**Proposed:** none.

---

> *Product, marketing and research sections would follow in the same shape.
> Omitted here to keep the specimen readable.*

---

## Hotly debated topics (assembled)

Written by the assembler from flagged `CONTESTED:` items and contradictions
between sections. Contributors do not author this section.

### 1. Should the `E2` capability scan become a scheduled job?

**Raised by:** `cto` (CONTESTED, engineering §6). **Counter-position filed by**
`cpo` (product §5), so this one has two genuine sides.

- **`cto`:** yes. `E2` is `Last acted: 2026-10-02` and has now been named stale
  in two consecutive reports; a cadence that loses to every busy window is not
  a cadence.
- **`cpo`:** no. A scheduled scan spends tokens on quiet weeks regardless of
  whether anything shipped worth finding, and T2's own bar says most scans
  should conclude "nothing worth adopting."
- **What would settle it:** the hit rate of the last six scans — how many
  produced an adoption with a demonstrated win. Neither party computed it.
  **Both agreed it is the deciding number**, which makes this cheap to close.

### 2. Two domains report `D2`/`E2` stale in the same window

Not flagged by either party; surfaced by the assembler reading across sections.

Both scanning tenets are now overdue at once, which points at the mechanism
rather than at either domain — scanning is what gets dropped first under load,
in every domain, which is the exact failure T2 was written to prevent. Worth a
human deciding whether the cadences are wrong or the priority is.

---

## Blocked on a human

- **Stripe MCP authorization** — needs an interactive session; nothing can
  reconcile against Stripe until then.
- **Second brand hostname** — DNS and Caddyfile, neither in the repo.
- **`E2` scan cadence** — decide the scheduled-job question above, or accept
  that scanning yields under load and reduce the cadence to match reality.
