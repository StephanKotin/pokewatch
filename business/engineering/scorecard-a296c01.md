# Architecture impact — `a296c01` (retroactive, filed 2026-10-16)

Commit: `a296c01` "Add an executive agent tier and a daily company report"
(2026-09-12). App-facing parts only: a second cron `emailDailyReport`
(`grep -n emailDailyReport server.js`), `child_process.execFile` for read-only
`git fetch` / `git show` against `origin/reports`, env var `REPORT_EMAIL_TO`
(`.env.example`), and a `.env.*` rule in `.gitignore`.

```
  C  coupling      6 → 5  (−1)  server.js now reads business/ content: the path
                                 business/daily/<date>.md on the `reports` ref
  T  truthfulness  6 → 5  (−1)  CLAUDE.md says no server.js may "import or read
                                 from" business/ — now false; cto skill shipped
                                 the cron as 30 12 while code says 0 13
  X  restraint     6 → 5  (−1)  first runtime shell-out from the web process,
                                 plus a cron and an env var, for one email
  R  recoverability 3 → 3 ( 0)  new manual droplet step (REPORT_EMAIL_TO,
                                 RESEND_API_KEY), but unset is a logged no-op
  S  security      5 → 5  ( 0)  .env.* ignore is a real small gain; offset by a
                                 new outbound git call from the public process
  Composite 5 → 5   (cap: min(D,R,S)+2 = min(3,3,5)+2 = 5)
```

**Trade-off:** buys a daily emailed report while keeping the Resend key on the
droplet and markdown commits off `master` (which would redeploy production).
Spends restraint and the "business/ is inert" rule. Accepted: every failure path
logs and returns, `execFile` takes an argv array, and every git call has a 20s
timeout.

**Falsifier:** if the `daily-report` skill renames or moves `business/daily/`
and the email silently stops with no `server.js` change, the C −1 was real and
undercounted. If `REPORT_EMAIL_TO` is unset on the droplet 30 days from now, the
feature was never used and X should be −2.

**Least sure of: T −1.** The skill's cron literal was fixed on 2026-10-16
(`.claude/skills/cto/SKILL.md`, uncommitted), so half of the debt is paid. The
CLAUDE.md contradiction remains. Read literally, the rule means the working-tree
`business/` directory, and `git show` reads a ref rather than a file. But the
rule exists so that nothing in the app depends on `business/`, and this does.
CLAUDE.md is outside `cto`'s write scope, so a human has to decide whether to
amend the rule or move the job.
