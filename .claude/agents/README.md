# Agent architecture

Three layers. Each answers a different question, and they are deliberately not
interchangeable.

```
  CLAUDE.md            what every agent knows before it starts
     │                 (stack, deploy pipeline, house rules)
     ▼
  skills/              what is expensive to re-derive
     │                 cto · poketrace-api-expert · catalogue-sync · agent-world
     │                 · stripe-*
     │                 Loaded on demand, by any agent, in any session.
     ▼
  agents/              who does the work in a separate context window
                       backend · frontend · verifier · release-guard
```

**The rule that keeps this from bloating: skills hold knowledge, agents hold
scope.** An agent definition says which files it may touch, what it must verify,
and what it must refuse. It does *not* restate PokeTrace's rate limits or the era
map — it loads the skill. When you learn a new fact about the system, it goes in
a skill. When you find a new *kind of task*, it may warrant an agent.

## Roster

| Agent | Use it for | Tools | Model |
|---|---|---|---|
| `backend` | `server.js` — routes, auth, SQLite schema, cron, external API calls | full | opus |
| `frontend` | `src/` — pages, hooks, colocated CSS, the hand-rolled tab router | full | opus |
| `verifier` | Proving a change works in the real running app; Playwright | read + bash | sonnet |
| `release-guard` | Pre-push: will this survive `git reset --hard` on the droplet? | read + bash | opus |

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

## When to delegate, and when not to

Delegating costs a cold context window that has to re-derive what you already
know. That cost is worth paying in exactly three cases:

1. **Context isolation pays.** A search that would dump 40 files into the main
   thread to yield one answer → `Explore`.
2. **The work is genuinely parallel.** Backend route + the page that calls it,
   built against an agreed contract → `backend` and `frontend` concurrently.
3. **A fresh reader is the point.** `release-guard` and the review skills are
   valuable *because* they didn't watch you write the code.

Otherwise do it inline. A single-file edit, a question you can answer from
`CLAUDE.md`, or anything under ~3 tool calls is not a delegation.

## Contracts between agents

Parallel `backend` + `frontend` work only if the seam is agreed **before** both
start. The seam in this app is always the same shape: an Express route in
`server.js` and a thin wrapper in `src/api/`. Write the route signature — path,
query params, response shape, error shape — into both prompts. `src/api/*.js`
never calls an external API directly; it calls this app's own `/api/*`.

## Adding an agent

Only if it owns a durable slice of the system that the existing four don't. A
new agent must be able to state, in one line each:

- the files it owns,
- the check it runs before reporting done,
- the thing it refuses to do.

If you can't fill in all three, you want a skill or a slash command instead.

## Why this is versioned

`.gitignore` scopes `.claude/` so that `agents/`, `skills/`, and `settings.json`
are committed while `settings.local.json` (machine-specific approvals) is not.
The hand-written skills represent hours of live-API debugging; before this, a
fresh clone silently lost all of them.

## Fresh clone

```
npm ci
```

That's all. `.claude/skills/` holds all twelve skills as **real committed files** —
the four hand-written ones and the eight vendored from `docs.stripe.com`. There
is no separate vendoring step, no `.agents/` directory, and no symlinks to
dangle.

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

Committed real files cost 484K and remove both failure modes. The lockfile still
earns its place as an integrity record: re-vendoring reproduces all eight
`computedHash` values byte-for-byte identically.

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
