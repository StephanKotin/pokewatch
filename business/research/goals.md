# Agent-developed goals — research

**Owner:** `vp-research` — this agent writes and maintains this file itself.
**Subordinate to** [`business/goals.md`](../goals.md), the human-directed
company goals, which win whenever the two compete.
**Derived from** [`business/tenets.md`](../tenets.md).

**STATUS: unset** — no goals derived yet.

## What belongs here, and what does not

Only goals about **making this agent's own repetitive work better**: faster,
cheaper, more reliable, less manual, less error-prone. That is the whole scope
of the autonomy, and it is deliberately narrow — an agent improving how it
drafts its daily section must never outrank the company deciding what to build.

**In scope:** replacing a manual step with a script · cutting the cost or turn
count of a recurring task · removing a class of mistake this agent keeps making ·
adopting a capability that measurably improves a task done here · writing down
something expensive that was learned.

**Out of scope — write it as `PROPOSED FOR COMPANY GOALS` and do not act:**
anything that changes what gets built, what is charged, or what a customer sees.
Also anything that spends money, changes the deploy pipeline, alters an auth
path, touches user data, or adopts a new dependency or model — those stay
proposals a human accepts, however well-evidenced.

## Rules

- **Every goal cites its tenet.** Shared: `T1`–`T5`. This domain: `R1`,
  `R2`, … A goal serving no tenet should not exist.
- **Every goal is SMART** and names **where its current value is measured from**.
  A metric with no source cannot be reported on, which is how a file like this
  quietly stops being used.
- **Lower-numbered tenets win**, and `T1` wins over everything. If a goal yields,
  say so in the goal rather than leaving the conflict unstated.
- **Baseline before target.** A goal to improve a recurring task states what that
  task costs *today*, measured — otherwise "better" is unfalsifiable.

## Format

```
### Short term (this quarter)

- **<specific outcome>**
  - Serves: <tenet id>
  - Baseline: <what the task costs today> (measured <date>)
  - Target: <number> by <date>
  - Measured from: <exact query, command, file, or "not yet measurable">
  - Current: <value> (as of <date>)
  - Status: active | PROPOSED FOR COMPANY GOALS | PROPOSED — needs a human | done <date>

### Long term (12 months)

- **<specific outcome>**
  - Serves: <tenet id>
  - Baseline / Target / Measured from / Current / Status: <as above>
```

## Tenet coverage

The daily report checks this file against `tenets.md` both ways: a tenet with no
goal is being ignored, and a tenet past its cadence with nothing in its
`Last acted` line is **stale** and gets named in the report.
