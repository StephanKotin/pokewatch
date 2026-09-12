import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Locate the Claude Code CLI.
 *
 * On this machine it ships inside the VS Code extension and is NOT on PATH —
 * there is no global npm install. The extension directory carries the version in
 * its name and several versions co-exist, so resolve by glob + version sort
 * rather than hardcoding a path that dies on the next extension update.
 */

const EXT_DIRS = [
  path.join(os.homedir(), '.vscode', 'extensions'),
  path.join(os.homedir(), '.vscode-insiders', 'extensions'),
  path.join(os.homedir(), '.cursor', 'extensions'),
];

const PATH_CANDIDATES = [
  path.join(os.homedir(), '.claude', 'local', 'claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
];

/** "2.1.268" -> [2, 1, 268]; missing/short segments sort low. */
function versionKey(name) {
  const m = name.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function compareVersions(a, b) {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < 3; i += 1) {
    if (ka[i] !== kb[i]) return kb[i] - ka[i]; // descending
  }
  return b.localeCompare(a);
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

let cached = null;

export function resolveClaudeBin() {
  if (cached) return cached;

  const override = process.env.WORLD_CLAUDE_BIN;
  if (override) {
    if (!isExecutable(override)) {
      throw new Error(
        `WORLD_CLAUDE_BIN is set to "${override}" but that is not an executable file.`,
      );
    }
    cached = override;
    return cached;
  }

  for (const candidate of PATH_CANDIDATES) {
    if (isExecutable(candidate)) {
      cached = candidate;
      return cached;
    }
  }

  for (const extDir of EXT_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(extDir);
    } catch {
      continue;
    }
    const matches = entries
      .filter((name) => name.startsWith('anthropic.claude-code-'))
      .sort(compareVersions);

    for (const name of matches) {
      const bin = path.join(extDir, name, 'resources', 'native-binary', 'claude');
      if (isExecutable(bin)) {
        cached = bin;
        return cached;
      }
    }
  }

  throw new Error(
    'Could not find the Claude Code CLI.\n' +
      'Looked on PATH-like locations and inside the VS Code extension directories:\n' +
      EXT_DIRS.map((d) => `  ${d}/anthropic.claude-code-*/resources/native-binary/claude`).join('\n') +
      '\nSet WORLD_CLAUDE_BIN to the binary if it lives somewhere else.',
  );
}

export default resolveClaudeBin;
