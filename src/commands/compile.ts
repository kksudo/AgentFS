/**
 * `agentfs compile` command implementation.
 *
 * Reads `.agentos/manifest.yaml`, runs the appropriate compiler driver(s),
 * always regenerates `AGENT-MAP.md`, and writes only files marked as managed
 * (`output.managed === true`).
 *
 * Usage:
 * ```
 * agentfs compile                  # compile all agents from manifest
 * agentfs compile claude           # compile one agent only
 * agentfs compile --dry-run        # preview without writing
 * agentfs compile claude --dry-run # preview for one agent
 * ```
 *
 * @module commands/compile
 */

import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRuntime, CompileContext, CompileOutput, CompileResult } from '../types/index.js';
import { buildCompileContext, writeOutputs } from '../compilers/base.js';
import { claudeCompiler } from '../compilers/claude.js';
import { openclawCompiler } from '../compilers/openclaw.js';
import { cursorCompiler } from '../compilers/cursor.js';
import { generateAgentsFile } from '../compilers/agent-map.js';
import type { AgentCompiler } from '../types/index.js';
import { CliFlags, printError, printResult } from '../utils/cli-flags.js';
import { runHooks } from '../hooks/index.js';
import { validateManifest } from '../utils/validate-manifest.js';
import { generateMemoryIndex } from '../memory/memory-index.js';
import { updateOsRelease, readOsRelease } from '../generators/os-release.js';
import { CLI_VERSION } from '../utils/version.js';
import { CURRENT_SCHEMA_VERSION } from '../migrations/index.js';
import {
  type CompileCache,
  hashContent,
  isCacheHit,
  readCache,
  updateCache,
  writeCache,
} from '../compilers/cache.js';

const COMPILE_VERSION = CLI_VERSION;

// ---------------------------------------------------------------------------
// Registry of all known compilers.
// ---------------------------------------------------------------------------

/** All compiler drivers supported by this release. */
const COMPILER_REGISTRY: Record<AgentRuntime, AgentCompiler> = {
  claude: claudeCompiler,
  openclaw: openclawCompiler,
  cursor: cursorCompiler,
};

// ---------------------------------------------------------------------------
// Global path mapping (--global flag)
// ---------------------------------------------------------------------------

/** Global config directories for each agent runtime. */
const GLOBAL_PATHS: Record<AgentRuntime, string> = {
  claude: path.join(os.homedir(), '.claude'),
  cursor: path.join(os.homedir(), '.cursor', 'rules'),
  openclaw: path.join(os.homedir(), '.openclaw'),
};

/**
 * Map a vault-relative output path to its global agent config equivalent.
 *
 * Returns null if this output has no global mapping.
 *
 * @param localRelPath - Vault-relative path (e.g. `CLAUDE.md`, `.cursor/rules/foo.mdc`)
 * @param vaultRoot - Absolute vault root (unused, kept for future use)
 * @returns Absolute global path or null
 */
export function mapToGlobalPath(localRelPath: string, _vaultRoot: string): string | null {
  // claude: CLAUDE.md → ~/.claude/CLAUDE.md
  if (localRelPath === 'CLAUDE.md') {
    return path.join(GLOBAL_PATHS.claude, 'CLAUDE.md');
  }

  // cursor: .cursor/rules/*.mdc → ~/.cursor/rules/*.mdc
  const cursorPrefix = '.cursor/rules/';
  if (localRelPath.startsWith(cursorPrefix)) {
    const filename = localRelPath.slice(cursorPrefix.length);
    return path.join(GLOBAL_PATHS.cursor, filename);
  }

  // openclaw: .openclaw/*.md → ~/.openclaw/*.md
  const openclawPrefix = '.openclaw/';
  if (localRelPath.startsWith(openclawPrefix)) {
    const filename = localRelPath.slice(openclawPrefix.length);
    return path.join(GLOBAL_PATHS.openclaw, filename);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

/**
 * Parsed representation of the arguments accepted by `agentfs compile`.
 */
interface CompileArgs {
  /** Target agent name, or undefined to compile all agents. */
  agent: AgentRuntime | undefined;
  /** When true, show what would be written without touching disk. */
  dryRun: boolean;
  /** When true, also write compiled outputs to global agent config directories. */
  global: boolean;
}

/**
 * Narrow a string to AgentRuntime.
 *
 * @param value - Candidate string from argv
 * @returns true if `value` is a known AgentRuntime
 */
function isAgentRuntime(value: string): value is AgentRuntime {
  return value === 'claude' || value === 'openclaw' || value === 'cursor';
}

/**
 * Parse the argument vector passed to `compileCommand`.
 *
 * Accepts an optional positional agent name and a `--dry-run` flag in any
 * position relative to the positional.
 *
 * @param flags - CLI flags
 * @returns Parsed compile args
 */
function parseArgs(flags: CliFlags): CompileArgs {
  const args = flags.args;
  const dryRun = args.includes('--dry-run');
  const global = args.includes('--global');
  const positionals = args.filter((a) => !a.startsWith('--'));
  const agentArg = positionals[0];

  const agent: AgentRuntime | undefined =
    agentArg !== undefined && isAgentRuntime(agentArg) ? agentArg : undefined;

  return { agent, dryRun, global };
}

// ---------------------------------------------------------------------------
// Summary printing
// ---------------------------------------------------------------------------

/**
 * Format a human-readable compile summary.
 *
 * @param results - All CompileResult objects from agent drivers
 * @param agentMapOutput - The AGENT-MAP.md output
 * @param dryRun - Whether this was a preview run
 * @param cacheStats - Number of skipped (cached) and written outputs
 * @param globalWrites - Absolute global paths that were written
 */
function formatSummary(
  results: CompileResult[],
  agentMapOutput: CompileOutput,
  dryRun: boolean,
  cacheStats: { skipped: number; written: number } = { skipped: 0, written: 0 },
  globalWrites: string[] = [],
): string {
  const verb = dryRun ? 'Would write' : 'Wrote';
  const prefix = dryRun ? '[dry-run] ' : '';

  let lines = [];
  lines.push('');
  lines.push(`${prefix}AgentFS compile complete`);
  lines.push('');

  for (const result of results) {
    lines.push(`  Agent: ${result.agent}`);
    for (const output of result.outputs) {
      if (!output.managed) {
        lines.push(`    ${verb}: ${output.path} (skipped — not managed)`);
      } else if ((output as CompileOutput & { skipped?: boolean }).skipped) {
        lines.push(`    ${verb}: ${output.path} (cached)`);
      } else {
        lines.push(`    ${verb}: ${output.path} (updated)`);
      }
    }
    if (result.summary) {
      lines.push(`    ${result.summary}`);
    }
    lines.push('');
  }

  lines.push(`  ${verb}: ${agentMapOutput.path} (shared)`);

  if (cacheStats.skipped > 0 || cacheStats.written > 0) {
    lines.push('');
    lines.push(`  Cache: ${cacheStats.written} updated, ${cacheStats.skipped} unchanged`);
  }

  if (globalWrites.length > 0) {
    lines.push('');
    for (const gp of globalWrites) {
      const displayPath = gp.startsWith(os.homedir())
        ? gp.replace(os.homedir(), '~')
        : gp;
      lines.push(`  [global] Wrote: ${displayPath}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the compile context and return a list of warning messages.
 *
 * These are advisory only — warnings do not block compilation.
 * Callers should print warnings to stderr before proceeding.
 *
 * @param context - The compile context to validate
 * @returns Array of human-readable warning strings (empty if all clear)
 */
export function validateContext(context: CompileContext): string[] {
  const warnings: string[] = [];

  // Check that the identity init script has been filled in.
  const identity = context.initScripts?.['00-identity.md'];
  if (identity !== undefined && identity.includes('(to be filled)')) {
    warnings.push(
      'Warning: Identity not configured. Run `agentfs onboard` to set up your agent identity.',
    );
  }

  // Check that a profile is defined in the manifest.
  if (context.manifest?.agentos?.profile === undefined) {
    warnings.push(
      'Warning: No profile set in manifest.agentos.profile. Run `agentfs onboard` to configure.',
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs compile` subcommand.
 *
 * Orchestrates:
 * 1. Building the compile context (reads manifest + init.d + memory).
 * 2. Running the requested compiler driver(s).
 * 3. Always generating AGENT-MAP.md.
 * 4. Writing only outputs where `managed === true` (ownership protection).
 * 5. Printing a human-readable summary.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function compileCommand(flags: CliFlags): Promise<number> {
  const { agent: targetAgent, dryRun, global: globalFlag } = parseArgs(flags);

  // Vault root is from flags, or CWD if not specified.
  const vaultRoot = flags.targetDir;

  // -------------------------------------------------------------------------
  // Build compile context — fails fast if manifest.yaml is missing.
  // -------------------------------------------------------------------------

  let context;
  try {
    context = await buildCompileContext(vaultRoot, dryRun);
  } catch (err: unknown) {
    const isNotFound = (err as NodeJS.ErrnoException)?.code === 'ENOENT';

    if (isNotFound) {
      printError(flags, 'No AgentFS vault found. Run `npx create-agentfs` first.', 'VAULT_NOT_FOUND');
    } else {
      printError(
        flags,
        `agentfs compile: failed to read manifest — ${err instanceof Error ? err.message : String(err)}`,
        'MANIFEST_READ_FAILED'
      );
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // Validate manifest — errors block compilation, warnings are advisory.
  // -------------------------------------------------------------------------

  const manifestValidation = validateManifest(context.manifest);
  if (!manifestValidation.valid) {
    for (const error of manifestValidation.errors) {
      printError(flags, `agentfs compile: ${error}`, 'MANIFEST_INVALID');
    }
    return 1;
  }
  if (flags.outputFormat === 'human') {
    for (const warning of manifestValidation.warnings) {
      process.stderr.write(`Warning: ${warning}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Surface init.d validation warnings.
  // -------------------------------------------------------------------------

  if (flags.outputFormat === 'human' && context.initScriptWarnings) {
    for (const warning of context.initScriptWarnings) {
      process.stderr.write(`${warning}\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Validate context — print warnings to stderr, never block compilation.
  // -------------------------------------------------------------------------

  const warnings = validateContext(context);
  if (flags.outputFormat === 'human') {
    for (const warning of warnings) {
      process.stderr.write(warning + '\n');
    }
  }

  // -------------------------------------------------------------------------
  // Check vault schema version — warn if outdated, block if newer.
  // -------------------------------------------------------------------------

  const osRelease = await readOsRelease(vaultRoot);
  if (osRelease) {
    if (osRelease.SCHEMA_VERSION > CURRENT_SCHEMA_VERSION) {
      printError(
        flags,
        `Vault schema v${osRelease.SCHEMA_VERSION} is newer than CLI (v${CURRENT_SCHEMA_VERSION}). Upgrade the CLI: npm install -g create-agentfs@latest`,
        'SCHEMA_TOO_NEW',
      );
      return 1;
    }
    if (osRelease.SCHEMA_VERSION < CURRENT_SCHEMA_VERSION) {
      if (flags.outputFormat === 'human') {
        process.stderr.write(
          `Warning: Vault schema v${osRelease.SCHEMA_VERSION} is outdated (CLI expects v${CURRENT_SCHEMA_VERSION}). Run \`agentfs upgrade\` first.\n`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Determine which compilers to run.
  // -------------------------------------------------------------------------

  let compilersToRun: AgentCompiler[];

  if (targetAgent !== undefined) {
    // Single-agent mode: use the named compiler if it exists in the registry.
    const compiler = COMPILER_REGISTRY[targetAgent];
    if (compiler === undefined) {
      printError(flags, `agentfs compile: no compiler found for agent '${targetAgent}'`, 'COMPILER_NOT_FOUND');
      return 1;
    }
    compilersToRun = [compiler];
  } else {
    // All-agents mode: run compilers for every agent listed in the manifest.
    const supportedAgents = context.manifest.agents.supported;
    compilersToRun = supportedAgents
      .map((name) => COMPILER_REGISTRY[name])
      .filter((c): c is AgentCompiler => c !== undefined);

    if (compilersToRun.length === 0) {
      printError(
        flags,
        'agentfs compile: no supported compilers found for agents listed in manifest.',
        'NO_COMPILERS_FOUND'
      );
      return 1;
    }
  }

  // -------------------------------------------------------------------------
  // Run compilers and write outputs (managed files only).
  // -------------------------------------------------------------------------

  const results: CompileResult[] = [];

  try {
    // Run pre-compile hooks before any compilation.
    await runHooks(vaultRoot, { name: 'pre-compile', context: { agent: targetAgent ?? 'all', dryRun } });

    // Load compile cache for incremental compilation.
    const cache: CompileCache = await readCache(vaultRoot);
    const cacheStats = { skipped: 0, written: 0 };

    /**
     * Apply cache filtering to a list of managed outputs.
     * Marks cached outputs with `skipped: true` and updates cache entries
     * for outputs that will be written. Returns the subset that needs writing.
     */
    function filterCached(outputs: CompileOutput[]): CompileOutput[] {
      const toWrite: CompileOutput[] = [];
      for (const output of outputs) {
        const contentHash = hashContent(output.content);
        if (isCacheHit(cache, output.path, contentHash)) {
          (output as CompileOutput & { skipped?: boolean }).skipped = true;
          cacheStats.skipped++;
        } else {
          if (!dryRun) {
            updateCache(cache, output.path, contentHash);
          }
          cacheStats.written++;
          toWrite.push(output);
        }
      }
      return toWrite;
    }

    for (const compiler of compilersToRun) {
      const result = await compiler.compile(context);
      results.push(result);

      // Ownership protection — only write files AgentFS owns.
      const managedOutputs = result.outputs.filter((o) => o.managed);
      const toWrite = filterCached(managedOutputs);
      await writeOutputs(toWrite, vaultRoot, dryRun);
    }

    // -----------------------------------------------------------------------
    // Always regenerate AGENT-MAP.md regardless of target agent.
    // -----------------------------------------------------------------------

    const agentMapOutput = await generateAgentsFile(context);
    if (agentMapOutput.managed) {
      const toWrite = filterCached([agentMapOutput]);
      await writeOutputs(toWrite, vaultRoot, dryRun);
    }

    // -----------------------------------------------------------------------
    // Always regenerate .agentos/memory/INDEX.md to enforce lazy-load policy.
    // -----------------------------------------------------------------------

    const memoryIndexOutput = await generateMemoryIndex(vaultRoot);
    await writeOutputs([memoryIndexOutput], vaultRoot, dryRun);

    // -----------------------------------------------------------------------
    // Update .agentos/os-release with current CLI version.
    // -----------------------------------------------------------------------

    const osReleaseOutput = await updateOsRelease(vaultRoot, COMPILE_VERSION, dryRun);
    await writeOutputs(filterCached([osReleaseOutput]), vaultRoot, dryRun);

    // -----------------------------------------------------------------------
    // Persist updated cache (skip on dry-run).
    // -----------------------------------------------------------------------

    if (!dryRun) {
      await writeCache(vaultRoot, cache);
    }

    // -----------------------------------------------------------------------
    // Global writes (--global flag).
    // -----------------------------------------------------------------------

    const globalWrites: string[] = [];

    if (globalFlag) {
      // Collect all managed outputs from all compiler results.
      const allOutputs: CompileOutput[] = results.flatMap((r) => r.outputs);
      allOutputs.push(agentMapOutput);

      for (const output of allOutputs) {
        if (!output.managed) continue;
        const globalPath = mapToGlobalPath(output.path, vaultRoot);
        if (globalPath === null) continue;
        if (!dryRun) {
          await fs.mkdir(path.dirname(globalPath), { recursive: true });
          await fs.writeFile(globalPath, output.content, 'utf-8');
        }
        globalWrites.push(globalPath);
      }
    }

    // Run post-compile hooks after all outputs have been written.
    await runHooks(vaultRoot, { name: 'post-compile', context: { agent: targetAgent ?? 'all', dryRun } });

    printResult(flags, formatSummary(results, agentMapOutput, dryRun, cacheStats, globalWrites), {
      agent: targetAgent || 'all',
      dryRun,
      results,
      agentMap: agentMapOutput,
      warnings,
      cacheStats,
    });
    return 0;
  } catch (err) {
    printError(
      flags,
      `agentfs compile: unexpected error — ${err instanceof Error ? err.message : String(err)}`,
      'COMPILE_ERROR'
    );
    return 1;
  }
}
