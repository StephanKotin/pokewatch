---
name: daily-report
description: Produce the company daily report — engineering, product, marketing, design and research each contribute a seven-section update on their own domain (goals, progress, wins, blockers, learnings, debates, agent/skill changes), assembled into one dated file in business/daily/. Use when asked for the daily report, the standup, "where are we", or a status update across the company. Also use to read back a past report or to check progress against the SMART goals in each domain's goals.md.
---

# The company daily report

One file per day at `business/daily/YYYY-MM-DD.md`, assembled from five
executive sections. It exists so that progress is measured against goals that
were written down *before* the day started, rather than narrated after it.

## Who contributes

| Domain | Executive | Section file |
|---|---|---|
| Engineering | `cto` | `business/engineering/daily/YYYY-MM-DD.md` |
| Product | `cpo` | `business/product/daily/YYYY-MM-DD.md` |
| Marketing | `cmo` | `business/marketing/daily/YYYY-MM-DD.md` |
| Design | `vp-design` | `business/design/daily/YYYY-MM-DD.md` |
| Research | `vp-research` | `business/research/daily/YYYY-MM-DD.md` |

**`cfo` and `vp-support` are deliberately not in the report.** There is nothing
for them to report on: the storefront has zero orders and zero products, and
with no customers there are no tickets. A finance section today could only be
`no data`, filed daily, forever — which trains everyone to skim the report.

They join on a trigger, not on a date: **`cfo` when the first real order lands**,
**`vp-support` when the first customer message arrives.** Add their row above,
create `business/finance/goals.md` and `business/support/goals.md` from the
pattern the others use, and append the daily-section block to their agent files.
Until then, ask them directly when you want their view.

## The failure mode this is built to prevent

A daily report is the single easiest artifact in this repo to fabricate. Ask
five agents for "highlights" and you will get five paragraphs of plausible
corporate prose whether or not anything happened. That report is worse than no
report, because it *reads* like signal.

So the contract is absolute:

> **Every factual claim in sections 2, 3 and 4 carries its evidence inline — a
> commit SHA, a query and its result, a file path, or a URL with a retrieval
> date — or it is not written.**

And its corollary, which matters just as much:

> **"No change since the last report" is a correct, expected, complete answer.**
> Most domains, most days. An executive that files "no change" with one line
> saying what it checked has done its job perfectly. Padding an empty day is the
> only way to fail this task.

Right now that is not hypothetical. The storefront has **zero orders, zero
products and one user account**; `business/` was created today, so `brand.md`,
`principles.md` and the research scans do not exist yet. Four of the five
domains have almost nothing to measure. Check before you write — and expect
"no change" to be the honest answer for a while.

## Running it

**1. Find the anchor.** The most recent file in `business/daily/` is the last
report; its date is the window start for everything ("since the last report").
No prior file means this is report #1 — say so, and treat every section as a
baseline rather than a delta.

**2. Gather the shared facts once**, in the main thread, and pass them into every
executive prompt. Doing this once is cheaper and more consistent than five
agents each running their own `git log`:

```
git log --oneline --since="<anchor>"              # what shipped
git log --oneline --since="<anchor>" -- .claude/  # section 7, automated half
git status --short                                # uncommitted work in flight
```

**Hand over SHAs and counts, never a characterization of them.** This step is
itself a fabrication vector: the moment the assembler writes "nothing touched
CSS this window" into five prompts, it has laundered one unchecked assumption
into five reports that all agree with each other. Give contributors the raw
list and let each one run `git show --stat <sha>` for its own domain.

Contributors: **a claim about which files a commit touched is only evidence
once you have run `git show --stat` on it.** If the prompt characterizes the
window for you and the stat output disagrees, the stat output wins — say so in
your section and correct the record. This has already happened once, on the
first run of this skill.

**3. Fan out.** Launch all five contributing executives concurrently in one
message — `cto`, `cpo`, `cmo`, `vp-design`, `vp-research`. Each writes **its own
section file** at the path in the table above.

> Contributors must never write to the shared report file directly. Concurrent
> writes to one file silently lose sections. The fan-out/fan-in through
> per-domain section files is what makes this safe, and it also preserves the
> one-owner-per-directory rule in `business/README.md`.

**4. Assemble.** Concatenate the five section files into
`business/daily/YYYY-MM-DD.md` under the standard header, then write section 6
(see below), which only the assembler can write.

**5. Report the cost honestly.** Five executive context windows is a real daily
spend. If most domains have been filing "no change" for a week, say so and
suggest dropping to the two or three domains that are actually moving, or to a
weekly cadence. A ritual nobody reads is worth less than its bill.

## Running it on a schedule

[`SCHEDULING.md`](SCHEDULING.md) covers the automated setup: a cloud routine
generates the report weekday mornings and pushes it to the `reports` branch,
and the droplet emails it from there using the `sendEmail` helper already in
`server.js`. [`routine.json`](routine.json) is the exact create body to replay.

The one rule that survives out of that file: **the report is never pushed to
`master`.** `deploy.yml` has no `paths-ignore`, so a markdown commit there
redeploys the live app.

## A worked example

[`EXAMPLE.md`](EXAMPLE.md) in this directory is a specimen of a mature report —
goals set, tenets being acted on, one real two-sided debate. Read it before
writing your first section; it carries the citation density and the heading
levels that this file only describes.

Its values are illustrative and it is dated in the future on purpose, so it can
never be mistaken for a filed report. **Copy its structure, never its numbers.**
Its Design section is the one to study: four of its seven parts read "no change",
and it is a complete and correct section.

## The seven sections

Each executive fills these for **its own domain only**, in this order.

**Heading levels are fixed, so the assembler can concatenate without rewriting
them:** your section file opens with `## <Domain> — YYYY-MM-DD`, and each of the
seven sections below is an `### N. <Name>`. The first run of this skill produced
one file at `#`/`##` and one at `##`/`###`, which the assembler had to normalize
by hand — cheap once, wrong every day after.

**1. Goals and tenet coverage.** Three parts, in this order.

*First, the human-directed company goals* from `business/goals.md` that your
domain moves — restated with their current measured value. **These outrank
everything else in this section**; if your agent-developed work competed with
one for time this period, say which won.

*Second, your agent-developed goals* from `business/<domain>/goals.md`. Each
shows the SMART statement, the tenet it serves, its measured baseline, its
target, its current value, and the source of that value. You own this file and
may update it — but only within its scope: **your own repetitive work**, never
what gets built, what is charged, or what a customer sees. Out-of-scope ideas
get written into the file as `PROPOSED FOR COMPANY GOALS` and left alone.
`business/goals.md` you never edit at all.

*Third, tenet coverage*, checked against `business/tenets.md` both ways:

- **Uncovered** — a tenet with no goal serving it. Name it. Being ignored
  quietly is the failure the tenet file exists to prevent.
- **Stale** — a tenet past its cadence whose `Last acted` line has not moved.
  Name it and the date it was last acted on. **This is the anti-staleness
  mechanism; it only works if you actually look.** T2 and your domain's
  scanning tenet are the ones most likely to rot, precisely because nothing
  breaks when they do.

When you act on a tenet, update its `Last acted` line in `business/tenets.md`
with the date and one clause. That line is the only edit an agent makes to that
file.

If a goals file says `STATUS: unset`, that is its part of the section: say so
and propose two or three candidates with evidence. Proposing is useful.
Pretending goals exist is not.

**2. Progress since the last report.** Movement in the metrics from section 1,
each with its evidence. Format: `metric — was X, now Y — <source>`. If a metric
did not move, say `unchanged`. If it cannot be measured yet, say `not yet
measurable` and what would make it measurable.

**3. Highlights.** Things that actually happened, with citations. Merged commits,
a query result that improved, a published artifact. **Not** "continued to make
progress on" — if you cannot cite it, it is not a highlight.

**4. Headwinds / blockers.** What is in the way, who or what would clear it, and
whether it is blocking now or merely looming. Include things blocked on a human —
an unauthorized Stripe connection, an undeployed `.env` value, a decision nobody
has made. Those are the most useful entries in the whole report.

**5. Learnings.** Something you now know that you did not yesterday, and what you
will do differently. A learning with no behavioural change attached is trivia.
This is also where you propose a goal change, a new macro, or a rule that should
be written into a skill.

A capability scan under T2 reports here. **"Scanned, found nothing worth
adopting" is a successful scan and a complete entry** — most should read that
way. What is never acceptable is an adoption recommendation with no demonstrated
win on a real task in this repo; a changelog is not evidence.

**6. Hotly debated topics.** *Left blank by individual executives.* You may flag
an item as `CONTESTED:` with your position and who disagrees; the assembler
collects these. See below.

**7. Skill and agent updates.** Two halves. The **automated** half is the
`.claude/` commit list handed to you — name the ones that touched your agents or
skills and what changed for you. The **proposed** half comes from section 5: a
rule you learned that belongs in a skill, a refusal that should be added to a
worker, a worker that should exist. Concrete proposals only.

## Section 6 is assembled, not authored

One agent cannot debate itself, and an executive asked for "hotly debated topics"
in isolation will manufacture a controversy. So section 6 is written **only by
the assembler**, from two real sources:

- **Flagged conflicts** — any `CONTESTED:` item an executive raised.
- **Detected contradictions** — two sections that disagree on a fact or a
  recommendation. Read for these deliberately; the seams in
  `.claude/agents/README.md` are where they cluster: a public claim (`cmo` vs
  what the code actually does), a visual change (`vp-design` vs what `frontend`
  can build), a market claim (`vp-research` vs what `cpo` wants to believe),
  and scope (`cpo` vs `cto` on what a feature really costs).

Write each as: the question, each side with its owner and its evidence, and what
would settle it. If there is genuinely no disagreement, the section reads
**"None this period"** — which is the honest answer on a quiet day and should not
be dressed up as consensus-building.

## Reading a past report

Answer from the file. Do not re-run the fan-out to answer "what did we say
yesterday" — that is five context windows to read one file that already exists.
