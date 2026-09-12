# Agent World

A Game Boy Advance-style campus you walk around, where the agents in
[`.claude/agents/`](../../.claude/agents/) are NPCs you talk to. Stand next to
one, face it, press Z — it answers in a textbox and offers to take a task. The
panel on the right carries the depth: the full result, the tool timeline, cost,
the measured diff, and the Approve gate.

```
arrows / WASD   walk          Z / SPACE / ENTER   talk, advance text
                              X / ESC             close
```

**The campus is the org.** One building per department. Engineering exists
today; Marketing, Product Development and Customer Support are real, enterable
buildings with nobody in them yet, so the intended shape is visible by walking
around rather than implied in a config file.

**The rooms are the repo.** Inside Engineering, each room is bound to a slice of
the codebase (`bridge/zones.js`), and an agent walks into the room matching the
files it is touching — through the doorways, via BFS. Position is information:
one glance says "backend is in the server room".

```
npm install
npm run dev:all     # bridge on :8787 + vite on :5180
open http://127.0.0.1:5180
```

## Local only — not deployable, by design

This package is **not** part of the pokewatch deploy. It is deliberately *not* an
npm workspace, so the droplet's `npm ci` never walks into it and `vite build` at
the repo root never sees it.

Two reasons it must stay local:

- It reads `~/.claude/projects/<project>/*.jsonl`, which contain file contents,
  prompts, and command output.
- It can spawn Claude Code with tool access to this repo.

Both servers bind `127.0.0.1`. Don't change that.

## How it works

```
 ~/.claude/projects/-Users-…-pokewatch/*.jsonl
        │  append-only JSONL, several MB
        ▼
 bridge/watcher.js      tail by byte offset, normalize, REDACT
        │
        ├──────────────────────────► bridge/history.js   .world/history.jsonl
        ▼                                                (dispatches only)
 bridge/server.js       SSE /api/events
                        POST /api/dispatch · /api/approve · /api/stop
                        GET  /api/roster · /api/history · /api/history/:id · /api/running
        │
        ├── bridge/zones.js       tool path -> district  (the map)
        ├── bridge/gitSnapshot.js before/after hashes -> measured diff
        │
        ├──► WorldScene → AgentNpc       (walks to the room it is working in)
        │      engine/tilemap · player · pathfind   ·   maps/*.js
        └──► SessionPanel                (conversation · diff · timeline · cost)
```

Dispatch and observation are the same mechanism. `POST /api/dispatch` generates
the session UUID itself and passes it to `claude --session-id`, so the bridge
knows exactly which transcript the run will write to, and every tool call comes
back through the same watcher that reports your own interactive sessions.

Sessions the bridge didn't start are routed to the `operator` sprite — which is
why the office is busy even before you dispatch anything.

## Things that are the way they are on purpose

**The CLI is found by glob, not by path.** `claude` is not on `PATH` on this
machine; it ships inside the VS Code extension at
`~/.vscode/extensions/anthropic.claude-code-<version>/resources/native-binary/claude`.
`bridge/claudeBin.js` version-sorts the extension directories and takes the
highest. Set `WORLD_CLAUDE_BIN` to override.

**Everything is redacted at the watcher, not the client.** `bridge/watcher.js`
builds each summary from a per-tool allowlist (`Bash` → `command`, `Read` →
`file_path`, …), caps it at 120 characters, runs it through a secret scrubber,
and forwards `ok`/`error` for results instead of output. Assistant prose is not
forwarded at all. A tool it doesn't recognise contributes its name and nothing
else. **Add a tool to `SUMMARY_FIELD` only if that one field is safe to display.**

**Every dispatch is plan mode by default.** `--permission-mode plan` lets an
agent read and reason but not edit. Raise an individual agent in
`bridge/config.js` → `CLEARANCE_OVERRIDES`; the request body can never choose its
own clearance. Verified: `backend` told to add a column to `server.js` read the
file and changed nothing.

**Approve is the only clearance escalation, and it resumes rather than re-asks.**
`POST /api/approve` runs `claude --resume <sessionId> --permission-mode
acceptEdits`. Verified: `--resume` keeps the same session id and inherits the
plan, so the agent executes what it already described instead of re-deriving it.
The route refuses a session that is still running, that did not end `ok`, or that
was already approved.

**The Approve button acts on the session it was rendered for, not on the current
selection.** It carries `data-for="<sessionId>"`. A `dispatch_start` arriving
between render and click re-selects the panel, which would otherwise slide the
button under your cursor and escalate a session you never read.

**Dispatched agents run with the workspace untrusted.** stderr says *"Ignoring
133 permissions.allow entries … this workspace has not been trusted"*. Edits
still work under `acceptEdits`, but the project's Bash allowlist does not apply,
so approved runs can be more restricted than the same agent in your IDE. Fix by
accepting the trust dialog once interactively, or setting
`projects["/Users/…/pokewatch"].hasTrustDialogAccepted` in `~/.claude.json`.

**History persists dispatches only.** `.world/history.jsonl` (gitignored) is
append-only and replayed into memory on boot. Your own interactive sessions
stream through the world live but are never written — they are continuous and
unbounded, and the file would become a shadow copy of your transcripts.
Per-session timelines are capped at `TIMELINE_CAP`.

**Cost is an estimate, not a bill.** The CLI reports `total_cost_usd` — tokens
at API list rates — whether you authenticate with an API key or a Claude
subscription. On a subscription that is *not* money charged; the usage draws
against your rate limits. So every cost in the UI is rendered `~$0.0000 est.`
with a tooltip saying so. Read it as a relative effort meter: in testing, a
vague `backend` dispatch cost ~$0.23 (opus, and plan-mode exploration read all
1.7k lines of `server.js`) against ~$0.04 for a `verifier` run that answered in
one turn. Narrow scope to the right agent is the whole lever.

**Concurrency is capped at `MAX_CONCURRENT` (3), and one run per agent.** Each
dispatch is a billing process. Two runs for the same agent would interleave in
one sprite and make the world lie about what is happening. Override with
`WORLD_MAX_CONCURRENT` (used to exercise the limit without paying for N agents).

**Nested subagents get a helper sprite.** A `Task` tool_use becomes a
`task_spawn` carrying a structured `subagentType`; sidechain tool calls keep the
helper alive and deliberately do *not* overwrite the parent's bubble. Attribution
caveat: sidechain transcript lines don't name their parent Task without walking
the `parentUuid` chain, so helper activity is attributed to the most recently
spawned subagent — exact for one Task at a time, approximate beyond that. The
helper despawns after 12s of quiet because the transcript has no reliable
"subagent finished" marker.

**Ports are pinned and far apart.** Bridge 8787, Vite 5180 with `strictPort`.
They previously collided — the bridge held IPv4 `127.0.0.1:5174` while Vite took
IPv6 `[::1]:5174`, and both "worked" while the proxy hit whichever stack resolved
first.

**There is a stop button because dispatches bill while they run.** A vaguely
scoped `backend` dispatch was still exploring after four minutes in testing.
Clicking a busy agent offers a brake instead of a second dispatch, and the bridge
SIGTERMs its children on shutdown. The CLI traps SIGTERM and exits with a status
rather than dying by signal, so intentional stops are tracked in a `stopping` set
— otherwise a stop is indistinguishable from a crash.

**The dialog stops pointer events from reaching Phaser.** Phaser installs global
pointer listeners and calls `preventDefault()` on them, which suppresses the
browser's synthesized `click` on DOM layered over the canvas. The symptom is
nasty: the Dispatch button did nothing on a real mouse click while a scripted
`button.click()` worked fine. `DispatchDialog.js` calls `stopPropagation()` on
the overlay's pointer/mouse/touch events. Keep that if you add controls.

**Most art is generated at boot.** `src/art/textures.js` draws every tile and
character frame with `Graphics` + `generateTexture()`; `src/art/tiles.js` holds
the 16x16 character grids it renders. Everything outside those two files refers
to texture *keys*, never pixels, which is what makes the art swappable at all.

**Vendored spritesheets sit alongside the generated art**, not in place of it
yet. `public/tiles/` carries `Inner.png` (ArMM1998) plus six CC0 Kenney sheets
under `kenney/`; `src/art/sheets.js` declares their geometry and `npm run
check:sheets` asserts every declared grid against the real PNG header. Load them
via `preloadSheets()` — two of the sheets have **1px spacing between tiles**, and
getting that wrong shears the frames silently rather than throwing. See
`public/tiles/ATTRIBUTION.md` for provenance and, more usefully, for what each
pack does *not* contain. `scripts/contact-sheet.py` renders a numbered grid over
any sheet so you can read tile indices off it.

**Font sizes are scene pixels, not screen pixels.** The canvas is 384×240 at 3×
zoom, so a `9px` font renders at 27px and swallowed a third of the room. 6px is
the ceiling.

## Adding an agent

Drop a fifth `.md` into `.claude/agents/` with `name:` and `description:`
frontmatter. The roster is read from disk, so a new desk, sprite, colour and
dialog appear with no change here. Give it a colour in `AGENT_COLORS` if you
don't want the fallback palette.

**The working-tree diff is measured, not reported.** `gitSnapshot.js` hashes
every non-ignored path before a run and again after, then diffs the two
snapshots — so the panel's account of what changed is independent of the agent's
own prose about what it did. Two details are load-bearing: it keeps a *copy* of
the before-state rather than diffing against HEAD (this repo always carries
unrelated dirty files, and a HEAD diff reported a one-line `.gitignore` edit as
+15/-4), and `git diff --no-index` exits 1 when files differ, which silently
discarded every patch until stdout was recovered from the thrown error.

Its honest limit, stated in the UI: changes are attributed by **time window**, so
a file you edit yourself mid-run appears too. During a `plan` run the agent
cannot write at all, so anything listed there is external by definition — the
panel says so.

Secrets stay out for free: `git status` honours .gitignore, and this project
ignores `.env` and `*.db`.

**Follow-ups keep plan clearance.** `POST /api/follow-up` resumes a finished
session with your refinement so a plan that is 80% right can be nudged instead
of restarted. It never escalates — writing stays behind the explicit Approve
gate — and the panel renders the session as a conversation of turns.

**Districts come from real paths.** `bridge/zones.js` maps a tool event's path to
a room and ships `zone` on every event; `zone: null` means the event implies no
location, and the client must then leave the agent where it is rather than drag
it to the catch-all yard. A finished run flashes the rooms its diff touched.
Adding a room means adding a path test there plus a box in `src/scenes/layout.js`.

**Nothing walks to a results board.** It used to, before the map existed. Once
position encodes *which part of the repo* an agent is in, walking somewhere to
report would make the sprite's position say something false.

**Maps are ASCII grids with a legend** (`src/maps/*.js`). Moving a tree is
changing one character. `npm run check:maps` validates them, and it earns its
keep — the first Engineering draft had doorways in the wall-top row offset one
tile from the doormats in the wall-face row, which walled off every room. None
of that throws at runtime; it just produces a building you can't walk through.
The check enforces: rectangular grids, complete legends, warps that land
somewhere walkable and never on another warp, and **every room reachable from
every agent's desk by pathfinding**.

Two authoring rules the checker can't infer:
  - a doorway must be open in BOTH the wall-top and wall-face rows at the same x
  - on the campus, a building's path column must equal its door column

**Agents occupy and block their tile.** That is what makes "face it to talk to
it" work, and it is how every Pokémon NPC behaves. It also means agent movement
needs real pathfinding rather than a tween.

**Tiles are 16x16 character grids** (`src/art/tiles.js`) over a shared palette,
still generated at boot. Two things learned by looking at it: `wall.top` with
repeated horizontal stripes read as floorboards, and objects need their base
floor *sampled from neighbours* — a fixed default put a bright tiled square
under every plant in the wood-floored lobby.

**The 240x160 viewport is the authentic constraint.** Integer zoom only (4x), and
the follow-camera means you never see a whole map. It also clipped the first
building labels off the top of the screen, which is why they ride the roof-edge
band now.

**Markdown is hand-rolled** (`src/ui/markdown.js`) and escapes before adding
markup, so model output can never introduce a tag. Only what agents actually
emit is supported.

**The dispatch log compacts, it does not truncate.** Past `HISTORY_MAX_BYTES` the
newest `HISTORY_KEEP_SESSIONS` are rewritten from memory as a fresh event
stream. A head/tail cut could split a `run_start` from its `run_end` and leave a
permanently "running" ghost on every future boot.

## Still out of scope

Multi-room zones, agent-to-agent interaction, streaming assistant text into
bubbles, and any droplet deployment.

Known rough edges:

- **Parallel dispatch has no shared-task concept.** Three agents can run at once
  and the panel lists them separately, but there is no notion of "these two are
  working the same contract". Worth revisiting now the map exists — two agents in
  two districts is legible spatially in a way a list never is.
- **Diff attribution is by time window**, so concurrent human edits land in a
  run's report. Stated in the UI rather than solved.
- **Subagent helpers are heuristic** — sidechain lines don't name their parent
  Task without walking `parentUuid`.
- **Rooms are hand-placed.** Deliberate: the adjacencies are meaningful and a
  solver would reshuffle them between runs, destroying spatial memory.
- **Three departments are empty shells.** Marketing, Product and Support have a
  building, a sign and no agents. They become real by giving them a map with
  `home`/`spots` and agents whose definitions live somewhere the bridge can see.
- **Only Engineering's agents are department-aware.** `seatAgents` keys off
  `department === 'engineering'`; a second staffed department needs that to read
  from the roster instead.
- **No stairs or multiple floors.** The tileset has a `stairs.up` tile ready for
  when a building needs a second storey.
