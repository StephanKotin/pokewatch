# `business/` — the third zone

Markdown only. Nothing here is imported, bundled, served, or executed.

CLAUDE.md describes two zones: the repo root (the deployed app) and `packages/`
(never-deployed satellites). This is the third. It exists because the executive
agents in `.claude/agents/` produce durable artifacts that are not code — a
roadmap, a brand voice, a revenue report, a research scan — and a roadmap that
lives only in a chat transcript is not a roadmap.

## The rule

**Nothing in `src/` or `server.js` may ever import, read, or reference a file in
here.** The tripwire is the same shape as `packages/`: if you find yourself
adding `business/` to a Vite config, an `fs.readFileSync`, or a route handler,
you have stopped writing a document and started writing a data file — put it in
`src/data/` instead and let the `frontend` agent own it.

## It ships to the droplet, and that is fine

Deploy is `git reset --hard origin/master`, so everything committed here lands
in `/opt/pokewatch`. That is harmless — a few KB of markdown that nothing reads.
Two consequences worth knowing:

- **Do not put anything here you would not publish.** It sits on a box that
  serves public HTTP. Nothing routes to it today, but "no route exists today" is
  not a security boundary. No customer names, no order IDs, no email addresses,
  no API keys, no unredacted support tickets.
- **Aggregate, don't itemize.** Revenue reports carry totals and counts, not
  per-customer rows.

## Who owns what

| Path | Owner |
|---|---|
| `business/engineering/` | `cto` |
| `business/product/` | `cpo` |
| `business/finance/` | `cfo` — not yet created; `cfo` makes it on first use |
| `business/marketing/` | `cmo` |
| `business/support/` | `vp-support` — not yet created; made on first use |
| `business/design/` | `vp-design` |
| `business/research/` | `vp-research` |

`business/daily/` is the one exception: the assembled company report has no
single owner, which is why contributors write section files into their own
directory and an assembler stitches them. See `business/daily/README.md`.

Otherwise one owner per directory, and agents write only into their own. A cross-cutting
document goes in the directory of whoever is accountable for the decision, and
the others link to it rather than forking a second copy.
