# Scheduling the report

Two halves on two machines, because generating the report and delivering it have
different requirements.

```
Anthropic cloud          12:00 UTC Mon-Fri   (07:00 America/Chicago, +~5min jitter)
  routine "pokewatch daily company report"
  └─ clone repo → read this skill → fan out to 5 executives
     └─ assemble business/daily/YYYY-MM-DD.md
        └─ git push -f origin reports        ← NEVER master

droplet                  13:00 UTC Mon-Fri   (08:00 America/Chicago)
  node-cron in server.js
  └─ git fetch origin reports (read-only, no checkout)
     └─ git show origin/reports:business/daily/<today>.md
        └─ sendEmail() → REPORT_EMAIL_TO
```

## Why the `reports` branch, and not master

`.github/workflows/deploy.yml` triggers on every push to `master` and has **no
`paths-ignore`**. A markdown-only commit there would run the full Playwright
suite and `git reset --hard` + restart the live droplet — a daily production
deploy to ship a text file. The branch keeps the report in git, reviewable and
durable, without touching the deploy path.

The droplet's fetch is read-only and never checks out: `git fetch` plus
`git show <ref>:<path>` reads a blob without touching the working tree or index,
which matters because that same checkout is what deploy runs `reset --hard`
against.

## Manual steps that no diff will show

1. **Connect GitHub to the Claude account.** Without it the routine cannot be
   saved at all — the API returns `401: Connect your GitHub account before
   saving a routine that uses a GitHub repository`. Run `/web-setup`, or connect
   at <https://claude.ai/connect-github>.
2. **Set `REPORT_EMAIL_TO` in the droplet's `.env`.** It is gitignored and
   survives `reset --hard`, so deploy will never create it. Without it the job
   logs once and returns.

## Recreating the routine

`routine.json` in this directory is the exact create body. Replay it with the
`RemoteTrigger` tool (`action: "create"`), not curl — auth is handled in-process.
Generate a fresh `uuid` for the event first; reusing one is not fatal but the
field expects a new v4 per event.

Manage or delete routines at <https://claude.ai/code/routines> — the API cannot
delete them.

## Cadence

Weekdays only (`0 12 * * 1-5`). Five executive context windows per run is a real
recurring cost, and most domains will file "no change" on a weekend anyway. The
skill says to drop the cadence further if that keeps happening on weekdays too —
a ritual nobody reads is worth less than its bill.

## Once `cfo` joins

The cloud sandbox has **no access to `pokewatch.db`** — it is gitignored and
lives on the droplet. Every SQLite-sourced metric is `not available in this
environment` today, which costs nothing while there are 0 orders and 0 products.
When the first real order lands and `cfo` joins the report, that gap becomes
real: either move generation to the droplet, or have the droplet publish a
committed aggregate (totals and counts only — `business/` ships to a public-facing
box) for the cloud run to read.
