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
import { securityCommand } from './commands/security.js';
import { secretCommand } from './commands/secret.js';
import { syncCommand } from './commands/sync.js';
import { doctorCommand, triageCommand, migrateCommand } from './commands/doctor.js';
import { runSetupPrompts } from './generators/prompts.js';
import { scaffold, formatScaffoldSummary } from './generators/scaffold.js';
import { parseCliFlags, resolveSetupAnswers } from './utils/cli-flags.js';

/** CLI version — kept in sync with package.json by convention. */
export const VERSION = '0.1.4';

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
  | 'secret'
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
  'secret',
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

  const flags = parseCliFlags(args);

  // Also support legacy --non-interactive, --profile, --output (as dir alias)
  let legacyDir: string | undefined;
  let legacyProfile: string | undefined;
  let legacyNonInteractive = false;

  for (let i = 0; i < flags.args.length; i++) {
    const arg = flags.args[i];
    if (arg === '--output' || arg === '-o') {
      legacyDir = flags.args[++i];
    } else if (arg === '--profile' || arg === '-p') {
      legacyProfile = flags.args[++i];
    } else if (arg === '--non-interactive') {
      legacyNonInteractive = true;
    } else if (!arg.startsWith('-') && !legacyDir) {
      legacyDir = arg;
    }
  }

  // Merge legacy flags into CliFlags
  if (legacyDir) flags.targetDir = legacyDir;
  if (legacyNonInteractive) flags.nonInteractive = true;

  // If --json or --config provided, merge profile from legacy if not in JSON
  if (legacyProfile && flags.jsonInput && !flags.jsonInput.profile) {
    flags.jsonInput.profile = legacyProfile;
  }
  if (legacyProfile && !flags.jsonInput && !flags.configPath) {
    // Legacy non-interactive with --profile
    flags.jsonInput = { profile: legacyProfile };
    flags.nonInteractive = true;
  }

  let answers;
  if (flags.nonInteractive) {
    answers = await resolveSetupAnswers(flags);
  } else {
    answers = await runSetupPrompts(flags.targetDir);
  }

  try {
    const result = await scaffold(answers);
    if (flags.outputFormat === 'json') {
      print(JSON.stringify(result, null, 2));
    } else {
      print(formatScaffoldSummary(result));
    }
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

  // Decode if running as create-agentfs
  const isCreateBin = argv[1] && (argv[1].endsWith('create-agentfs') || argv[1].endsWith('create-agentfs.js'));

  // Parse common flags once for all subcommands
  const flags = parseCliFlags(args);
  const effectiveSubcommand = flags.args[0];

  // If no arguments or the command starts with a flag (like npx create-agentfs --non-interactive)
  // or it is explicitly "init", run the scaffolder.
  if (
    effectiveSubcommand === undefined ||
    effectiveSubcommand === 'init' ||
    (isCreateBin && !isSubcommand(effectiveSubcommand))
  ) {
    // If it's pure "init", slice it out so we just parse the trailing args.
    const scaffoldArgs = effectiveSubcommand === 'init' ? args.filter(a => a !== 'init') : args;
    return runScaffold(scaffoldArgs);
  }

  // Known subcommand — dispatch to implemented handlers, stub the rest.
  if (isSubcommand(effectiveSubcommand)) {
    // Strip the subcommand name from args if it's first (normal case)
    if (flags.args[0] === effectiveSubcommand) {
      flags.args.shift();
    }

    if (effectiveSubcommand === 'compile') return compileCommand(flags);
    if (effectiveSubcommand === 'onboard') return onboardCommand(flags);
    if (effectiveSubcommand === 'memory') return memoryCommand(flags);
    if (effectiveSubcommand === 'cron') return cronCommand(flags);
    if (effectiveSubcommand === 'security') return securityCommand(flags);
    if (effectiveSubcommand === 'secret') return secretCommand(flags);
    if (effectiveSubcommand === 'sync') return syncCommand(flags);
    if (effectiveSubcommand === 'doctor') return doctorCommand(flags);
    if (effectiveSubcommand === 'triage') return triageCommand(flags);
    if (effectiveSubcommand === 'migrate') return migrateCommand(flags);
    printStub(effectiveSubcommand);
    return 0;
  }

  // Unknown subcommand → usage + non-zero exit.
  printErr(`agentfs: unknown subcommand '${effectiveSubcommand}'`);
  printUsage();
  return 1;
}

// ---------------------------------------------------------------------------
// Bootstrap — only run when executed directly (not imported in tests).
// ---------------------------------------------------------------------------

// In ESM with NodeNext module resolution the canonical way to detect the
// main module is to compare import.meta.url against the resolved entry URL.
// We call `process.exit` here so tests that import `main` are not affected.
//
// When installed globally via npm, the binary is a symlink:
//   /usr/bin/agentfs → ../lib/node_modules/create-agentfs/dist/cli.js
// In this case argv[1] is the symlink path (ending in "agentfs" or
// "create-agentfs") while import.meta.url ends in "cli.js".
// We handle both cases: direct invocation and symlink invocation.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isEntryPoint = (() => {
  if (process.argv[1] === undefined) return false;

  const thisFile = fileURLToPath(import.meta.url);

  // Direct match: `node dist/cli.js`
  try {
    if (realpathSync(process.argv[1]) === thisFile) return true;
  } catch {
    // argv[1] might not exist on disk (e.g. piped via stdin)
  }

  // Basename match (legacy fallback): covers `node cli.js` without full path
  const argBase = process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '';
  if (argBase && thisFile.endsWith(argBase)) return true;

  // npm global symlink match: argv[1] ends with the bin name ("agentfs",
  // "create-agentfs") which differs from the actual file ("cli.js").
  // Check if it's a known bin name from package.json.
  const knownBinNames = ['agentfs', 'create-agentfs'];
  if (knownBinNames.includes(argBase)) return true;

  return false;
})();

if (isEntryPoint) {
  main().then((code) => {
    process.exit(code);
  });
}
