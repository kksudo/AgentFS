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
 *
 * Extracts `--json`, `--config`, `--output`, `--dir` and returns
 * remaining args for command-specific parsing.
 *
 * @example
 * ```ts
 * // AI agent usage:
 * // agentfs init --json '{"vaultName":"my-vault","profile":"personal"}'
 * // agentfs compile --output json
 * // agentfs onboard --config ./answers.yaml
 * ```
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

    remaining.push(arg);
    i++;
  }

  return {
    jsonInput,
    configPath,
    outputFormat,
    targetDir,
    nonInteractive: jsonInput !== null || configPath !== null,
    args: remaining,
  };
}

/**
 * Load input from --config file (JSON or YAML).
 *
 * @param configPath - Path to config file
 * @returns Parsed object
 */
export async function loadConfigFile(configPath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(configPath, 'utf-8');

  if (configPath.endsWith('.json')) {
    return JSON.parse(content) as Record<string, unknown>;
  }

  // Default: YAML
  return yaml.load(content) as Record<string, unknown>;
}

/**
 * Resolve input from either --json or --config flags.
 *
 * @param flags - Parsed CLI flags
 * @returns Input object, or null if neither flag was provided
 */
export async function resolveInput(flags: CliFlags): Promise<Record<string, unknown> | null> {
  if (flags.jsonInput) return flags.jsonInput;
  if (flags.configPath) return loadConfigFile(flags.configPath);
  return null;
}
