/**
 * Filesystem Generator — creates the vault directory structure for AgentFS.
 *
 * Produces all FHS-mapped user space directories (profile-dependent) plus the
 * fixed kernel space tree under `.agentos/`. Directories that already exist
 * are counted as skipped rather than overwritten, ensuring idempotent behaviour.
 *
 * @module generators/filesystem
 * @see docs/architecture.md Section 1 "Three-layer architecture"
 * @see docs/architecture.md Section 11 "FHS Mapping"
 */

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { SetupAnswers, GeneratorResult, FhsPaths } from '../types/index.js';
import { getDefaultPaths } from '../utils/fhs-mapping.js';

// ---------------------------------------------------------------------------
// Kernel space directories — fixed for every vault regardless of profile.
// ---------------------------------------------------------------------------

/**
 * Relative paths (from vault root) for every kernel space directory that must
 * exist under `.agentos/`. Order is irrelevant — all are created with
 * `recursive: true`.
 */
const KERNEL_DIRS: readonly string[] = [
  '.agentos/init.d',
  '.agentos/compile.d',
  '.agentos/security/profiles',
  '.agentos/security/audit',
  '.agentos/cron.d',
  '.agentos/proc/signals',
  '.agentos/proc/locks',
  '.agentos/memory/episodic',
  '.agentos/memory/procedural',
  '.agentos/hooks',
  '.agentos/bin',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the filesystem entry at `absPath` already exists
 * (whether a directory or a file). Returns `false` on ENOENT; re-throws any
 * other OS error to avoid silently masking permission problems.
 */
async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

/**
 * Attempts to create a single directory (and any missing ancestors via
 * `recursive: true`). Resolves with `'created'` when the directory was new,
 * or `'skipped'` when it already existed before the call.
 *
 * @param absPath - Absolute path to the directory to create.
 * @returns Whether the directory was freshly created or already present.
 */
async function ensureDir(absPath: string): Promise<'created' | 'skipped'> {
  const existed = await pathExists(absPath);
  await mkdir(absPath, { recursive: true });
  return existed ? 'skipped' : 'created';
}

// ---------------------------------------------------------------------------
// User-space path derivation
// ---------------------------------------------------------------------------

/**
 * Derives the set of unique vault-relative directory strings from an
 * `FhsPaths` instance, filtering out any `undefined` optional paths.
 *
 * `FhsPaths` values are vault-relative strings (e.g. `'Inbox'`, `'Projects'`).
 * De-duplication is applied because some profiles (e.g. `shared`) collapse
 * two FHS keys onto the same vault directory (e.g. `srv` and `usr_share`
 * both resolve to `'Shared'`).
 *
 * @param paths - Resolved FHS paths for the chosen profile.
 * @returns Array of unique vault-relative directory paths to create.
 */
function userSpaceDirs(paths: FhsPaths): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of Object.values(paths)) {
    if (typeof value === 'string' && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generates the complete vault directory structure for a new AgentFS vault.
 *
 * Creates two categories of directories under `answers.targetDir`:
 *
 * 1. **User space** — FHS-mapped directories derived from `answers.profile`
 *    via `getDefaultPaths()`. These vary per profile (e.g. `personal` gets
 *    `Work/`, `Career/`, `Engineering/`; `company` gets `Teams/`, `Clients/`).
 *
 * 2. **Kernel space** — The fixed `.agentos/` subtree required by every vault:
 *    `init.d/`, `compile.d/`, `security/profiles/`, `security/audit/`,
 *    `cron.d/`, `proc/signals/`, `proc/locks/`, `memory/episodic/`,
 *    `memory/procedural/`, `hooks/`, and `bin/`.
 *
 * All directories are created with `mkdir({ recursive: true })`, making the
 * operation safe to re-run on an existing vault. Already-present directories
 * are recorded in `result.skipped`; newly created ones in `result.created`.
 * Both lists contain absolute paths.
 *
 * @param answers - Collected setup wizard answers. `answers.targetDir` is the
 *   vault root; `answers.profile` drives the user-space layout.
 * @returns A `GeneratorResult` with absolute paths split into `created` and
 *   `skipped` lists.
 *
 * @example
 * ```ts
 * const result = await generateFilesystem({
 *   vaultName: 'my-notes',
 *   ownerName: 'Alice',
 *   profile: 'personal',
 *   primaryAgent: 'claude',
 *   supportedAgents: ['claude'],
 *   modules: [],
 *   targetDir: '/home/alice/my-notes',
 * });
 * console.log(result.created.length); // number of newly created dirs
 * ```
 */
export async function generateFilesystem(answers: SetupAnswers): Promise<GeneratorResult> {
  const { targetDir, profile } = answers;

  const fhsPaths = getDefaultPaths(profile);
  const userDirs = userSpaceDirs(fhsPaths);

  // Combine user-space relative paths with kernel-space relative paths.
  const allRelativeDirs: string[] = [...userDirs, ...KERNEL_DIRS];

  const result: GeneratorResult = {
    created: [],
    skipped: [],
  };

  // Process all directories concurrently — mkdir with recursive:true is safe
  // to run in parallel because parent creation races are handled by the OS.
  await Promise.all(
    allRelativeDirs.map(async (relPath) => {
      const absPath = join(targetDir, relPath);
      const outcome = await ensureDir(absPath);
      result[outcome].push(absPath);
    }),
  );

  return result;
}
