# Agent architecture

Three layers. Each answers a different question, and they are deliberately not
interchangeable.

```
  CLAUDE.md            what every agent knows before it starts
     │                 (stack, deploy pipeline, house rules)
     ▼
  skills/              what is expensive to re-derive
     │                 cto · poketrace-api-expert · catalogue-sync · agent-world
     │                 · architecture-scorecard · stripe-*
     │                 Loaded on demand, by any agent, in any session.
     ▼
  agents/              who does the work in a separate context window
                       an executive tier that decides and routes,
                       over a worker tier that does the repetitive part
```

**The rule that keeps this from bloating: skills hold knowledge, agents hold
scope.** An agent definition says which files it may touch, what it must verify,
and what it must refuse. It does *not* restate PokeTrace's rate limits or the era
map — it loads the skill. When you learn a new fact about the system, it goes in
a skill. When you find a new *kind of task*, it may warrant an agent.

## The org chart

```
you
│
├── cto             opus     all development and technical work
│   ├── backend         opus     server.js
│   ├── frontend        opus     src/
│   ├── verifier        sonnet   proves it works in the running app
│   └── release-guard   opus     proves it survives the droplet
│
├── cpo             sonnet   product strategy, roadmap, scope
│   └── spec-writer     sonnet   drafts the one-pager from the code
│
├── cfo             opus     revenue, margin, pricing
│   └── revenue-reporter haiku   runs the fixed queries
│
├── cmo             sonnet   social, content, promotions, CRM, brand
│   └── content-writer  sonnet   drafts copy against brand.md
│
├── vp-support      sonnet   customer replies and support policy
│   └── support-triage  haiku    classifies one inbound message
│
├── vp-design       sonnet   design and art direction
│   └── design-review   sonnet   screenshots at 375px and desktop
│
└── vp-research     sonnet   user and market research
    └── market-scanner  sonnet   sourced, dated search sweeps
```

Two tiers, and the split is the point:

- **Executives decide and route.** They hold judgment, context, and the refusals.
  None of them except `cto` may touch code at all, and `cto` routes rather than
  implements — which is what makes the review a real review.
- **Workers do the repetitive half.** Narrow scope, fixed output shape, cheaper
  model. They gather, classify, draft, and measure; they never interpret, decide,
  publish, or move money.

Every executive answers a different question, so pick by question, not by title:
`cto` how · `cpo` what and whether · `cfo` what it earns · `cmo` how it is told ·
`vp-support` what the customer hears · `vp-design` how it looks · `vp-research`
what is actually true out there.

## Roster

| Agent | Use it for | Tools | Model |
|---|---|---|---|
| **Executive** | | | |
| `cto` | Architecture, blast radius, sequencing; routes all code work | full + delegate | opus |
| `cpo` | What to build and what to cut; specs, roadmap | no code edits | sonnet |
| `cfo` | Revenue, margin, pricing, unit economics; read-only on money | no writes to money | opus |
| `cmo` | Social, content, promotions, CRM, brand voice; drafts only | no code edits | sonnet |
| `vp-support` | Customer replies and support policy; drafts, never sends | no code edits | sonnet |
| `vp-design` | Visual design and art direction; specifies, routes to `frontend` | no code edits | sonnet |
| `vp-research` | User and market research; every claim sourced and dated | no code edits | sonnet |
| **Worker** | | | |
| `backend` | `server.js` — routes, auth, SQLite schema, cron, external API calls | full | opus |
| `frontend` | `src/` — pages, hooks, colocated CSS, the hand-rolled tab router | full | opus |
| `verifier` | Proving a change works in the real running app; Playwright | read + bash | sonnet |
| `release-guard` | Pre-push: will this survive `git reset --hard` on the droplet? | read + bash | opus |
| `spec-writer` | Reads the code a request touches, drafts the one-pager | read + write specs | sonnet |
| `revenue-reporter` | Runs the fixed revenue queries, fills the template | read-only DB | haiku |
| `content-writer` | Drafts posts, blurbs, email bodies against `brand.md` | write content | sonnet |
| `support-triage` | Classifies one inbound message: category, severity, macro | read-only | haiku |
| `design-review` | Screenshots pages at 375px and desktop, reports findings | read + bash | sonnet |
| `market-scanner` | Search sweep; files raw sourced, dated scans | read + web | sonnet |

## Choosing the model

Pick by **what a wrong answer costs**, not by how hard the task feels. Current
rates, input/output per million tokens: Haiku 4.5 $1/$5 · Sonnet 5 $2/$10 ·
Opus 5 $5/$25 · Fable 5.1 $10/$50.

- **Opus** — irreversible or expensive to get wrong: `cto` and `release-guard`
  (one droplet, real user data, no rollback), `backend` and `frontend` (they
  write the code), `cfo` (a wrong number is quiet and costly).
- **Sonnet** — real judgment, but the output is a draft a human reads before
  anything ships. That covers five of the seven executives and most workers.
- **Haiku** — fixed input shape, fixed output shape, high volume, and a cheap
  failure: `support-triage` classifies, `revenue-reporter` fills a template.
  Note Haiku's context window is 200K against 1M for the rest, which is the real
  constraint — it is why `market-scanner` is Sonnet despite being a simple job.
  Web sweeps fill a context fast.

**Fable 5.1 is deliberately absent.** It is the most capable model available, at
twice Opus's price, and it earns that on long-horizon reasoning problems. Nothing
here is one: the hardest judgment in this repo is "will this break a live SQLite
file," which Opus handles. Add it only if a role appears whose failures Opus
demonstrably cannot catch — and say which failures, on the day.

`effort` is the finer lever and is set per agent in frontmatter. Executives run
`high` because their output steers everything downstream; classifiers and
gatherers run `low`.

**`packages/world` has no agent, by design.** Agent World is a satellite with its
own lockfile that is never deployed and never imported by the app, so there is no
scope to fence: it cannot break production, and it shares no files with `backend`
or `frontend`. What it has instead is a large pile of expensive knowledge — silent
art and tilemap failures, the redaction allowlist, the clearance model. By this
file's own rule, that makes it a **skill** (`agent-world`), not a fifth agent.
Load that before touching `packages/world`; note in particular that
`packages/world/bridge/server.js` is not the `server.js` that `backend` owns.

Built-ins that already cover their ground — don't re-create them:

- **`Explore`** — broad read-only fan-out searches ("where is X handled?").
- **`Plan`** — implementation strategy for a multi-file change.
- **`/code-review`**, **`/security-review`**, **`/simplify`** — review passes.

## Agent memory, and the cwd trap

The five contributing executives carry `memory: project`, which auto-loads
`.claude/agent-memory/<agentType>/` — how `cto` remembers across report runs.

**That path resolves against the agent's working directory, not the repo root.**
If the session's cwd has drifted into a subdirectory, memory is written to a
nested `.claude/agent-memory/` under it, where the next run will not find it.
This has already happened once: both first-run agents wrote into
`.claude/skills/daily-report/.claude/`.

It matters more than a misplaced file, because of how `.gitignore` is scoped
here. `.claude/*` is ignored with `!.claude/skills/` un-ignoring the skills tree —
so memory landing at the repo root is correctly ignored and stays local, while
memory landing **under a skill directory gets committed**. Verified with
`git check-ignore`. Agent memory can carry working notes about live data; it
should not ride along inside a committed skill.

**Check `pwd` before dispatching an agent that has memory**, and if you find a
`.claude/agent-memory/` anywhere but the repo root, move it there.

## When to delegate, and when not to

Delegating costs a cold context window that has to re-derive what you already
know. That cost is worth paying in exactly three cases:

1. **Context isolation pays.** A search that would dump 40 files into the main
   thread to yield one answer → `Explore`.
2. **The work is genuinely parallel.** Backend route + the page that calls it,
   built against an agreed contract → `backend` and `frontend` concurrently.
3. **A fresh reader is the point.** `release-guard` and the review skills are
   valuable *because* they didn't watch you write the code.

The executive tier adds a fourth: **a durable set of refusals is the point.**
`cfo` never moves money, `cmo` never publishes, `vp-support` never sends, and
none of them can be talked out of it mid-task the way an inline instruction can
be forgotten twenty turns later. That is most of what you are buying.

What you are *not* buying is a ceremony. Going `you → cpo → spec-writer` for a
one-line copy change is three cold context windows to do something you could
have typed. **Call the tier you actually need.** The chart says who owns what; it
does not say every task must enter at the top.

## How the hierarchy actually runs

Executives hold the `Agent` tool, so they delegate to their own workers in their
own context — `you → cfo → revenue-reporter` is two levels deep and supported.
Three things to know before you lean on it:

- **There is a depth limit and a concurrency limit**, enforced by the harness,
  which refuses calls past them rather than failing loudly in a way you would
  notice. Two levels is comfortable; a worker that wants its own worker is a
  design smell — flatten it.
- **Cost compounds per level.** An Opus executive that spawns three Sonnet
  workers is four context windows for one answer. That is correct for a genuine
  fan-out and wasteful for a lookup.
- **Only the final report comes back.** Everything a worker read is gone when it
  finishes. If the executive needs the evidence and not just the verdict, its
  prompt has to ask for the evidence — which is why every worker here specifies
  what its report must contain.

## The daily report

Five of the seven executives — `cto`, `cpo`, `cmo`, `vp-design`, `vp-research` —
each file a seven-section update on their own domain, assembled into one dated
file in `business/daily/`. Run it with the `daily-report` skill.

`cfo` and `vp-support` are deliberately out of it: there are no orders and no
customers, so their sections could only say `no data`, daily, forever. They join
on a trigger — the first real order, the first customer message — not on a date.

The two rules that make the report worth reading, both in the skill:

- **Evidence or nothing.** Progress, highlights and blockers each carry a commit
  SHA, a query result, a file path, or a dated URL.
- **"No change" is a complete answer.** Most domains, most days. A report that
  fills an empty day with plausible prose is worse than no report, because it
  reads like signal.

## Tenets, and the two classes of goal

`business/tenets.md` is the constitution — shared tenets `T1`-`T5` plus per-domain
ones, each with a cadence and a `Last acted` date. **A human owns that file;
agents derive goals from it.** Lower numbers win, and `T1` (nothing we ship costs
a user their data) wins over everything — which is what stops "chase the AI
frontier" from turning into a rewrite of something that works.

Goals come in two classes and the priority is not negotiable:

| | `business/goals.md` | `business/<domain>/goals.md` |
|---|---|---|
| Written by | a human | the owning agent |
| Scope | what the business is trying to do | how that agent does its own repetitive work |
| Priority | always wins | yields |

An agent may write its own file, but only about its own machinery — never what
gets built, what is charged, or what a customer sees. Those become
`PROPOSED FOR COMPANY GOALS` and sit there until a human moves them.

**Staleness is the metric.** A tenet past its cadence with an unmoved
`Last acted` line gets named in the daily report. That is the whole anti-staleness
mechanism: T2 asks every domain to scan for new capability on a cadence, and the
report is what notices when nobody did. Its matching bar keeps it honest —
**a changelog is not evidence; adoption needs a demonstrated win on a real task
in this repo**, and "scanned, found nothing" is a successful scan.

## The seams between executives

Some questions have two owners on purpose, and the fastest way to get a wrong
answer is to ask only one of them:

- **Price** — `cfo` owns the margin, `cpo` owns the positioning. Joint call.
- **A public claim about the product** — `cmo` writes it, but `verifier` or the
  code confirms it is true before it ships.
- **A market claim** — `vp-research` sources it; `cpo` and `cmo` consume it and
  may not invent their own.
- **A visual change** — `vp-design` specifies, `frontend` implements, and
  `design-review` confirms at both widths. Three roles, deliberately.
- **A bug that arrived as a ticket** — `vp-support` owns the reply, `cto` owns
  the fix. Neither does the other's half.

Otherwise do it inline. A single-file edit, a question you can answer from
`CLAUDE.md`, or anything under ~3 tool calls is not a delegation.

## Contracts between agents

Parallel `backend` + `frontend` work only if the seam is agreed **before** both
start. The seam in this app is always the same shape: an Express route in
`server.js` and a thin wrapper in `src/api/`. Write the route signature — path,
query params, response shape, error shape — into both prompts. `src/api/*.js`
never calls an external API directly; it calls this app's own `/api/*`.

## Adding an agent

Only if it owns a durable slice that the existing roster doesn't. A new agent
must be able to state, in one line each:

- the files it owns,
- the check it runs before reporting done,
- the thing it refuses to do.

If you can't fill in all three, you want a skill or a slash command instead.

This test is why the non-engineering executives own directories under
`business/` rather than owning nothing. An agent with no artifact to produce
fails the first line, and an agent that fails the first line reliably drifts into
producing chat instead of work.

**Add a worker only when the repetitive task already exists.** Each VP starts
with exactly one, and that is deliberate — the right time to add
`faq-curator` or `seo-auditor` is the third time someone does that job by hand,
not in advance of anyone doing it once. A roster that grows ahead of the work is
how this file stops being read.

## Why this is versioned

`.gitignore` scopes `.claude/` so that `agents/`, `skills/`, and `settings.json`
are committed while `settings.local.json` (machine-specific approvals) is not.
The hand-written skills represent hours of live-API debugging; before this, a
fresh clone silently lost all of them.

## Fresh clone

```
npm ci
```

That's all. `.claude/skills/` holds every skill as **real committed files** — the
hand-written ones (see CLAUDE.md's table) plus eight vendored from
`docs.stripe.com`. There is no separate vendoring step, no `.agents/` directory,
and no symlinks to dangle.

This is a deliberate change from the original symlink layout, made after testing
the alternatives:

- `npx skills experimental_install` — the CLI's own "restore from
  skills-lock.json" — **does not work** for these skills. They're pinned with
  `"sourceType": "well-known"` / `"source": "docs.stripe.com"`, and the restore
  path feeds that bare domain to `git clone`: *"repository 'docs.stripe.com'
  does not exist"*. So the lockfile could never actually drive a restore, which
  was the premise the symlink layout rested on.
- An unscoped `npx skills add <source> --all` installs to *every* known agent —
  in a clean directory that produced **49 top-level dotfile directories and
  21MB**. Never run it here.

Committed real files cost about half a megabyte (`du -sh .claude/skills`) and
remove both failure modes. Stated as a command rather than a number on purpose —
a hardcoded size goes stale on every skill added, silently, which is the same
failure the line-number citations had. The lockfile still earns its place as an
integrity record: re-vendoring reproduces all eight `computedHash` values
byte-for-byte identically.

### Updating or re-adding the vendored skills

```
npx skills add https://docs.stripe.com --skill '*' --agent claude-code -y
```

The `--agent claude-code` scope is what keeps it to `.claude/skills/` as real
files. The `https://` scheme is required — a bare `docs.stripe.com` is treated
as a git repo and fails. Verified against the skills CLI bundled with Claude
Code 2.1.233; re-check if that changes.

`.gitattributes` marks the eight vendored directories `linguist-vendored` and
`linguist-generated`, so GitHub collapses them in review rather than letting 33
files drown a diff. They stay expandable on purpose — vendored skills run with
full agent permissions, so drift should be auditable.

`.claude/settings.local.json` is intentionally absent — it's per-machine and
accumulates approval entries that can embed live credentials.

The shared `settings.json` is a **curated** allowlist, and it has to stay that
way. It was not one when it was first brought under version control: it was 133
accumulated session approvals, cut to 32 before the first commit. What came out is
the useful list of what not to let back in:

- Four `ssh … bash -s` / `sudo bash -s` entries against the droplet — a
  pre-approved unattended arbitrary-root channel to production. Deleted rather
  than moved to `settings.local.json`, because local settings apply to dispatched
  Agent World runs too, so relocating them would not have removed the risk.
- `Bash(node -e ' *)`, `Bash(python3 -c ' *)`, `Bash(expect -c ' *)` — the largest
  actual capability in the file: unrestricted local code execution. Note these
  also bypass every `deny` rule, which constrain the **Read tool** and say nothing
  about what a subprocess reads. Kept in `settings.local.json`.
- ~10 `sqlite3 pokewatch.db "DELETE FROM …"` entries carrying a real user UUID and
  test emails; `doctl compute *` (droplet deletion) and `gh secret *`; an unbounded
  `xargs -r kill`; dead per-session scratchpad paths; and an
  `additionalDirectories` entry that was machine-absolute *and* self-referential.

The `deny` list had a genuine bug worth remembering: `Read(./.env)` and
`Read(./pokewatch.db)` are **cwd-relative**, so they silently stopped matching the
moment cwd was a subpackage like `packages/world/` — failing open, in the
direction of secrets. They are now `.env`, `**/.env`, `**/*.db`, plus
`**/settings.local.json` and `packages/world/.world/**`. Anchoring semantics are
the thing that was wrong before, so confirm any change to them against
`/permissions` rather than assuming.

Adding an entry here is a decision about what every future clone and every
autonomous dispatch may do without asking. If it is specific to this machine, it
belongs in `settings.local.json`.
