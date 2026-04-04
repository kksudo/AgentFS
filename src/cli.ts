#!/usr/bin/env node

/**
 * AgentFS CLI entry point.
 *
 * Invoked as `npx create-agentfs` or `agentfs <subcommand>`.
 *
 * When run with no arguments (the `npx create-agentfs` case) it prints a
 * welcome message and exits — scaffolding is not yet implemented.
 *
 * When run with a known subcommand it prints a "not yet implemented" stub
 * message.  When run with an unknown subcommand it prints usage help.
 *
 * No external arg-parsing library is used; everything is read from
 * `process.argv` directly.
 *
 * @module cli
 */

// Type-only import — keeps the bundle clean; no runtime value is needed here.
// The types enforce the contract that subcommand handlers will eventually
// satisfy (compile pipeline, security policy, memory management, etc.).
import type {
  Manifest,
  AgentCompiler,
  SecurityPolicy,
} from './types/index.js';

// Suppress "declared but never read" errors for the imported types — they are
// intentional forward references that document what each stub will receive.
void (0 as unknown as Manifest);
void (0 as unknown as AgentCompiler);
void (0 as unknown as SecurityPolicy);

import { compileCommand } from './commands/compile.js';
import { onboardCommand } from './commands/onboard.js';
import { memoryCommand } from './commands/memory.js';
import { cronCommand } from './commands/cron.js';
import { runSetupPrompts, createDefaultAnswers } from './generators/prompts.js';
import { scaffold, formatScaffoldSummary } from './generators/scaffold.js';
import type { Profile } from './types/index.js';

/** CLI version — kept in sync with package.json by convention. */
export const VERSION = '0.1.0';

/**
 * All subcommands recognised by the CLI.
 *
 * - `init`     — scaffold a new AgentFS vault (same as create-agentfs)
 * - `compile`  — compile .agentos/ kernel into native agent configs
 * - `onboard`  — interactive first-run wizard (create-agentfs flow)
 * - `memory`   — inspect / edit Tulving memory layers
 * - `security` — manage AppArmor-style security policy
 * - `doctor`   — health-check the vault and diagnose problems
 * - `triage`   — process Inbox/ using cron triage rules
 * - `migrate`  — migrate an existing vault to AgentFS layout
 * - `sync`     — sync compiled outputs to all registered agents
 * - `import`   — import external notes/files into the vault
 * - `exec`     — run a one-off .agentos/cron.d/ job manually
 * - `status`   — print current vault and agent runtime status
 */
export type Subcommand =
  | 'compile'
  | 'onboard'
  | 'memory'
  | 'cron'
  | 'security'
  | 'doctor'
  | 'triage'
  | 'migrate'
  | 'sync'
  | 'import'
  | 'exec'
  | 'status';

/** Set used for O(1) membership checks without type widening. */
const KNOWN_SUBCOMMANDS = new Set<string>([
  'compile',
  'onboard',
  'memory',
  'cron',
  'security',
  'doctor',
  'triage',
  'migrate',
  'sync',
  'import',
  'exec',
  'status',
] satisfies Subcommand[]);

/** Returns true when `value` is a recognised subcommand. */
function isSubcommand(value: string): value is Subcommand {
  return KNOWN_SUBCOMMANDS.has(value);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/** Print a line to stdout. */
function print(line: string): void {
  process.stdout.write(line + '\n');
}

/** Print a line to stderr. */
function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

/** Printed when the binary is invoked with no arguments (`npx create-agentfs`). */
function printWelcome(): void {
  print('');
  print(`AgentFS v${VERSION}`);
  print('Scaffold your Obsidian vault as a filesystem-based OS for AI agents.');
  print('');
}

/** Parses flags for the scaffold command. */
async function runScaffold(args: string[]): Promise<number> {
  printWelcome();

  let targetDir: string | undefined;
  let profile: string | undefined;
  let nonInteractive = false;

  // Simple ad-hoc parser
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' || arg === '-o') {
      targetDir = args[++i];
    } else if (arg === '--profile' || arg === '-p') {
      profile = args[++i];
    } else if (arg === '--non-interactive') {
      nonInteractive = true;
    } else if (!arg.startsWith('-') && !targetDir) {
      // Positional target directory
      targetDir = arg;
    }
  }

  let answers;
  if (nonInteractive) {
    answers = createDefaultAnswers({
      targetDir: targetDir ?? process.cwd(),
      profile: (profile as Profile) ?? 'personal',
    });
  } else {
    answers = await runSetupPrompts(targetDir);
  }

  try {
    const result = await scaffold(answers);
    print(formatScaffoldSummary(result));
    return 0;
  } catch (err) {
    printErr(`Scaffolding failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** Printed when an unknown subcommand is supplied. */
function printUsage(): void {
  print('');
  print(`agentfs v${VERSION} — filesystem-based OS for AI agents`);
  print('');
  print('Usage:');
  print('  npx create-agentfs [dir] [opts]  Scaffold a new AgentFS vault');
  print('  agentfs <subcommand> [opts]      Run a post-init command');
  print('');
  print('Scaffold Options:');
  print('  --output, -o <dir>         Target directory');
  print('  --profile, -p <name>       Vault profile (personal/company/shared)');
  print('  --non-interactive          Bypass prompts and use default values');
  print('');
  print('Subcommands:');
  print('  init       Alias for npx create-agentfs');
  print('  compile    Compile .agentos/ kernel into native agent configs');
  print('  onboard    Interactive first-run setup wizard');
  print('  memory     Inspect and edit Tulving memory layers');
  print('  security   Manage AppArmor-style security policy');
  print('  doctor     Health-check the vault and diagnose problems');
  print('  triage     Process Inbox/ using cron triage rules');
  print('  migrate    Migrate an existing vault to AgentFS layout');
  print('  sync       Sync compiled outputs to all registered agents');
  print('  import     Import external notes/files into the vault');
  print('  exec       Run a one-off cron.d/ job manually');
  print('  status     Print current vault and agent runtime status');
  print('');
  print('Examples:');
  print('  agentfs compile --dry-run');
  print('  agentfs status');
  print('  agentfs doctor');
  print('');
}

/** Printed when a known subcommand stub is invoked. */
function printStub(subcommand: Subcommand): void {
  print(`agentfs ${subcommand}: not yet implemented`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * CLI main function.
 *
 * Reads `process.argv`, dispatches to the appropriate handler, and calls
 * `process.exit` with the resolved exit code.
 *
 * Exported so that tests can invoke the CLI programmatically without
 * spawning a child process.
 *
 * @param argv - Argument vector (defaults to `process.argv`). The first two
 *               entries (node executable + script path) are always skipped.
 * @returns The exit code that was (or would be) passed to `process.exit`.
 */
export async function main(argv: string[] = process.argv): Promise<number> {
  // argv[0] = node, argv[1] = script path, argv[2+] = user args
  const args = argv.slice(2);
  const subcommand = args[0];

  // Help flags — delegate to usage first (can be used with no subcommands).
  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    printUsage();
    return 0;
  }

  // Version flags.
  if (subcommand === '--version' || subcommand === '-v') {
    print(VERSION);
    return 0;
  }

  const binName = argv[1] ? import('node:path').then(p => p.basename(argv[1])) : 'agentfs';
  const isCreateBin = argv[1] && (argv[1].endsWith('create-agentfs') || argv[1].endsWith('create-agentfs.js'));

  // If no arguments or the command starts with a flag (like npx create-agentfs --non-interactive)
  // or it is explicitly "init", run the scaffolder.
  if (subcommand === undefined || subcommand.startsWith('-') || subcommand === 'init' || (isCreateBin && !isSubcommand(subcommand))) {
    // If it's pure "init", slice it out so we just parse the trailing args.
    const scaffoldArgs = subcommand === 'init' ? args.slice(1) : args;
    return runScaffold(scaffoldArgs);
  }

  // Known subcommand — dispatch to implemented handlers, stub the rest.
  if (isSubcommand(subcommand)) {
    const subArgs = args.slice(1);
    if (subcommand === 'compile') return compileCommand(subArgs);
    if (subcommand === 'onboard') return onboardCommand(subArgs);
    if (subcommand === 'memory') return memoryCommand(subArgs);
    if (subcommand === 'cron') return cronCommand(subArgs);
    printStub(subcommand);
    return 0;
  }

  // Unknown subcommand → usage + non-zero exit.
  printErr(`agentfs: unknown subcommand '${subcommand}'`);
  printUsage();
  return 1;
}

// ---------------------------------------------------------------------------
// Bootstrap — only run when executed directly (not imported in tests).
// ---------------------------------------------------------------------------

// In ESM with NodeNext module resolution the canonical way to detect the
// main module is to compare import.meta.url against the resolved entry URL.
// We call `process.exit` here so tests that import `main` are not affected.
const isEntryPoint =
  // On POSIX the argv[1] path matches the file URL when run via `node`.
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(
    // Normalise Windows backslashes just in case.
    process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '',
  );

if (isEntryPoint) {
  main().then((code) => {
    process.exit(code);
  });
}
