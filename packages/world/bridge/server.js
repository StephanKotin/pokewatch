import express from 'express';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolveClaudeBin } from './claudeBin.js';
import { loadRoster } from './roster.js';
import { TranscriptWatcher } from './watcher.js';
import { History } from './history.js';
import { snapshot, release, changeReport } from './gitSnapshot.js';
import { loadZones, zoneForEvent, zoneForPath } from './zones.js';
import {
  HOST, PORT, REPO_ROOT, TRANSCRIPT_DIR, REPLAY_LIMIT,
  MAX_CONCURRENT, APPROVE_CLEARANCE,
} from './config.js';

/**
 * The bridge between the pixel world and real Claude Code.
 *
 * Loopback only, always. It reads ~/.claude transcripts and can spawn agents
 * with tool access to this repo; neither belongs on a network interface.
 */

const bus = new EventEmitter();
bus.setMaxListeners(0);

const history = new History().load();

/** Ring buffer so a page reload doesn't open onto an empty office. */
const recent = [];
function publish(event) {
  recent.push(event);
  if (recent.length > REPLAY_LIMIT) recent.shift();
  bus.emit('event', event);
}

/** sessionId -> { agent, startedAt }, so the client can route events. */
const dispatched = new Map();

/**
 * sessionId -> live child process.
 *
 * A dispatch is a real opus process that can run for many minutes and bill for
 * it, so the console needs a brake. Observed in testing: a vaguely-scoped
 * `backend` dispatch was still exploring after 4 minutes.
 */
const running = new Map();

/**
 * Sessions we deliberately stopped. The CLI traps SIGTERM and exits with a
 * status rather than dying by signal, so `close`'s `signal` argument is null and
 * an intentional stop is indistinguishable from a crash without this.
 */
const stopping = new Set();

const watcher = new TranscriptWatcher().start();
watcher.on('event', (event) => {
  const agent = dispatched.get(event.sessionId)?.agent ?? null;
  // Where in the repo this tool call happened, so the sprite can walk there.
  // null means "this event says nothing about location" — the client must then
  // leave the agent where it is rather than move it to the catch-all zone.
  publish({ ...event, agent, zone: zoneForEvent(event) });

  // Persist activity only for dispatches; own-session traffic is unbounded.
  if (agent && (event.kind === 'tool_use' || event.kind === 'task_spawn')) {
    history.record({
      type: 'activity',
      sessionId: event.sessionId,
      agent,
      ts: event.ts,
      tool: event.tool,
      summary: event.summary,
      isSidechain: event.isSidechain,
    });
  }
});

const app = express();
app.use(express.json({ limit: '32kb' }));

/**
 * The CLI writes benign startup notices to stderr ("Ignoring 1
 * permissions.additionalDirectories entry…"), so "last stderr line" reported a
 * harmless warning as the cause of failure. Prefer the structured result, and
 * skip lines that are known noise.
 */
const STDERR_NOISE = /^(ignoring|warning|note):?\s/i;

function failureSummary(result, stderr, code) {
  const structured = result?.result ?? result?.error;
  if (structured) return String(structured).replace(/\s+/g, ' ').slice(0, 4000);

  const meaningful = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !STDERR_NOISE.test(l));

  return (meaningful.pop() ?? `exited with code ${code}`).slice(0, 4000);
}

app.get('/api/roster', (_req, res) => {
  res.json({
    agents: loadRoster(),
    repoRoot: REPO_ROOT,
    transcriptDir: TRANSCRIPT_DIR,
    maxConcurrent: MAX_CONCURRENT,
    approveClearance: APPROVE_CLEARANCE,
    zones: loadZones(),
  });
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  for (const event of recent) send(event);
  res.write(': connected\n\n');

  bus.on('event', send);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off('event', send);
  });
});

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

app.get('/api/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  res.json({ sessions: history.list(limit), totalCostUsd: history.totalCostUsd() });
});

app.get('/api/history/:sessionId', (req, res) => {
  const detail = history.detail(req.params.sessionId);
  if (!detail) return res.status(404).json({ error: 'Unknown session.' });
  res.json(detail);
});

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

/**
 * Launch a Claude Code run and wire its lifecycle to the feed and the log.
 * Used by both a fresh dispatch and an approve (which resumes a session).
 */
function launch({ sessionId, agent, prompt, clearance, phase, resume }) {
  const bin = resolveClaudeBin();

  const args = resume
    ? ['-p', prompt, '--resume', sessionId, '--permission-mode', clearance, '--output-format', 'json']
    : ['-p', prompt, '--agent', agent, '--session-id', sessionId,
       '--permission-mode', clearance, '--output-format', 'json'];

  // Capture the working tree BEFORE the agent runs, so whatever it writes can
  // be attributed to this run exactly rather than taken on the agent's word.
  let beforeSnap = null;
  try {
    beforeSnap = snapshot();
  } catch (err) {
    console.warn(`[bridge] git snapshot failed, diff unavailable: ${err.message}`);
  }

  // argv array, never a shell string — the prompt is user input.
  const child = spawn(bin, args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

  dispatched.set(sessionId, { agent, startedAt: Date.now() });
  running.set(sessionId, child);

  const startedAt = new Date().toISOString();
  history.record({
    type: 'run_start', sessionId, agent, phase, clearance, prompt, ts: startedAt,
  });
  publish({
    kind: 'dispatch_start', sessionId, agent, clearance, phase,
    ts: startedAt, summary: prompt.slice(0, 200),
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });

  // A failed spawn emits BOTH 'error' and 'close', which would report the
  // dispatch twice and walk the sprite to the board twice.
  let settled = false;
  const settle = ({ status, result, costUsd = null, durationMs = null, numTurns = null }) => {
    if (settled) return;
    settled = true;
    running.delete(sessionId);
    stopping.delete(sessionId);

    // Diff even on error or stop: a run that half-finished may still have
    // written something, and that is exactly when you want to know.
    let changes = null;
    try {
      if (beforeSnap) {
        const afterSnap = snapshot();
        changes = changeReport(beforeSnap, afterSnap);
        release(afterSnap);
        // Tag each changed file with its district so the world can light up
        // the rooms a run actually touched.
        for (const file of changes.changed) file.zone = zoneForPath(file.path);
        changes.zones = [...new Set(changes.changed.map((f) => f.zone))];
      }
    } catch (err) {
      console.warn(`[bridge] change report failed: ${err.message}`);
    } finally {
      release(beforeSnap);
      beforeSnap = null;
    }

    const ts = new Date().toISOString();
    history.record({
      type: 'run_end', sessionId, agent, ts, status, result, costUsd, durationMs, numTurns,
      changes,
    });
    publish({
      kind: 'dispatch_result', sessionId, agent, phase, ts,
      ok: status === 'ok', stopped: status === 'stopped',
      status, costUsd, durationMs, numTurns,
      summary: result,
      totalCostUsd: history.totalCostUsd(),
      // Totals only on the event; the full patch is fetched with the detail.
      changedFiles: changes?.totals?.files ?? 0,
      changeTotals: changes?.totals ?? null,
      // Districts to light up in the world.
      changeZones: changes?.zones ?? [],
    });
  };

  child.on('error', (err) => settle({ status: 'error', result: err.message }));

  child.on('close', (code, signal) => {
    const wasStopped = stopping.has(sessionId) || Boolean(signal);
    let result = null;
    try { result = JSON.parse(stdout); } catch { /* non-JSON on crash */ }

    if (wasStopped) return settle({ status: 'stopped', result: 'stopped' });

    const ok = code === 0 && result?.is_error !== true;
    settle({
      status: ok ? 'ok' : 'error',
      result: ok
        ? String(result?.result ?? 'done').replace(/\s+/g, ' ').slice(0, 4000)
        : failureSummary(result, stderr, code),
      costUsd: result?.total_cost_usd ?? null,
      durationMs: result?.duration_ms ?? Date.now() - dispatched.get(sessionId)?.startedAt,
      numTurns: result?.num_turns ?? null,
    });
  });

  return child;
}

app.post('/api/dispatch', (req, res) => {
  const { agent, prompt } = req.body ?? {};

  // The security boundary: only a name that exists in .claude/agents/ may be
  // spawned, and the clearance comes from config, never from the request body.
  const entry = loadRoster().find((a) => a.name === agent);
  if (!entry) return res.status(400).json({ error: `Unknown agent: ${String(agent)}` });
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required.' });
  }

  if (running.size >= MAX_CONCURRENT) {
    return res.status(429).json({
      error: `${MAX_CONCURRENT} dispatches already running. Stop one first.`,
    });
  }

  // One run per agent at a time: two concurrent runs would interleave in the
  // same sprite and make the world lie about what is happening.
  for (const sessionId of running.keys()) {
    if (dispatched.get(sessionId)?.agent === entry.name) {
      return res.status(409).json({ error: `${entry.name} is already working.`, sessionId });
    }
  }

  const sessionId = crypto.randomUUID();
  try {
    launch({
      sessionId, agent: entry.name, prompt,
      clearance: entry.clearance, phase: 'plan', resume: false,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ sessionId, agent: entry.name, clearance: entry.clearance });
});

/**
 * Approve a completed plan-mode run and let it execute.
 *
 * This is the one place clearance escalates, and it requires a deliberate human
 * action on a plan they have read. Verified: `--resume` keeps the session id and
 * inherits the plan, so the agent proceeds with what it already described
 * rather than re-deriving it.
 */
app.post('/api/approve', (req, res) => {
  const { sessionId, prompt } = req.body ?? {};

  const session = history.detail(sessionId);
  if (!session) return res.status(404).json({ error: 'Unknown session.' });
  if (running.has(sessionId)) return res.status(409).json({ error: 'That session is still running.' });

  const last = history.latestRun(sessionId);
  if (!last) return res.status(400).json({ error: 'That session has no completed run.' });
  if (last.status !== 'ok') {
    return res.status(400).json({ error: `Cannot approve a run that ended "${last.status}".` });
  }
  if (last.clearance === APPROVE_CLEARANCE) {
    return res.status(409).json({ error: 'That plan has already been approved.' });
  }

  if (running.size >= MAX_CONCURRENT) {
    return res.status(429).json({ error: `${MAX_CONCURRENT} dispatches already running.` });
  }
  for (const other of running.keys()) {
    if (dispatched.get(other)?.agent === session.agent) {
      return res.status(409).json({ error: `${session.agent} is already working.` });
    }
  }

  try {
    launch({
      sessionId,
      agent: session.agent,
      prompt: typeof prompt === 'string' && prompt.trim()
        ? prompt
        : 'Proceed with the plan you described. Execute it now.',
      clearance: APPROVE_CLEARANCE,
      phase: 'approve',
      resume: true,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ sessionId, agent: session.agent, clearance: APPROVE_CLEARANCE });
});

/**
 * Send a follow-up into a finished session, at PLAN clearance.
 *
 * This is the mission's verb: working *with* an agent rather than firing
 * one-shot prompts at it. Without it a plan that is 80% right leaves you
 * choosing between approving something wrong and starting over, losing all the
 * context the agent just built.
 *
 * Deliberately never escalates: refining a plan is a read-only conversation,
 * and writing stays behind the explicit Approve gate.
 */
app.post('/api/follow-up', (req, res) => {
  const { sessionId, prompt } = req.body ?? {};

  const session = history.detail(sessionId);
  if (!session) return res.status(404).json({ error: 'Unknown session.' });
  if (running.has(sessionId)) return res.status(409).json({ error: 'That session is still running.' });
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A follow-up message is required.' });
  }

  if (running.size >= MAX_CONCURRENT) {
    return res.status(429).json({ error: `${MAX_CONCURRENT} dispatches already running.` });
  }
  for (const other of running.keys()) {
    if (dispatched.get(other)?.agent === session.agent) {
      return res.status(409).json({ error: `${session.agent} is already working.` });
    }
  }

  const entry = loadRoster().find((a) => a.name === session.agent);

  try {
    launch({
      sessionId,
      agent: session.agent,
      prompt,
      clearance: entry?.clearance ?? 'plan',
      phase: 'follow-up',
      resume: true,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ sessionId, agent: session.agent, clearance: entry?.clearance ?? 'plan' });
});

app.get('/api/running', (_req, res) => {
  res.json({
    maxConcurrent: MAX_CONCURRENT,
    running: [...running.keys()].map((sessionId) => ({
      sessionId,
      agent: dispatched.get(sessionId)?.agent ?? null,
      startedAt: dispatched.get(sessionId)?.startedAt ?? null,
      phase: history.latestRun(sessionId)?.phase ?? null,
    })),
  });
});

app.post('/api/stop', (req, res) => {
  const { sessionId } = req.body ?? {};
  const child = running.get(sessionId);
  if (!child) return res.status(404).json({ error: 'No running dispatch with that session id.' });
  stopping.add(sessionId);
  child.kill('SIGTERM');
  // SIGTERM first; escalate if the process ignores it.
  setTimeout(() => {
    if (running.has(sessionId)) child.kill('SIGKILL');
  }, 4000);
  res.json({ stopped: sessionId });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[bridge] http://${HOST}:${PORT}`);
  console.log(`[bridge] repo      ${REPO_ROOT}`);
  console.log(`[bridge] watching  ${TRANSCRIPT_DIR}`);
  try {
    console.log(`[bridge] claude    ${resolveClaudeBin()}`);
  } catch (err) {
    console.warn(`[bridge] claude    NOT FOUND — dispatch disabled\n${err.message}`);
  }
  const names = loadRoster().map((a) => `${a.name}(${a.clearance})`).join(' ');
  console.log(`[bridge] agents    ${names || 'none found'}`);
  // "est." because total_cost_usd is tokens at API list rates regardless of
  // auth mode — on a Claude subscription it is not billed spend.
  console.log(
    `[bridge] history   ${history.sessions.size} past dispatches, ` +
      `~$${history.totalCostUsd().toFixed(4)} est. token cost`,
  );
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[bridge] port ${PORT} is already in use.\n` +
        'Another bridge is probably running. Stop it, or set WORLD_BRIDGE_PORT.',
    );
    process.exit(1);
  }
  throw err;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    // Don't leave billing opus processes orphaned when the bridge goes away.
    for (const [sessionId, child] of running) {
      console.log(`[bridge] stopping dispatch ${sessionId}`);
      child.kill('SIGTERM');
    }
    watcher.stop();
    server.close(() => process.exit(0));
  });
}
