import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { TRANSCRIPT_DIR, SUMMARY_MAX } from './config.js';

/**
 * Tail Claude Code session transcripts and emit normalized, redacted events.
 *
 * Transcripts are append-only JSONL and reach several MB, so each file carries a
 * byte offset and only the newly appended tail is ever parsed. A restart starts
 * at end-of-file: the world shows what happens from now on, not a replay of
 * every session ever recorded.
 *
 * REDACTION IS THE POINT OF THIS FILE. A transcript line holds full file
 * contents, full prompts, command output and occasionally credentials. Nothing
 * reaches the browser except a short summary built from a per-tool allowlist.
 */

/** Per tool, the single input field that is safe and useful to show. */
const SUMMARY_FIELD = {
  Bash: (i) => i.command,
  Read: (i) => i.file_path,
  Edit: (i) => i.file_path,
  Write: (i) => i.file_path,
  NotebookEdit: (i) => i.notebook_path,
  Glob: (i) => i.pattern,
  Grep: (i) => i.pattern,
  WebFetch: (i) => i.url,
  WebSearch: (i) => i.query,
  Skill: (i) => i.skill,
  Task: (i) => [i.subagent_type, i.description].filter(Boolean).join(' — '),
  TodoWrite: () => 'updating todos',
  AskUserQuestion: () => 'asking a question',
  ExitPlanMode: () => 'presenting a plan',
};

/**
 * Second line of defence. The per-tool allowlist already excludes command
 * *output*, but an input can still carry a credential inline — a Bash command
 * with an Authorization header, a URL with a token in the query string. Redact
 * anything that looks like a key before it leaves the process.
 */
const SECRET_PATTERNS = [
  /\b(sk|pk|rk|whsec|ey)_[A-Za-z0-9_-]{8,}/g, // Stripe-style and JWT-ish keys
  /\bghp_[A-Za-z0-9]{16,}/g, // GitHub tokens
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b[A-Za-z0-9_-]*(?:TOKEN|SECRET|PASSWORD|API_?KEY)[A-Za-z0-9_-]*\s*=\s*\S+/gi,
  /-----BEGIN[^-]*PRIVATE KEY-----/g,
];

function scrubSecrets(value) {
  let out = value;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '«redacted»');
  return out;
}

function clip(value) {
  if (typeof value !== 'string') return '';
  const oneLine = scrubSecrets(value.replace(/\s+/g, ' ').trim());
  return oneLine.length > SUMMARY_MAX ? `${oneLine.slice(0, SUMMARY_MAX - 1)}…` : oneLine;
}

function summarize(toolName, input) {
  const pick = SUMMARY_FIELD[toolName];
  // Unknown tool (including MCP tools): show the name only, never the input.
  if (!pick || !input || typeof input !== 'object') return '';
  try {
    return clip(pick(input));
  } catch {
    return '';
  }
}

/**
 * Turn one transcript line into zero or more world events.
 * Anything not explicitly handled produces nothing.
 */
function normalize(line) {
  const events = [];
  const base = {
    sessionId: line.sessionId,
    uuid: line.uuid,
    parentUuid: line.parentUuid ?? null,
    ts: line.timestamp ?? new Date().toISOString(),
    isSidechain: Boolean(line.isSidechain),
    gitBranch: line.gitBranch ?? null,
    slug: line.slug ?? null,
  };

  const content = line.message?.content;

  if (line.type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      // Assistant prose is deliberately NOT forwarded. It is the one field with
      // no structure to constrain it, and the world renders tool activity, not
      // narration. Bubbles stay on the allowlisted tool summaries.
      if (block?.type === 'tool_use') {
        const isTask = block.name === 'Task';
        events.push({
          ...base,
          kind: isTask ? 'task_spawn' : 'tool_use',
          tool: block.name,
          toolUseId: block.id ?? null,
          // Structured so the client can render a helper sprite without having
          // to parse it back out of the display summary.
          subagentType: isTask ? (block.input?.subagent_type ?? null) : null,
          summary: summarize(block.name, block.input),
        });
      }
    }
    return events;
  }

  if (line.type === 'user' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type !== 'tool_result') continue;
      // `toolUseResult` holds the FULL output. Only its shape is forwarded.
      const isError = block.is_error === true;
      events.push({
        ...base,
        kind: 'tool_result',
        tool: null,
        toolUseId: block.tool_use_id ?? null,
        ok: !isError,
        summary: isError ? 'error' : 'ok',
      });
    }
  }

  return events;
}

export class TranscriptWatcher extends EventEmitter {
  constructor(dir = TRANSCRIPT_DIR) {
    super();
    this.dir = dir;
    this.offsets = new Map();
    this.watcher = null;
    this.pending = false;
  }

  start() {
    fs.mkdirSync(this.dir, { recursive: true });

    // Start at end-of-file for everything that already exists.
    for (const file of this.#transcripts()) {
      this.offsets.set(file, this.#sizeOf(file));
    }

    this.watcher = fs.watch(this.dir, () => this.#schedule());
    // fs.watch on macOS coalesces aggressively; a slow poll is the safety net.
    this.poll = setInterval(() => this.#schedule(), 1000);
    this.poll.unref?.();
    return this;
  }

  stop() {
    this.watcher?.close();
    clearInterval(this.poll);
  }

  #transcripts() {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(this.dir, f));
    } catch {
      return [];
    }
  }

  #sizeOf(file) {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }

  /** Coalesce the burst of fs events a single append produces. */
  #schedule() {
    if (this.pending) return;
    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      this.#drain();
    }, 60);
  }

  #drain() {
    for (const file of this.#transcripts()) {
      const size = this.#sizeOf(file);
      const offset = this.offsets.get(file) ?? 0;

      if (size === offset) continue;
      if (size < offset) {
        // Truncated or replaced underneath us — resync rather than emit garbage.
        this.offsets.set(file, size);
        continue;
      }

      let buf;
      try {
        const fd = fs.openSync(file, 'r');
        buf = Buffer.alloc(size - offset);
        const read = fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        if (read < buf.length) buf = buf.subarray(0, read);
      } catch {
        continue;
      }

      // Find the line boundary in BYTES, not in decoded characters. These
      // transcripts are full of multi-byte UTF-8 ("Pokémon", em dashes), and a
      // read can land mid-character while the writer is appending — decoding
      // first would turn that tail into U+FFFD and desync the byte offset.
      const lastNewline = buf.lastIndexOf(0x0a);
      if (lastNewline === -1) continue;

      const complete = buf.subarray(0, lastNewline + 1);
      this.offsets.set(file, offset + complete.length);

      for (const raw of complete.toString('utf8').split('\n')) {
        if (!raw.trim()) continue;
        let line;
        try {
          line = JSON.parse(raw);
        } catch {
          continue;
        }
        for (const event of normalize(line)) this.emit('event', event);
      }
    }
  }
}

export { normalize, summarize };
export default TranscriptWatcher;
