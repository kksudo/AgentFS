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

/** CLI version — kept in sync with package.json by convention. */
export const VERSION = '0.1.0';

/**
 * All subcommands recognised by the CLI.
 *
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
  print('Scaffolding not yet implemented');
  print('');
  print('Run `agentfs --help` once Phase 2 is released.');
  print('');
}

/** Printed when an unknown subcommand is supplied. */
function printUsage(): void {
  print('');
  print(`agentfs v${VERSION} — filesystem-based OS for AI agents`);
  print('');
  print('Usage:');
  print('  npx create-agentfs               Scaffold a new AgentFS vault');
  print('  agentfs <subcommand> [options]   Run a post-init command');
  print('');
  print('Subcommands:');
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

  // No arguments → welcome message (the `npx create-agentfs` case).
  if (subcommand === undefined) {
    printWelcome();
    return 0;
  }

  // Help flags — delegate to usage.
  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    printUsage();
    return 0;
  }

  // Version flags.
  if (subcommand === '--version' || subcommand === '-v') {
    print(VERSION);
    return 0;
  }

  // Known subcommand → stub response.
  if (isSubcommand(subcommand)) {
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
