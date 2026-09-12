---
name: agent-world
description: Use for any work inside packages/world — Agent World, the local GBA-style dispatch console where this repo's .claude/agents/ are NPCs you walk up to and give tasks. Covers its bridge (Express on 127.0.0.1:8787, spawning the claude CLI, tailing and redacting transcripts, measuring diffs), its Phaser client (ASCII tilemaps, generated and vendored art, the session panel), and the rules that keep it safe and local. Also use when asked whether something about the world can be deployed, shared, or pointed at a second repo — the answers are no, no, and not yet. Not for the pokewatch app itself: packages/world/bridge/server.js and the repo-root server.js are different files with different owners.
---

# Agent World

`packages/world` is a Game Boy Advance-style campus you walk around, where the
agents in `.claude/agents/` are NPCs. Stand next to one, face it, press Z — it
answers in a textbox and offers to take a task. The right-hand panel carries the
depth: the result, the tool timeline, the estimated cost, the measured diff, and
the Approve gate.

**Read `packages/world/README.md` first.** It is ~280 lines and is the real
reference: a "things that are the way they are on purpose" list where nearly
every entry is a bug that was paid for once. This skill exists to tell you which
of those facts are load-bearing enough that violating them is a real mistake, and
to hold the things the README does not say.

## The five things you must not break

1. **Both servers bind `127.0.0.1`, and the package is never deployed.** It reads
   `~/.claude/projects/*/*.jsonl` — file contents, prompts, command output — and
   it can spawn Claude Code with tool access to this repo. Those two facts
   together are why there is no "just expose it for a minute."
2. **It is deliberately not an npm workspace.** Own `package.json`, own
   lockfile, own `node_modules`, Vite 8 against the root's Vite 7. The root
   `package.json` has no `workspaces` key and must not gain one, or the droplet's
   `npm install` starts walking in here and the two Vite versions meet. This is
   the property the whole design rests on.
3. **Redaction happens at the watcher, not the client** (`bridge/watcher.js`).
   Each event summary is built from a per-tool field allowlist (`SUMMARY_FIELD`:
   `Bash` → `command`, `Read` → `file_path`, …), capped at 120 characters, run
   through a secret scrubber, and tool *results* are reduced to `ok`/`error`.
   Assistant prose is never forwarded at all. **Add a tool to `SUMMARY_FIELD`
   only if that one field is safe to display in full.** An unrecognised tool
   contributes its name and nothing else, which is the correct default — don't
   "fix" it by falling back to dumping input.
4. **Clearance comes from `bridge/config.js`, never from the request body.**
   Every dispatch defaults to `--permission-mode plan`. `POST /api/approve` is
   the single escalation to `acceptEdits`, and it refuses a session that is
   running, that did not end `ok`, or that was already approved. Raise an
   individual agent via `CLEARANCE_OVERRIDES`, which is the only place that
   decides.
5. **The Approve button carries `data-for="<sessionId>"`** and acts on the session
   it was rendered for. This is not defensive styling: a `dispatch_start`
   arriving between render and click re-selects the panel, which would otherwise
   slide the button under the cursor and escalate a session nobody read.

## Verification

There is no test framework here, by choice, and a root `npm test` does not cover
this package (`testDir: './tests'`). Two custom checkers do the work, and they
earn it because the failures they catch **do not throw at runtime**:

```
cd packages/world
npm run check:maps     # grids, legends, warps, and every room reachable from every desk
npm run check:sheets   # every declared spritesheet grid vs. the real PNG header
npm run dev:all        # bridge :8787 + vite :5180, then open http://127.0.0.1:5180
```

`check:maps` exists because the first Engineering draft had doorways in the
wall-top row offset one tile from the doormats in the wall-face row, which walled
off every room and produced a building you simply could not walk through.

## Failures that are silent rather than loud

These are the ones worth knowing before you touch the art or the maps, because
none of them raise:

- **A doorway must be open in BOTH the wall-top and wall-face rows at the same x**,
  and on the campus a building's path column must equal its door column. The
  checker can't infer either.
- **Two of the vendored Kenney sheets have 1px spacing between tiles.** Getting
  that wrong shears every frame silently instead of throwing. `src/art/sheets.js`
  declares the geometry; `scripts/contact-sheet.py` renders a numbered index grid
  over any sheet so you can read indices off it directly.
- **Font sizes are scene pixels, not screen pixels.** The canvas is 384×240 at 3×
  zoom, so `9px` renders at 27px and swallows a third of a room. **6px is the
  ceiling.**
- **Phaser suppresses synthesized DOM clicks.** It installs global pointer
  listeners and calls `preventDefault()`, so DOM layered over the canvas stops
  receiving `click` — the symptom is a button that does nothing on a real mouse
  click while a scripted `.click()` works fine. `DispatchDialog.js` calls
  `stopPropagation()` on the overlay's pointer/mouse/touch events. Keep that if
  you add controls.
- **`git diff --no-index` exits 1 when files differ**, which silently discarded
  every measured patch until stdout was recovered from the thrown error
  (`bridge/gitSnapshot.js`).
- **The dispatch log compacts, it does not truncate.** A head/tail cut could
  split a `run_start` from its `run_end` and leave a permanently "running" ghost
  on every future boot.

## Reading the panel honestly

- **Cost is an estimate, not a bill.** The CLI reports `total_cost_usd` at API
  list rates regardless of whether you authenticate with a key or a subscription;
  on a subscription it is not money charged, it draws against rate limits. The UI
  renders `~$0.0000 est.` for exactly this reason. Use it as a relative effort
  meter — a vague `backend` dispatch ran ~$0.23 (opus, plan-mode exploration read
  all 1.7k lines of `server.js`) against ~$0.04 for a `verifier` run that
  answered in one turn. **Narrow scope to the right agent is the whole lever.**
- **The diff is measured, not reported** — hashed before and after, independent of
  the agent's own prose. But it is attributed by **time window**, so a file you
  edit yourself mid-run shows up too. During a `plan` run the agent cannot write
  at all, so anything listed there is external by definition, and the panel says
  so.
- **Subagent helper sprites are heuristic.** Sidechain transcript lines don't name
  their parent `Task` without walking the `parentUuid` chain, so helper activity
  is attributed to the most recently spawned subagent — exact for one Task at a
  time, approximate beyond that. The helper despawns after 12s of quiet because
  the transcript has no reliable "subagent finished" marker.

## The trust-dialog interaction, which is a real gotcha

Dispatched agents run with the workspace **untrusted**: stderr says *"Ignoring N
permissions.allow entries … this workspace has not been trusted"*. Edits still
work under `acceptEdits`, but the project's Bash allowlist does not apply, so an
approved run can be *more* restricted than the same agent in your IDE.

The fix is accepting the trust dialog once interactively, or setting
`projects["/Users/…/pokewatch"].hasTrustDialogAccepted` in `~/.claude.json`. Know
what that turns on before you do it: it makes `.claude/settings.json` **and**
`.claude/settings.local.json` live for autonomous dispatches. Review both first —
this is why the shared allowlist was cut from 133 accumulated approvals to a
curated set, and why no `ssh … bash -s` entry exists in either file any more.

## Pointing it at a second repo

The intended direction is that this becomes a console for any repo, not just this
one. `transcriptDirFor(projectPath)` in `bridge/config.js` is already
parameterized, so the path work is small: `REPO_ROOT` (currently
`path.resolve(here, '../../..')`, which is also why the app must stay at the repo
root), and `TRANSCRIPT_DIR` / `AGENTS_DIR` becoming functions of a selected repo
rather than boot constants. `HISTORY_FILE` needs keying per repo or a `repo` field
per event, since `history.js` replays it into memory on boot.

The real cost is elsewhere, and it is worth knowing before promising this is easy:

- **`seatAgents` keys off `department === 'engineering'`.** Only Engineering is
  roster-aware; Marketing, Product and Support are real enterable buildings with
  nobody in them. A second staffed department needs `seatAgents` reading from the
  roster instead.
- **`bridge/zones.js`'s path→room map is pokewatch-specific** (`server.js` → the
  server room, `*.db` and `data/` → the vault). A second repo needs zones supplied
  per repo, not hardcoded.

## Two known-stale spots in the package

Fix these in passing if you are already in the file; don't make a trip for them:

- `README.md` says adding a room means adding a box in `src/scenes/layout.js`.
  **That file does not exist** — `src/scenes/` holds only `WorldScene.js`, and
  layout lives in the `src/maps/*.js` ASCII grids.
- `src/maps/devroomRl.js` is a self-described throwaway tileset-comparison
  prototype that has served its purpose.

## Deliberately out of scope

Multi-room zones, agent-to-agent interaction, streaming assistant text into
bubbles, and any droplet deployment. Rooms are hand-placed on purpose — the
adjacencies are meaningful, and a solver would reshuffle them between runs and
destroy the spatial memory that makes position informative in the first place.
