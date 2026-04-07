/**
 * Base compiler utilities — shared by all agent drivers.
 *
 * Provides functions to read manifest, load init.d scripts,
 * read memory files, register Handlebars helpers, and write outputs.
 *
 * @module compilers/base
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import Handlebars from 'handlebars';
import type { Manifest, CompileContext, CompileOutput } from '../types/index.js';

/**
 * Read and parse `.agentos/manifest.yaml`.
 *
 * @param vaultRoot - Root directory of the vault
 * @returns Parsed Manifest object
 * @throws If manifest.yaml doesn't exist or is invalid YAML
 */
export async function readManifest(vaultRoot: string): Promise<Manifest> {
  const manifestPath = path.join(vaultRoot, '.agentos', 'manifest.yaml');
  const content = await fs.readFile(manifestPath, 'utf-8');
  return yaml.load(content) as Manifest;
}

// ---------------------------------------------------------------------------
// Init.d validation
// ---------------------------------------------------------------------------

/**
 * Validate init.d/ scripts for required files and naming conventions.
 *
 * Checks:
 * - Required script `00-identity.md` exists.
 * - All scripts match the naming pattern `\d{2}-.*\.md`.
 * - Any scripts listed in `bootSequence` are present on disk.
 *
 * @param scripts - Map of filename → content as returned by readInitScripts
 * @param bootSequence - Ordered list of init.d/ script names from manifest.boot.sequence
 * @returns Validation result with warnings (never blocks compilation)
 */
export function validateInitScripts(
  scripts: Record<string, string>,
  bootSequence: string[] = [],
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const filenames = Object.keys(scripts);

  // Check required script exists.
  if (!filenames.includes('00-identity.md')) {
    warnings.push('Warning: init.d/00-identity.md is missing. Run `agentfs onboard` to create it.');
  }

  // Check naming convention: must match \d{2}-.*\.md
  const namingPattern = /^\d{2}-.*\.md$/;
  for (const filename of filenames) {
    if (!namingPattern.test(filename)) {
      warnings.push(`Warning: init.d/${filename} does not match naming convention \\d{2}-.*\\.md and may be ignored.`);
    }
  }

  // Check boot sequence scripts exist.
  for (const script of bootSequence) {
    if (!filenames.includes(script)) {
      warnings.push(`Warning: Boot sequence references "${script}" but init.d/${script} does not exist.`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

/**
 * Validate compile outputs before writing.
 *
 * Checks:
 * - All outputs have non-empty `path` and `content`.
 * - No two outputs share the same path.
 * - JSON outputs (`.json` extension) contain valid JSON.
 *
 * @param outputs - Compile outputs to validate
 * @returns Validation result with errors (caller decides whether to block)
 */
export function validateOutputs(outputs: CompileOutput[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const output of outputs) {
    if (!output.path || output.path.trim() === '') {
      errors.push('Output has an empty path.');
    }

    if (!output.content || output.content.trim() === '') {
      errors.push(`Output "${output.path || '(empty path)'}" has empty content.`);
    }

    if (output.path) {
      if (seen.has(output.path)) {
        errors.push(`Duplicate output path: "${output.path}".`);
      } else {
        seen.add(output.path);
      }

      // Validate JSON files contain valid JSON.
      if (output.path.endsWith('.json') && output.content) {
        try {
          JSON.parse(output.content);
        } catch {
          errors.push(`Output "${output.path}" has invalid JSON content.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Read all init.d/ scripts, keyed by filename.
 *
 * @param vaultRoot - Root directory of the vault
 * @returns Map of filename → content
 */
export async function readInitScripts(vaultRoot: string): Promise<Record<string, string>> {
  const initDir = path.join(vaultRoot, '.agentos', 'init.d');
  const scripts: Record<string, string> = {};

  try {
    const entries = await fs.readdir(initDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

    for (const filename of mdFiles) {
      scripts[filename] = await fs.readFile(path.join(initDir, filename), 'utf-8');
    }
  } catch {
    // init.d/ doesn't exist — return empty
  }

  return scripts;
}

/**
 * Read semantic memory content.
 *
 * @param vaultRoot - Root directory of the vault
 * @returns File content or null if not found
 */
export async function readSemanticMemory(vaultRoot: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(vaultRoot, '.agentos', 'memory', 'semantic.md'), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read corrections memory content.
 *
 * @param vaultRoot - Root directory of the vault
 * @returns File content or null if not found
 */
export async function readCorrections(vaultRoot: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(vaultRoot, '.agentos', 'memory', 'corrections.md'), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build a complete CompileContext from a vault root.
 *
 * Reads manifest, init scripts, and memory in parallel.
 *
 * @param vaultRoot - Root directory of the vault
 * @param dryRun - Whether to preview without writing
 * @returns Complete context for compiler drivers
 */
export async function buildCompileContext(
  vaultRoot: string,
  dryRun = false,
): Promise<CompileContext> {
  const [manifest, initScripts, semanticMemory, corrections] = await Promise.all([
    readManifest(vaultRoot),
    readInitScripts(vaultRoot),
    readSemanticMemory(vaultRoot),
    readCorrections(vaultRoot),
  ]);

  const bootSequence = manifest.boot?.sequence ?? [];
  const { warnings: initScriptWarnings } = validateInitScripts(initScripts, bootSequence);

  return { manifest, initScripts, semanticMemory, corrections, vaultRoot, dryRun, initScriptWarnings };
}

// ---------------------------------------------------------------------------
// Handlebars helpers
// ---------------------------------------------------------------------------

/** Register custom Handlebars helpers used by all templates. */
export function registerHelpers(): void {
  /** Format current date as ISO string (YYYY-MM-DD). */
  Handlebars.registerHelper('today', () => new Date().toISOString().split('T')[0]);

  /** Join array items with a separator. */
  Handlebars.registerHelper('join', (arr: string[], sep: string) => {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof sep === 'string' ? sep : ', ');
  });

  /** Render a block if two values are equal. */
  Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  /** Increment a number (for 1-based indexing in templates). */
  Handlebars.registerHelper('inc', (val: number) => val + 1);

  /** Uppercase first letter. */
  Handlebars.registerHelper('capitalize', (str: string) => {
    if (typeof str !== 'string' || str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  /** Convert FHS paths object to markdown table rows with descriptions. */
  Handlebars.registerHelper('pathTable', (paths: Record<string, string>) => {
    if (!paths || typeof paths !== 'object') return '';
    // Inline descriptions keyed by FHS path name — matches FHS_DESCRIPTIONS from fhs-mapping.ts
    const desc: Record<string, string> = {
      tmp: 'Entry point for new notes',
      log: 'Daily journals',
      spool: 'Task queues and priorities',
      home: 'Active projects',
      srv: 'Content for publishing',
      usr_share: 'Shared knowledge base',
      proc_people: 'Active contacts',
      etc: 'System configuration',
      archive: 'Completed and archived',
      home_contracts: 'Client projects',
      usr_local_career: 'Job search pipeline',
      home_user: 'Professional knowledge base',
      usr_share_media: 'Media assets',
    };
    return Object.entries(paths)
      .filter(([, v]) => v !== undefined)
      .map(([key, val]) => `| \`${val}/\` | \`${key}\` | ${desc[key] ?? ''} |`)
      .join('\n');
  });
}

// Register helpers on module load
registerHelpers();

// ---------------------------------------------------------------------------
// Template compilation
// ---------------------------------------------------------------------------

/**
 * Compile a Handlebars template string.
 *
 * @param source - Handlebars template source
 * @returns Compiled template function
 */
export function compileTemplate(source: string): HandlebarsTemplateDelegate {
  return Handlebars.compile(source);
}

// ---------------------------------------------------------------------------
// Output writing
// ---------------------------------------------------------------------------

/**
 * Write compile outputs to disk (or skip in dry-run mode).
 *
 * @param outputs - Files to write
 * @param vaultRoot - Root directory
 * @param dryRun - If true, don't write anything
 * @returns List of paths that were written (or would be written)
 */
export async function writeOutputs(
  outputs: CompileOutput[],
  vaultRoot: string,
  dryRun: boolean,
): Promise<string[]> {
  const { valid, errors } = validateOutputs(outputs);
  if (!valid) {
    throw new Error(`Compile output validation failed:\n${errors.join('\n')}`);
  }

  const written: string[] = [];

  for (const output of outputs) {
    const fullPath = path.join(vaultRoot, output.path);

    if (dryRun) {
      written.push(output.path);
      continue;
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, output.content, 'utf-8');
    written.push(output.path);
  }

  return written;
}
