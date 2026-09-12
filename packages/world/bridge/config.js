import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** packages/world/bridge -> packages/world -> packages -> repo root */
export const REPO_ROOT = path.resolve(here, '../../..');

/**
 * Claude Code encodes a project's cwd into a directory name by replacing every
 * non-alphanumeric character with a dash:
 *   /Users/stephankotin/pokewatch -> -Users-stephankotin-pokewatch
 */
export function transcriptDirFor(projectPath) {
  return path.join(
    os.homedir(),
    '.claude',
    'projects',
    projectPath.replace(/[^a-zA-Z0-9]/g, '-'),
  );
}

export const TRANSCRIPT_DIR = transcriptDirFor(REPO_ROOT);

export const AGENTS_DIR = path.join(REPO_ROOT, '.claude', 'agents');

/**
 * Loopback only. Transcripts contain file contents and prompts.
 *
 * 8787 deliberately sits far from Vite's 5173+ range. They previously collided:
 * the bridge held IPv4 127.0.0.1:5174 while Vite took IPv6 [::1]:5174, so both
 * "worked" while the proxy hit whichever stack resolved first.
 */
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.WORLD_BRIDGE_PORT) || 8787;

/**
 * Default clearance for every dispatch. `plan` lets an agent read, search and
 * reason, but it cannot edit files or commit. Raise an individual agent here
 * once you trust the loop — this is the only place that decides.
 */
export const DEFAULT_CLEARANCE = 'plan';

/** @type {Record<string, 'plan'|'acceptEdits'>} */
export const CLEARANCE_OVERRIDES = {
  // backend: 'acceptEdits',
  // frontend: 'acceptEdits',
};

const VALID_CLEARANCES = new Set(['plan', 'acceptEdits']);

export function clearanceFor(agentName) {
  const override = CLEARANCE_OVERRIDES[agentName];
  if (override && VALID_CLEARANCES.has(override)) return override;
  return DEFAULT_CLEARANCE;
}

/** How many recent events a newly-connected client gets replayed. */
export const REPLAY_LIMIT = 200;

/** Durable dispatch log. Gitignored; dispatch sessions only, never your own. */
export const HISTORY_FILE = path.join(here, '..', '.world', 'history.jsonl');

/** Max activity entries kept per session, so one runaway agent can't grow the log without bound. */
export const TIMELINE_CAP = 300;

/** Compact the dispatch log past this size, keeping the newest sessions. */
export const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
export const HISTORY_KEEP_SESSIONS = 60;

/**
 * How many dispatches may run at once. Each is a real billing process, so the
 * cap is a guard against a handful of clicks becoming a handful of opus agents.
 * Env-overridable so the limit can be exercised without paying for N agents.
 */
export const MAX_CONCURRENT = Number(process.env.WORLD_MAX_CONCURRENT) || 3;

/** Clearance an approved plan is re-run with. */
export const APPROVE_CLEARANCE = 'acceptEdits';

/** Bounds on the working-tree patch attributed to a run. */
export const PATCH_MAX_BYTES = 80 * 1024;
export const PATCH_MAX_FILE_BYTES = 24 * 1024;

/** Files above this are hashed by size+mtime and not mirrored for diffing. */
export const SNAPSHOT_MAX_FILE_BYTES = 512 * 1024;

/** Max characters of any tool summary forwarded to the browser. */
export const SUMMARY_MAX = 120;
