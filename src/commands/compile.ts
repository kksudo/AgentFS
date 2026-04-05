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

import type { AgentRuntime, CompileContext, CompileOutput, CompileResult } from '../types/index.js';
import { buildCompileContext, writeOutputs } from '../compilers/base.js';
import { claudeCompiler } from '../compilers/claude.js';
import { openclawCompiler } from '../compilers/openclaw.js';
import { cursorCompiler } from '../compilers/cursor.js';
import { generateAgentsFile } from '../compilers/agent-map.js';
import type { AgentCompiler } from '../types/index.js';

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
// Output helpers
// ---------------------------------------------------------------------------

/** Write to stdout. */
function print(line: string): void {
  process.stdout.write(line + '\n');
}

/** Write to stderr. */
function printErr(line: string): void {
  process.stderr.write(line + '\n');
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
 * @param args - Arguments after the `compile` subcommand token
 * @returns Parsed compile args
 */
function parseArgs(args: string[]): CompileArgs {
  const dryRun = args.includes('--dry-run');
  const positionals = args.filter((a) => !a.startsWith('--'));
  const agentArg = positionals[0];

  const agent: AgentRuntime | undefined =
    agentArg !== undefined && isAgentRuntime(agentArg) ? agentArg : undefined;

  return { agent, dryRun };
}

// ---------------------------------------------------------------------------
// Summary printing
// ---------------------------------------------------------------------------

/**
 * Print a human-readable compile summary to stdout.
 *
 * @param results - All CompileResult objects from agent drivers
 * @param agentMapOutput - The AGENT-MAP.md output
 * @param dryRun - Whether this was a preview run
 */
function printSummary(
  results: CompileResult[],
  agentMapOutput: CompileOutput,
  dryRun: boolean,
): void {
  const verb = dryRun ? 'Would write' : 'Wrote';
  const prefix = dryRun ? '[dry-run] ' : '';

  print('');
  print(`${prefix}AgentFS compile complete`);
  print('');

  for (const result of results) {
    print(`  Agent: ${result.agent}`);
    for (const output of result.outputs) {
      const managed = output.managed ? '' : ' (skipped — not managed)';
      print(`    ${verb}: ${output.path}${managed}`);
    }
    if (result.summary) {
      print(`    ${result.summary}`);
    }
    print('');
  }

  print(`  ${verb}: ${agentMapOutput.path} (shared)`);
  print('');
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
 * Ownership protection: this function never writes a file where
 * `output.managed === false`. Unmanaged files are reported in the summary
 * as skipped so callers can observe the decision.
 *
 * @param args - Arguments after the `compile` subcommand token
 *               (i.e. `process.argv.slice(3)` when called from the CLI)
 * @returns 0 on success, 1 on error
 */
export async function compileCommand(args: string[]): Promise<number> {
  const { agent: targetAgent, dryRun } = parseArgs(args);

  // Vault root is always the current working directory.
  const vaultRoot = process.cwd();

  // -------------------------------------------------------------------------
  // Build compile context — fails fast if manifest.yaml is missing.
  // -------------------------------------------------------------------------

  let context;
  try {
    context = await buildCompileContext(vaultRoot, dryRun);
  } catch (err) {
    const isNotFound =
      err !== null &&
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT';

    if (isNotFound) {
      printErr(
        'No AgentFS vault found. Run `npx create-agentfs` first.',
      );
    } else {
      printErr(
        `agentfs compile: failed to read manifest — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // Validate context — print warnings to stderr, never block compilation.
  // -------------------------------------------------------------------------

  for (const warning of validateContext(context)) {
    printErr(warning);
  }

  // -------------------------------------------------------------------------
  // Determine which compilers to run.
  // -------------------------------------------------------------------------

  let compilersToRun: AgentCompiler[];

  if (targetAgent !== undefined) {
    // Single-agent mode: use the named compiler if it exists in the registry.
    const compiler = COMPILER_REGISTRY[targetAgent];
    if (compiler === undefined) {
      printErr(`agentfs compile: no compiler found for agent '${targetAgent}'`);
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
      printErr(
        'agentfs compile: no supported compilers found for agents listed in manifest.',
      );
      return 1;
    }
  }

  // -------------------------------------------------------------------------
  // Run compilers and write outputs (managed files only).
  // -------------------------------------------------------------------------

  const results: CompileResult[] = [];

  try {
    for (const compiler of compilersToRun) {
      const result = await compiler.compile(context);
      results.push(result);

      // Ownership protection — only write files AgentFS owns.
      const managedOutputs = result.outputs.filter((o) => o.managed);
      await writeOutputs(managedOutputs, vaultRoot, dryRun);
    }

    // -----------------------------------------------------------------------
    // Always regenerate AGENT-MAP.md regardless of target agent.
    // -----------------------------------------------------------------------

    const agentMapOutput = await generateAgentsFile(context);
    // AGENT-MAP.md is always managed — no extra guard needed, but we respect
    // the contract anyway for consistency.
    if (agentMapOutput.managed) {
      await writeOutputs([agentMapOutput], vaultRoot, dryRun);
    }

    printSummary(results, agentMapOutput, dryRun);
    return 0;
  } catch (err) {
    printErr(
      `agentfs compile: unexpected error — ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
