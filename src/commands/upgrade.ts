/**
 * `agentfs upgrade` command — detect vault schema drift and apply migrations.
 *
 * Flow:
 * 1. Verify `.agentos/` exists.
 * 2. Read `.agentos/os-release`.
 *    - Missing (v0 vault): create missing kernel dirs + os-release + run compile.
 *    - Present, up to date: report no-op.
 *    - Present, outdated: run ordered migrations.
 *    - Present, newer than CLI: error.
 * 3. After migrations update os-release VERSION + LAST_UPGRADE.
 *
 * Flags:
 *   --dry-run   Show what would change without writing.
 *   --check     Exit 0 (up to date) or 1 (needs upgrade). No output written.
 *   --force     Skip confirmation prompt (currently always non-interactive).
 *
 * @module commands/upgrade
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CliFlags, printError, printResult } from '../utils/cli-flags.js';
import { readOsRelease, generateOsRelease, formatOsRelease } from '../generators/os-release.js';
import { CURRENT_SCHEMA_VERSION, getMigrationsForRange } from '../migrations/index.js';
import { CLI_VERSION } from '../utils/version.js';

// ---------------------------------------------------------------------------
// Kernel dirs — imported inline to avoid circular dependency with filesystem.ts
// which depends on types/index.js and FHS mapping. We only need the dir list.
// ---------------------------------------------------------------------------

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

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

/** Parse --dry-run / --check / --force from flags.args. */
function parseUpgradeArgs(flags: CliFlags): { dryRun: boolean; checkOnly: boolean; force: boolean } {
  const args = flags.args;
  return {
    dryRun: args.includes('--dry-run'),
    checkOnly: args.includes('--check'),
    force: args.includes('--force'),
  };
}

// ---------------------------------------------------------------------------
// v0 vault handler
// ---------------------------------------------------------------------------

/**
 * Handle a vault that exists but has no os-release (created before versioning).
 *
 * - Creates any missing kernel directories.
 * - Generates os-release at CURRENT_SCHEMA_VERSION.
 * - Generates memory INDEX.md if missing.
 *
 * @returns List of relative paths created.
 */
async function upgradeV0Vault(vaultRoot: string, dryRun: boolean): Promise<string[]> {
  const created: string[] = [];

  // Ensure all kernel directories exist.
  for (const relDir of KERNEL_DIRS) {
    const absDir = path.join(vaultRoot, relDir);
    if (!(await pathExists(absDir))) {
      if (!dryRun) {
        await fs.mkdir(absDir, { recursive: true });
      }
      created.push(relDir);
    }
  }

  // Generate os-release.
  const osReleasePath = path.join(vaultRoot, '.agentos', 'os-release');
  if (!(await pathExists(osReleasePath))) {
    if (!dryRun) {
      // generateOsRelease is idempotent; call it directly.
      await generateOsRelease(vaultRoot);
    }
    created.push('.agentos/os-release');
  }

  // Generate memory INDEX.md if missing.
  const memoryIndexPath = path.join(vaultRoot, '.agentos', 'memory', 'INDEX.md');
  if (!(await pathExists(memoryIndexPath))) {
    if (!dryRun) {
      const { generateMemoryIndex } = await import('../memory/memory-index.js');
      const { writeOutputs } = await import('../compilers/base.js');
      const output = await generateMemoryIndex(vaultRoot);
      await writeOutputs([output], vaultRoot, false);
    }
    created.push('.agentos/memory/INDEX.md');
  }

  return created;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs upgrade` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function upgradeCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const { dryRun, checkOnly } = parseUpgradeArgs(flags);

  // -------------------------------------------------------------------------
  // 1. Verify .agentos/ exists.
  // -------------------------------------------------------------------------

  const agentosDir = path.join(vaultRoot, '.agentos');
  if (!(await pathExists(agentosDir))) {
    printError(flags, 'No vault found. Run `npx create-agentfs` to scaffold a new vault.', 'VAULT_NOT_FOUND');
    return 1;
  }

  // -------------------------------------------------------------------------
  // 2. Read os-release.
  // -------------------------------------------------------------------------

  const osRelease = await readOsRelease(vaultRoot);

  // -------------------------------------------------------------------------
  // 3a. v0 vault — no os-release file at all.
  // -------------------------------------------------------------------------

  if (osRelease === null) {
    if (checkOnly) {
      // Needs upgrade — return exit code 1.
      if (flags.outputFormat === 'human') {
        process.stdout.write('Vault needs upgrade: no os-release found (v0 vault).\n');
      } else {
        printResult(flags, 'Vault needs upgrade', { needsUpgrade: true, reason: 'no os-release (v0 vault)' });
      }
      return 1;
    }

    const created = await upgradeV0Vault(vaultRoot, dryRun);

    // After v0 upgrade, write the os-release with LAST_UPGRADE stamped.
    if (!dryRun) {
      const osReleasePath = path.join(vaultRoot, '.agentos', 'os-release');
      const today = new Date().toISOString().split('T')[0];
      // Re-read to get VAULT_CREATED that was written by generateOsRelease.
      const written = await readOsRelease(vaultRoot);
      const updated = {
        NAME: written?.NAME ?? 'AgentFS',
        VERSION: CLI_VERSION,
        SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
        VAULT_CREATED: written?.VAULT_CREATED ?? today,
        LAST_UPGRADE: today,
      };
      await fs.writeFile(osReleasePath, formatOsRelease(updated), 'utf8');
    }

    const prefix = dryRun ? '[dry-run] ' : '';
    const humanLines = [
      '',
      `${prefix}AgentFS upgrade complete (v0 → v${CURRENT_SCHEMA_VERSION})`,
      '',
      ...created.map((f) => `  ${dryRun ? 'Would create' : 'Created'}: ${f}`),
      '',
    ].join('\n');

    printResult(flags, humanLines, {
      fromVersion: 0,
      toVersion: CURRENT_SCHEMA_VERSION,
      dryRun,
      created,
    });
    return 0;
  }

  // -------------------------------------------------------------------------
  // 3b. Vault has a newer schema than the CLI — hard error.
  // -------------------------------------------------------------------------

  if (osRelease.SCHEMA_VERSION > CURRENT_SCHEMA_VERSION) {
    printError(
      flags,
      `Vault schema v${osRelease.SCHEMA_VERSION} is newer than CLI (v${CURRENT_SCHEMA_VERSION}). Upgrade your CLI with \`npm install -g create-agentfs\`.`,
      'SCHEMA_TOO_NEW',
      { vaultSchema: osRelease.SCHEMA_VERSION, cliSchema: CURRENT_SCHEMA_VERSION },
    );
    return 1;
  }

  // -------------------------------------------------------------------------
  // 3c. Already up to date.
  // -------------------------------------------------------------------------

  if (osRelease.SCHEMA_VERSION === CURRENT_SCHEMA_VERSION) {
    const humanLine = `Vault is up to date (schema v${CURRENT_SCHEMA_VERSION}).`;
    printResult(flags, humanLine, {
      needsUpgrade: false,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    return 0;
  }

  // -------------------------------------------------------------------------
  // 3d. Run migrations from osRelease.SCHEMA_VERSION → CURRENT_SCHEMA_VERSION.
  // -------------------------------------------------------------------------

  if (checkOnly) {
    if (flags.outputFormat === 'human') {
      process.stdout.write(
        `Vault needs upgrade: schema v${osRelease.SCHEMA_VERSION} → v${CURRENT_SCHEMA_VERSION}.\n`,
      );
    } else {
      printResult(flags, 'Vault needs upgrade', {
        needsUpgrade: true,
        fromVersion: osRelease.SCHEMA_VERSION,
        toVersion: CURRENT_SCHEMA_VERSION,
      });
    }
    return 1;
  }

  const migrations = getMigrationsForRange(osRelease.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);

  // Validate migration chain covers the full gap — fail fast if incomplete.
  if (migrations.length === 0 && osRelease.SCHEMA_VERSION < CURRENT_SCHEMA_VERSION) {
    printError(
      flags,
      `No migrations registered for schema v${osRelease.SCHEMA_VERSION} → v${CURRENT_SCHEMA_VERSION}. This is a CLI bug — please report it.`,
      'MIGRATION_GAP',
    );
    return 1;
  }

  const allCreated: string[] = [];
  const allModified: string[] = [];
  const allDeleted: string[] = [];
  const allWarnings: string[] = [];

  for (const migration of migrations) {
    if (flags.outputFormat === 'human') {
      process.stdout.write(`  Running migration v${migration.from} → v${migration.to}: ${migration.description}\n`);
    }
    const result = await migration.migrate(vaultRoot, dryRun);
    allCreated.push(...result.filesCreated);
    allModified.push(...result.filesModified);
    allDeleted.push(...result.filesDeleted);
    allWarnings.push(...result.warnings);
  }

  // Update os-release after all migrations.
  if (!dryRun) {
    const today = new Date().toISOString().split('T')[0];
    const osReleasePath = path.join(vaultRoot, '.agentos', 'os-release');
    const updated = {
      ...osRelease,
      VERSION: CLI_VERSION,
      SCHEMA_VERSION: CURRENT_SCHEMA_VERSION,
      LAST_UPGRADE: today,
    };
    await fs.writeFile(osReleasePath, formatOsRelease(updated), 'utf8');
    allModified.push('.agentos/os-release');
  }

  const prefix = dryRun ? '[dry-run] ' : '';
  const humanLines = [
    '',
    `${prefix}AgentFS upgrade complete (schema v${osRelease.SCHEMA_VERSION} → v${CURRENT_SCHEMA_VERSION})`,
    '',
    ...allCreated.map((f) => `  ${dryRun ? 'Would create' : 'Created'}: ${f}`),
    ...allModified.map((f) => `  ${dryRun ? 'Would modify' : 'Modified'}: ${f}`),
    ...allDeleted.map((f) => `  ${dryRun ? 'Would delete' : 'Deleted'}: ${f}`),
    ...allWarnings.map((w) => `  Warning: ${w}`),
    '',
  ].join('\n');

  printResult(flags, humanLines, {
    fromVersion: osRelease.SCHEMA_VERSION,
    toVersion: CURRENT_SCHEMA_VERSION,
    dryRun,
    created: allCreated,
    modified: allModified,
    deleted: allDeleted,
    warnings: allWarnings,
  });
  return 0;
}
