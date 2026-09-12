import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR, clearanceFor } from './config.js';

/**
 * Read the agent roster from .claude/agents/*.md.
 *
 * Deliberately read from disk rather than hardcoded: dropping a fifth agent
 * definition into .claude/agents/ puts a fifth NPC in the world with no code
 * change here or in the client.
 *
 * The frontmatter these files use is a flat `key: value` block — no nesting, no
 * lists, no anchors — so a tiny parser beats taking a YAML dependency.
 */

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;

  const block = text.slice(3, end);
  const out = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** "Bash, Read, Grep" -> ['Bash','Read','Grep']; absent means "all tools". */
function parseTools(value) {
  if (!value) return null;
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function loadRoster() {
  let files;
  try {
    files = fs.readdirSync(AGENTS_DIR);
  } catch {
    return [];
  }

  const agents = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue;

    let raw;
    try {
      raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    } catch {
      continue;
    }

    const fm = parseFrontmatter(raw);
    if (!fm?.name) continue;

    const tools = parseTools(fm.tools);

    agents.push({
      name: fm.name,
      description: fm.description ?? '',
      model: fm.model ?? 'inherit',
      tools,
      // No `tools:` key means the agent inherits ALL tools, which includes
      // Edit/Write — that is the opposite of read-only. Only an explicit list
      // without Edit/Write earns the badge.
      readOnly: tools !== null && !tools.some((t) => t === 'Edit' || t === 'Write'),
      clearance: clearanceFor(fm.name),
    });
  }

  // Stable order so desks don't shuffle between reloads.
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

export default loadRoster;
