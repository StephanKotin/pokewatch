import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, PATCH_MAX_BYTES, PATCH_MAX_FILE_BYTES, SNAPSHOT_MAX_FILE_BYTES } from './config.js';

/**
 * Attribute working-tree changes to a single agent run.
 *
 * An approve run escalates to `acceptEdits` and writes to a repo holding real
 * user data with no migration framework. Until this existed, the only account
 * of what changed was the agent's own prose about what it did — self-reported.
 *
 * Attribution must be EXACT, which is why this keeps a copy of the before-state
 * rather than diffing against HEAD. This repo always carries unrelated dirty
 * files (`.gitignore`, `.claude/*`), and a HEAD diff folds all of that into the
 * agent's patch: a one-line edit to `.gitignore` reported as +15/-4.
 *
 * Secrets come out for free: `git status` honours .gitignore, and this project
 * ignores `.env` and `*.db`, so neither can ever reach a rendered patch.
 */

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

/**
 * `git diff --no-index` exits 1 when files DIFFER, exactly like plain `diff`.
 * Treating that as failure silently discarded every patch.
 */
function safeGit(args, opts) {
  try {
    return git(args, opts);
  } catch (err) {
    return typeof err?.stdout === 'string' ? err.stdout : '';
  }
}

function hashFile(abs) {
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return null;
    if (stat.size > SNAPSHOT_MAX_FILE_BYTES) return `big:${stat.size}:${stat.mtimeMs}`;
    return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  } catch {
    return null; // missing / unreadable => treated as absent
  }
}

/**
 * Every path git considers interesting (modified, staged, or untracked).
 * Ignored paths never appear, which is what keeps .env and *.db out.
 */
function candidatePaths() {
  const out = new Set();
  for (const line of safeGit(['status', '--porcelain=v1', '-uall', '-z']).split('\0')) {
    if (!line) continue;
    let p = line.slice(3);
    const arrow = p.indexOf(' -> '); // renames
    if (arrow !== -1) p = p.slice(arrow + 4);
    if (p) out.add(p);
  }
  return out;
}

/**
 * Hashes of every candidate path, plus an on-disk copy of their contents so a
 * later diff can be exact. The copy lives in a temp dir; call release() when
 * the report is done.
 */
export function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-snap-'));
  const files = {};
  let copied = 0;

  for (const rel of candidatePaths()) {
    const abs = path.join(REPO_ROOT, rel);
    files[rel] = hashFile(abs);
    if (files[rel] === null) continue;

    try {
      const stat = fs.statSync(abs);
      if (stat.size > SNAPSHOT_MAX_FILE_BYTES) continue; // too big to mirror
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
      copied += 1;
    } catch {
      /* unreadable; the hash already records it as absent-ish */
    }
  }

  return { dir, files, copied, head: safeGit(['rev-parse', 'HEAD']).trim() || null,
           branch: safeGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim() || null };
}

export function release(snap) {
  if (!snap?.dir) return;
  try {
    fs.rmSync(snap.dir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

/**
 * Paths whose content differs between two snapshots. A file dirty both before
 * and after with the same hash is pre-existing mess, not this run's work.
 */
export function changedBetween(before, after) {
  const changed = [];
  const paths = new Set([...Object.keys(before?.files ?? {}), ...Object.keys(after?.files ?? {})]);

  for (const p of paths) {
    const a = before?.files?.[p] ?? null;
    const b = after?.files?.[p] ?? null;
    if (a === b) continue;
    changed.push({ path: p, change: a === null ? 'added' : b === null ? 'deleted' : 'modified' });
  }

  changed.sort((x, y) => x.path.localeCompare(y.path));
  return changed;
}

const DEV_NULL = '/dev/null';

/** before-copy vs working tree — never HEAD, so only this run's edits appear. */
function sides(before, rel, change) {
  const beforeCopy = before?.dir ? path.join(before.dir, rel) : null;
  const current = path.join(REPO_ROOT, rel);
  const haveBefore = Boolean(beforeCopy && fs.existsSync(beforeCopy));

  if (change === 'added' || !haveBefore) return [DEV_NULL, current];
  if (change === 'deleted') return [beforeCopy, DEV_NULL];
  return [beforeCopy, current];
}

/**
 * `--no-index` puts absolute temp/repo paths in the headers (and git adds its
 * own `a/`/`b/` prefixes on top). Rewrite those three header lines to the
 * repo-relative path rather than patching strings inside them, which produced
 * doubled prefixes like `aa/.gitignore`.
 */
function tidyHeaders(text, rel) {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('diff --git ')) return `diff --git a/${rel} b/${rel}`;
      if (line.startsWith('--- ')) return line.includes('/dev/null') ? '--- /dev/null' : `--- a/${rel}`;
      if (line.startsWith('+++ ')) return line.includes('/dev/null') ? '+++ /dev/null' : `+++ b/${rel}`;
      return line;
    })
    .join('\n');
}

function numstatFor(before, rel, change) {
  const [a, b] = sides(before, rel, change);
  const line = safeGit(['diff', '--numstat', '--no-color', '--no-ext-diff', '--no-index', a, b])
    .trim()
    .split('\n')[0] ?? '';
  const [added, removed] = line.split('\t');
  // Binary files report "-\t-".
  return { added: Number(added) || 0, removed: Number(removed) || 0 };
}

function patchFor(before, rel, change) {
  const [a, b] = sides(before, rel, change);
  let text = tidyHeaders(safeGit(['diff', '--no-color', '--no-ext-diff', '--no-index', a, b]), rel);
  if (text.length > PATCH_MAX_FILE_BYTES) {
    text = `${text.slice(0, PATCH_MAX_FILE_BYTES)}\n… patch truncated (${text.length} bytes)\n`;
  }
  return text;
}

/** Full change report for one run: which files, the diffstat, and a bounded patch. */
export function changeReport(before, after) {
  const changed = changedBetween(before, after);
  if (changed.length === 0) {
    return { changed: [], totals: { files: 0, added: 0, removed: 0 }, patch: '', truncated: false,
             branch: after?.branch ?? null };
  }

  let added = 0;
  let removed = 0;
  const files = [];
  let patch = '';
  let truncated = false;

  for (const entry of changed) {
    const counts = numstatFor(before, entry.path, entry.change);
    added += counts.added;
    removed += counts.removed;
    files.push({ ...entry, ...counts });

    if (patch.length < PATCH_MAX_BYTES) patch += patchFor(before, entry.path, entry.change);
    else truncated = true;
  }

  if (patch.length > PATCH_MAX_BYTES) {
    patch = patch.slice(0, PATCH_MAX_BYTES);
    truncated = true;
  }

  return { changed: files, totals: { files: files.length, added, removed }, patch, truncated,
           branch: after?.branch ?? null };
}

export default { snapshot, release, changedBetween, changeReport };
