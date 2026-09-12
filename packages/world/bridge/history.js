import fs from 'node:fs';
import path from 'node:path';
import { HISTORY_FILE, TIMELINE_CAP, HISTORY_MAX_BYTES, HISTORY_KEEP_SESSIONS } from './config.js';

/**
 * Durable record of dispatches, so a page reload doesn't lose what your agents
 * did and "what did I ask this morning" is answerable.
 *
 * Append-only JSONL, reconstructed into sessions in memory on boot.
 *
 * ONLY dispatched sessions are persisted. Your own interactive sessions stream
 * through the world live but are never written here: they are continuous and
 * unbounded, and this file would become a shadow copy of your transcripts.
 */

/** @typedef {'running'|'ok'|'error'|'stopped'} RunStatus */

export class History {
  constructor(file = HISTORY_FILE) {
    this.file = file;
    /** @type {Map<string, any>} */
    this.sessions = new Map();
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return this;
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        this.#apply(JSON.parse(line));
      } catch {
        /* skip a torn line rather than refuse to boot */
      }
    }
    // A dispatch that was mid-flight when the bridge died is not running now.
    for (const session of this.sessions.values()) {
      for (const run of session.runs) {
        if (run.status === 'running') {
          run.status = 'error';
          run.result = run.result ?? 'bridge stopped while this run was in flight';
        }
      }
    }
    return this;
  }

  /** Persist and fold one record into memory. */
  record(entry) {
    this.#apply(entry);
    try {
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
      this.#rotateIfNeeded();
    } catch (err) {
      console.warn(`[bridge] could not write history: ${err.message}`);
    }
  }

  /**
   * Keep the log bounded.
   *
   * Compacts rather than truncates: the newest sessions are rewritten from
   * memory as a fresh event stream, so the file stays replayable. A plain
   * head/tail cut could split a session's run_start from its run_end and leave
   * a permanently "running" ghost on every future boot.
   */
  #rotateIfNeeded() {
    let size = 0;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return;
    }
    if (size <= HISTORY_MAX_BYTES) return;

    const keep = [...this.sessions.values()]
      .sort((a, b) => String(b.runs[0]?.startedAt ?? '').localeCompare(String(a.runs[0]?.startedAt ?? '')))
      .slice(0, HISTORY_KEEP_SESSIONS)
      .reverse(); // oldest first, so replay rebuilds in order

    const lines = [];
    for (const session of keep) {
      for (const run of session.runs) {
        lines.push(JSON.stringify({
          type: 'run_start', sessionId: session.sessionId, agent: session.agent,
          phase: run.phase, clearance: run.clearance, prompt: run.prompt, ts: run.startedAt,
        }));
        if (run.status !== 'running') {
          lines.push(JSON.stringify({
            type: 'run_end', sessionId: session.sessionId, agent: session.agent,
            ts: run.endedAt, status: run.status, result: run.result,
            costUsd: run.costUsd, durationMs: run.durationMs, numTurns: run.numTurns,
            changes: run.changes,
          }));
        }
      }
      for (const t of session.timeline) {
        lines.push(JSON.stringify({
          type: 'activity', sessionId: session.sessionId, agent: session.agent,
          ts: t.ts, tool: t.tool, summary: t.summary, isSidechain: t.isSidechain,
        }));
      }
    }

    const dropped = this.sessions.size - keep.length;
    fs.writeFileSync(this.file, lines.length ? `${lines.join('\n')}\n` : '');
    this.sessions = new Map();
    for (const line of lines) this.#apply(JSON.parse(line));
    console.log(`[bridge] history compacted: kept ${keep.length} sessions, dropped ${dropped}`);
  }

  #session(sessionId, agent) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { sessionId, agent: agent ?? null, timeline: [], runs: [], truncated: false };
      this.sessions.set(sessionId, session);
    }
    if (agent && !session.agent) session.agent = agent;
    return session;
  }

  #apply(entry) {
    const session = this.#session(entry.sessionId, entry.agent);

    switch (entry.type) {
      case 'run_start':
        session.runs.push({
          phase: entry.phase,
          clearance: entry.clearance,
          prompt: entry.prompt,
          startedAt: entry.ts,
          endedAt: null,
          status: 'running',
          costUsd: null,
          durationMs: null,
          numTurns: null,
          result: null,
        });
        break;

      case 'run_end': {
        const run = session.runs[session.runs.length - 1];
        if (!run) break;
        run.endedAt = entry.ts;
        run.status = entry.status;
        run.costUsd = entry.costUsd ?? null;
        run.durationMs = entry.durationMs ?? null;
        run.numTurns = entry.numTurns ?? null;
        run.result = entry.result ?? null;
        // What this run actually did to the working tree, measured rather than
        // taken from the agent's own account of itself.
        run.changes = entry.changes ?? null;
        break;
      }

      case 'activity':
        // Bounded: a runaway agent must not grow this file without limit.
        if (session.timeline.length >= TIMELINE_CAP) {
          session.truncated = true;
          break;
        }
        session.timeline.push({
          ts: entry.ts,
          tool: entry.tool,
          summary: entry.summary,
          isSidechain: Boolean(entry.isSidechain),
        });
        break;
    }
  }

  /** Should this activity entry be written? Only inside a known dispatch. */
  tracks(sessionId) {
    return this.sessions.has(sessionId);
  }

  latestRun(sessionId) {
    const runs = this.sessions.get(sessionId)?.runs;
    return runs?.[runs.length - 1] ?? null;
  }

  isRunning(sessionId) {
    return this.latestRun(sessionId)?.status === 'running';
  }

  /**
   * Newest first. The timeline and the diff PATCHES are omitted — a patch runs
   * to tens of kilobytes, and the list is fetched on every refresh. Change
   * totals survive so the list can still show "3 files changed"; the patch
   * itself comes from detail().
   */
  list(limit = 40) {
    return [...this.sessions.values()]
      .sort((a, b) => String(b.runs[0]?.startedAt ?? '').localeCompare(String(a.runs[0]?.startedAt ?? '')))
      .slice(0, limit)
      .map(({ timeline, runs, ...rest }) => ({
        ...rest,
        timelineCount: timeline.length,
        runs: runs.map((run) => ({
          ...run,
          changes: run.changes
            ? { totals: run.changes.totals, changed: run.changes.changed, truncated: run.changes.truncated }
            : null,
        })),
      }));
  }

  detail(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  /** Total spend across every recorded run. */
  totalCostUsd() {
    let total = 0;
    for (const session of this.sessions.values()) {
      for (const run of session.runs) total += run.costUsd ?? 0;
    }
    return total;
  }
}

export default History;
