/**
 * agentfs clean — remove AgentFS-managed files from a vault.
 *
 * Default: remove compiled outputs only (CLAUDE.md, .cursor/rules/, .openclaw/,
 *          AGENT-MAP.md, .agentos/os-release, .agentos/memory/INDEX.md)
 * --all:   also remove .agentos/ kernel directory (full uninstall)
 * --dry-run: list files that would be removed without deleting
 * --force:   skip confirmation prompt
 *
 * Safety rules:
 * - Never removes user content outside the managed file list
 * - Always shows a confirmation prompt unless --force is given
 * - Dry-run never modifies anything
 *
 * @module commands/clean
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { CliFlags, printResult, printError } from '../utils/cli-flags.js';

// ---------------------------------------------------------------------------
// Managed file list
// ---------------------------------------------------------------------------

/**
 * Files and directories written by `agentfs compile`.
 * These are safe to remove — they are fully reproducible from `.agentos/`.
 */
const COMPILED_OUTPUTS: ReadonlyArray<string> = [
  'CLAUDE.md',
  '.claude/settings.json',
  '.cursor/rules/agentfs-global.mdc',
  '.openclaw/SOUL.md',
  '.openclaw/IDENTITY.md',
  '.openclaw/AGENTS.md',
  '.openclaw/USER.md',
  '.openclaw/TOOLS.md',
  '.openclaw/SECURITY.md',
  'AGENT-MAP.md',
  '.agentos/memory/INDEX.md',
  '.agentos/os-release',
];

/**
 * Additional paths removed with --all (kernel space).
 */
const KERNEL_PATHS: ReadonlyArray<string> = ['.agentos'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function removeIfExists(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true, force: true });
    } else {
      await fs.unlink(absPath);
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Entry point for `agentfs clean`.
 */
export async function cleanCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;

  // Parse sub-flags from remaining args (cli.ts already strips the subcommand name)
  const args = flags.args;
  const removeAll = args.includes('--all');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  // Collect candidate paths
  const candidates = [...COMPILED_OUTPUTS];
  if (removeAll) {
    candidates.push(...KERNEL_PATHS);
  }

  // Resolve to absolute paths and filter to those that actually exist
  const existing: string[] = [];
  for (const rel of candidates) {
    const abs = path.join(vaultRoot, rel);
    if (await fileExists(abs)) {
      existing.push(rel);
    }
  }

  if (existing.length === 0) {
    printResult(flags, 'Nothing to remove — no AgentFS-managed files found.', { removed: [] });
    return 0;
  }

  // Build human-readable summary
  const label = removeAll ? 'full uninstall (--all)' : 'compiled outputs only';
  let summary = `\nagentfs clean — ${label}\n${'─'.repeat(50)}\n`;
  for (const rel of existing) {
    summary += `  ${dryRun ? '(would remove)' : 'remove'} ${rel}\n`;
  }

  if (dryRun) {
    summary += `\n  ${existing.length} file(s) would be removed (dry-run, nothing deleted)\n`;
    printResult(flags, summary, { dryRun: true, files: existing });
    return 0;
  }

  // Confirmation prompt unless --force
  if (!force && flags.outputFormat !== 'json') {
    process.stdout.write(summary);
    const ok = await confirm(`\nThis will remove ${existing.length} file(s). Continue?`);
    if (!ok) {
      process.stdout.write('Aborted.\n');
      return 1;
    }
  } else if (flags.outputFormat !== 'json') {
    process.stdout.write(summary);
  }

  // Remove files
  const removed: string[] = [];
  const failed: string[] = [];

  for (const rel of existing) {
    const abs = path.join(vaultRoot, rel);
    const ok = await removeIfExists(abs);
    if (ok) {
      removed.push(rel);
    } else {
      failed.push(rel);
    }
  }

  // Clean up empty .openclaw/ and .cursor/rules/ directories if they exist
  for (const dir of ['.openclaw', '.cursor/rules']) {
    const absDir = path.join(vaultRoot, dir);
    try {
      const entries = await fs.readdir(absDir);
      if (entries.length === 0) {
        await fs.rmdir(absDir);
      }
    } catch {
      // ignore
    }
  }

  const resultMsg = failed.length > 0
    ? `Removed ${removed.length} file(s). Failed: ${failed.join(', ')}`
    : `Removed ${removed.length} file(s) successfully.`;

  printResult(flags, `\n✓ ${resultMsg}\n`, { removed, failed });

  if (failed.length > 0) {
    printError(flags, `Failed to remove: ${failed.join(', ')}`, 'CLEAN_PARTIAL_FAILURE');
    return 1;
  }

  return 0;
}
