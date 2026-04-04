/**
 * Init Scripts Generator — creates `.agentos/init.d/` boot scripts.
 *
 * Generates four SysVinit-style boot scripts that agents load at startup.
 * Each script follows the runlevel 3 boot sequence defined in the manifest.
 * All writes are idempotent: existing files are skipped, never overwritten.
 *
 * @see docs/architecture.md Section 4 "Boot Sequence"
 * @module generators/init
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SetupAnswers, GeneratorResult } from '../types/index.js';
import { getDefaultPaths } from '../utils/fhs-mapping.js';
import type { FhsPaths } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's date formatted as YYYY-MM-DD (local time).
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formats the FHS path table for the 00-identity.md vault paths section.
 *
 * Each line is a bullet mapping the FHS key to its vault directory, e.g.:
 *   - tmp → Inbox
 *
 * @param paths - Resolved FhsPaths for the chosen profile.
 * @returns Markdown bullet list, one mapping per defined path.
 */
function formatPathMappings(paths: FhsPaths): string {
  return (Object.entries(paths) as [keyof FhsPaths, string | undefined][])
    .filter((entry): entry is [keyof FhsPaths, string] => entry[1] !== undefined)
    .map(([key, dir]) => `- ${key} → ${dir}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Script content builders
// ---------------------------------------------------------------------------

/**
 * Builds the content of `00-identity.md`.
 *
 * Embeds the owner name and the full FHS→vault path mapping for the chosen
 * profile so agents know where every standard directory lives at boot.
 */
function buildIdentityScript(ownerName: string, paths: FhsPaths): string {
  return `# Agent Identity

## Owner
- Name: ${ownerName}
- Role: (to be filled during onboard)
- Style: (to be filled during onboard)

## Agent Rules
- Follow vault conventions (frontmatter, naming, paths)
- Challenge weak decisions
- Don't repeat the obvious

## Vault Paths
${formatPathMappings(paths)}
`;
}

/**
 * Builds the content of `10-memory.md`.
 *
 * Declares Tulving's taxonomy loading strategy: semantic memory is always
 * loaded at boot; episodic and procedural memories are lazy-loaded on demand.
 */
function buildMemoryScript(): string {
  return `# Memory Bootstrap (Tulving's taxonomy)

## Always load:
- .agentos/memory/semantic.md
- .agentos/memory/corrections.md

## Lazy load (on demand):
- .agentos/memory/episodic/ — load specific day when needed
- .agentos/memory/procedural/ — load specific skill when needed
`;
}

/**
 * Builds the content of `20-today.md`.
 *
 * Points the agent at today's daily note and the active task queue files,
 * using the vault paths resolved from the chosen profile.
 */
function buildTodayScript(paths: FhsPaths): string {
  return `# Daily Context

## Load today's daily note:
- ${paths.log}/${todayIso()}.md

## Load active tasks:
- ${paths.spool}/priorities.md
- ${paths.spool}/backlog.md
`;
}

/**
 * Builds the content of `30-projects.md`.
 *
 * Instructs the agent to scan project directories for READMEs and detect
 * active projects via frontmatter status fields.
 */
function buildProjectsScript(paths: FhsPaths): string {
  return `# Active Projects

## Load project READMEs from:
- ${paths.home}/*/README.md

## Active project detection:
- Look for status: active in frontmatter
`;
}

// ---------------------------------------------------------------------------
// generateInitScripts
// ---------------------------------------------------------------------------

/**
 * Generates the four `init.d/` boot scripts inside the target vault.
 *
 * Scripts produced (in load order):
 * - `00-identity.md` — owner info, agent rules, vault path map
 * - `10-memory.md`   — Tulving memory bootstrap strategy
 * - `20-today.md`    — daily note and active task references
 * - `30-projects.md` — active project detection instructions
 *
 * Behaviour:
 * - Creates `.agentos/init.d/` directory if absent (recursive, safe).
 * - Skips any file that already exists (idempotent).
 * - Relative paths are reported in `GeneratorResult` for display.
 *
 * @param answers - Setup answers from the interactive wizard.
 * @returns A `GeneratorResult` listing created and skipped paths.
 *
 * @example
 * ```ts
 * const result = await generateInitScripts(answers);
 * console.log(result.created);  // ['.agentos/init.d/00-identity.md', ...]
 * console.log(result.skipped);  // []
 * ```
 */
export async function generateInitScripts(answers: SetupAnswers): Promise<GeneratorResult> {
  const result: GeneratorResult = { created: [], skipped: [] };

  const initDir = path.join(answers.targetDir, '.agentos', 'init.d');
  await fs.mkdir(initDir, { recursive: true });

  const paths = getDefaultPaths(answers.profile);

  const scripts: Array<{ name: string; content: string }> = [
    { name: '00-identity.md', content: buildIdentityScript(answers.ownerName, paths) },
    { name: '10-memory.md', content: buildMemoryScript() },
    { name: '20-today.md', content: buildTodayScript(paths) },
    { name: '30-projects.md', content: buildProjectsScript(paths) },
  ];

  for (const script of scripts) {
    const absPath = path.join(initDir, script.name);
    const relPath = path.join('.agentos', 'init.d', script.name);

    try {
      await fs.access(absPath);
      // File already exists — skip.
      result.skipped.push(relPath);
    } catch {
      // File does not exist — write it.
      await fs.writeFile(absPath, script.content, 'utf8');
      result.created.push(relPath);
    }
  }

  return result;
}
