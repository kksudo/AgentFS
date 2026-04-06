/**
 * CLI flag parser — extracts common flags from any command's args.
 *
 * Supports AI-friendly non-interactive mode:
 * - `--json '<json>'` — pass input as inline JSON string
 * - `--config <path>` — read input from JSON/YAML file
 * - `--output json` — structured JSON output instead of human text
 * - `--dir <path>` — target directory (defaults to cwd)
 *
 * @module utils/cli-flags
 */

import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { Profile, AgentRuntime, SetupAnswers } from '../types/index.js';

/** Parsed CLI flags common to all commands. */
export interface CliFlags {
  /** Inline JSON input (from --json flag) */
  jsonInput: Record<string, unknown> | null;
  /** Config file path (from --config flag) */
  configPath: string | null;
  /** Output format: 'human' (default) or 'json' */
  outputFormat: 'human' | 'json';
  /** Target directory (from --dir flag, defaults to cwd) */
  targetDir: string;
  /** Whether running in non-interactive mode (--json or --config provided) */
  nonInteractive: boolean;
  /** Remaining positional args after flag extraction */
  args: string[];
}

/**
 * Parse common CLI flags from an argument array.
 */
export function parseCliFlags(argv: string[]): CliFlags {
  let jsonInput: Record<string, unknown> | null = null;
  let configPath: string | null = null;
  let outputFormat: 'human' | 'json' = 'human';
  let targetDir = process.cwd();
  const remaining: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--json' && i + 1 < argv.length) {
      try {
        jsonInput = JSON.parse(argv[i + 1]) as Record<string, unknown>;
      } catch {
        throw new Error(`Invalid JSON after --json: ${argv[i + 1]}`);
      }
      i += 2;
      continue;
    }

    if (arg === '--config' && i + 1 < argv.length) {
      configPath = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--output' && i + 1 < argv.length) {
      if (argv[i + 1] === 'json') {
        outputFormat = 'json';
      }
      i += 2;
      continue;
    }

    if (arg === '--dir' && i + 1 < argv.length) {
      targetDir = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg === '--non-interactive') {
      i++;
      continue;
    }

    remaining.push(arg);
    i++;
  }

  return {
    jsonInput,
    configPath,
    outputFormat,
    targetDir,
    nonInteractive: jsonInput !== null || configPath !== null || argv.includes('--non-interactive'),
    args: remaining,
  };
}

/**
 * Load input from --config file (JSON or YAML).
 */
export async function loadConfigFile(configPath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(configPath, 'utf-8');
  if (configPath.endsWith('.json')) {
    return JSON.parse(content) as Record<string, unknown>;
  }
  return yaml.load(content) as Record<string, unknown>;
}

/**
 * Resolve input from either --json or --config flags.
 */
export async function resolveInput(flags: CliFlags): Promise<Record<string, unknown> | null> {
  if (flags.jsonInput) return flags.jsonInput;
  if (flags.configPath) return loadConfigFile(flags.configPath);
  return null;
}

/**
 * Resolve SetupAnswers from CLI flags — either JSON/config input or interactive prompts.
 */
export async function resolveSetupAnswers(flags: CliFlags): Promise<SetupAnswers> {
  const input = await resolveInput(flags);

  if (input !== null || flags.nonInteractive) {
    const { createDefaultAnswers } = await import('../generators/prompts.js');
    const overrides: Partial<SetupAnswers> = { targetDir: flags.targetDir };
    if (input) {
      if (input.vaultName !== undefined) overrides.vaultName = input.vaultName as string;
      if (input.ownerName !== undefined) overrides.ownerName = input.ownerName as string;
      if (input.profile !== undefined) overrides.profile = input.profile as Profile;
      if (input.primaryAgent !== undefined) overrides.primaryAgent = input.primaryAgent as AgentRuntime;
      if (input.supportedAgents !== undefined) overrides.supportedAgents = input.supportedAgents as AgentRuntime[];
      if (input.modules !== undefined) overrides.modules = input.modules as string[];
    }
    return createDefaultAnswers(overrides);
  }

  const { runSetupPrompts } = await import('../generators/prompts.js');
  return runSetupPrompts(flags.targetDir);
}

/**
 * Print an error message, formatted as JSON if requested.
 */
export function printError(flags: CliFlags, humanMessage: string, errorCode: string, extra: Record<string, unknown> = {}): void {
  if (flags.outputFormat === 'json') {
    process.stdout.write(JSON.stringify({
      status: 'error',
      error: {
        code: errorCode,
        message: humanMessage,
        ...extra,
      },
    }, null, 2) + '\n');
  } else {
    process.stderr.write(`\nError [${errorCode}]: ${humanMessage}\n\n`);
  }
}

/**
 * Print a successful result, formatted as JSON if requested.
 */
export function printResult(flags: CliFlags, humanMessage: string, data: Record<string, unknown> = {}): void {
  if (flags.outputFormat === 'json') {
    process.stdout.write(JSON.stringify({
      status: 'success',
      ...data,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(humanMessage + '\n');
  }
}
