import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config.js';

/**
 * Districts of the world, derived from the real repository.
 *
 * The point of the pixel form is that *position carries meaning*: an agent
 * standing in the server room tells you what it is touching faster than any
 * list can. That only works if the rooms correspond to the actual codebase, so
 * zones are defined by real paths and each one is only published if it exists
 * on disk.
 *
 * Ordering is deliberate — `matchZone` takes the FIRST match, so specific paths
 * must precede the general ones (`packages/world` before `packages`).
 */

/** @type {{id:string,label:string,tests:(rel:string)=>boolean,probe:string[]}[]} */
const DEFINITIONS = [
  {
    id: 'server',
    label: 'server room',
    probe: ['server.js'],
    tests: (rel) => rel === 'server.js',
  },
  {
    id: 'vault',
    label: 'the vault',
    probe: ['data', 'pokewatch.db'],
    // The DB and anything under data/. Gitignored, but agents still read around it.
    tests: (rel) => rel === 'pokewatch.db' || rel.startsWith('data/') || rel.endsWith('.db'),
  },
  {
    id: 'frontend',
    label: 'frontend floor',
    probe: ['src'],
    tests: (rel) => rel.startsWith('src/'),
  },
  {
    id: 'tests',
    label: 'test bay',
    probe: ['tests', 'playwright.config.js'],
    tests: (rel) => rel.startsWith('tests/') || rel === 'playwright.config.js',
  },
  {
    id: 'deploy',
    label: 'deploy gate',
    probe: ['.github'],
    tests: (rel) => rel.startsWith('.github/'),
  },
  {
    id: 'quarters',
    label: 'agent quarters',
    probe: ['.claude'],
    tests: (rel) => rel.startsWith('.claude/') || rel === 'CLAUDE.md',
  },
  {
    id: 'world',
    label: 'the world',
    probe: ['packages/world'],
    tests: (rel) => rel.startsWith('packages/'),
  },
  {
    id: 'yard',
    label: 'the yard',
    probe: ['package.json'],
    // Repo root: manifests, configs, everything not in a room of its own.
    tests: () => true,
  },
];

function exists(rel) {
  try {
    return fs.existsSync(path.join(REPO_ROOT, rel));
  } catch {
    return false;
  }
}

/** Zones whose real paths are present in this checkout. */
export function loadZones() {
  return DEFINITIONS.filter((z) => z.id === 'yard' || z.probe.some(exists)).map(
    ({ id, label, probe }) => ({ id, label, probe }),
  );
}

const ACTIVE = DEFINITIONS.filter((z) => z.id === 'yard' || z.probe.some(exists));

/**
 * Which district a repo-relative path belongs to.
 * Returns the zone id, or 'yard' as the catch-all.
 */
export function zoneForPath(rel) {
  if (!rel) return null;
  const clean = rel.replace(/^\.\//, '');
  for (const zone of ACTIVE) {
    if (zone.tests(clean)) return zone.id;
  }
  return 'yard';
}

/**
 * Best-effort: pull a repo-relative path out of a tool event summary.
 *
 * Read/Edit/Write summaries are already just a path; Bash summaries are a
 * command line, so the first repo-looking token wins. Returns null when the
 * event says nothing about location, which must leave the agent where it is
 * rather than teleporting it to the catch-all zone.
 */
// Extensions are ordered LONGEST-FIRST and closed with a lookahead: with `js`
// ahead of `jsx`, `src/App.jsx` was being captured as `src/App.js`.
const PATH_LIKE =
  /(?:^|[\s"'`(=])(?:\.\/)?((?:[\w.@-]+\/)*[\w.@-]+\.(?:jsx|json|ya?ml|html|css|csv|txt|js|md|db|sh))(?![\w])/;

export function pathFromSummary(summary, repoRoot = REPO_ROOT) {
  if (!summary) return null;

  // Absolute paths inside the repo -> make relative.
  const absPrefix = `${repoRoot}/`;
  if (summary.startsWith(absPrefix)) return summary.slice(absPrefix.length).split(/\s/)[0];

  const absAnywhere = summary.indexOf(absPrefix);
  if (absAnywhere !== -1) {
    return summary.slice(absAnywhere + absPrefix.length).split(/[\s"'`)]/)[0] || null;
  }

  const m = summary.match(PATH_LIKE);
  if (m?.[1]) return m[1];

  // Directory-shaped mentions (e.g. `ls src/`, `grep -r .claude/`).
  const dir = summary.match(/(?:^|[\s"'`(=])((?:src|tests|data|\.github|\.claude|packages)(?:\/[\w.@-]+)*)\/?/);
  return dir?.[1] ?? null;
}

/** Convenience: the zone a tool event implies, or null if it implies nothing. */
export function zoneForEvent({ tool, summary }) {
  const rel = pathFromSummary(summary);
  if (rel) return zoneForPath(rel);
  // A few tools imply a place even without a path.
  if (tool === 'Skill') return 'quarters';
  return null;
}

export default { loadZones, zoneForPath, pathFromSummary, zoneForEvent };
