/**
 * Memory Files Generator — creates `.agentos/memory/` seed files.
 *
 * Bootstraps the Tulving-taxonomy memory layer with two always-loaded files
 * (`semantic.md`, `corrections.md`) and ensures the lazy-load directories
 * (`episodic/`, `procedural/`) exist for future use.
 *
 * All writes are idempotent: existing files are skipped, never overwritten.
 *
 * @see docs/architecture.md Section 4 "Boot Sequence" — memory bootstrap
 * @module generators/memory
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SetupAnswers, GeneratorResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// File content constants
// ---------------------------------------------------------------------------

/**
 * Seed content for `semantic.md`.
 *
 * Always loaded at boot. Stores context-free facts and preferences using
 * typed entry markers (PREF, FACT, PATTERN, AVOID) for structured retrieval.
 */
const SEMANTIC_CONTENT = `# Semantic Memory

> Context-free facts and preferences. Always loaded at boot.
> Format: TYPE: [status] content

## Preferences
<!-- PREF: entries go here -->

## Facts
<!-- FACT: [active] entries go here -->

## Patterns
<!-- PATTERN: [confidence:0.3] entries go here -->

## Avoids
<!-- AVOID: entries go here -->

## Directives
<!-- DIRECTIVE: imperative rules that must always be followed -->
`;

/**
 * Seed content for `corrections.md`.
 *
 * Loaded at boot alongside semantic memory. Records agent mistakes and
 * the lessons drawn from them so they are not repeated.
 */
const CORRECTIONS_CONTENT = `# Corrections

> Agent mistakes and lessons learned. Loaded at boot alongside semantic memory.
> Each entry: what went wrong, what was the fix, lesson learned.
`;

// ---------------------------------------------------------------------------
// generateMemoryFiles
// ---------------------------------------------------------------------------

/**
 * Generates seed memory files and lazy-load directories in `.agentos/memory/`.
 *
 * Files produced:
 * - `semantic.md`    — typed facts/preferences, always loaded at boot
 * - `corrections.md` — mistake log, always loaded at boot
 *
 * Directories ensured (created if absent, no-op if present):
 * - `episodic/`   — per-day event logs, lazy-loaded on demand
 * - `procedural/` — skill documents, lazy-loaded on demand
 *
 * @param answers - Setup answers from the interactive wizard.
 * @returns A `GeneratorResult` listing created and skipped paths.
 *
 * @example
 * ```ts
 * const result = await generateMemoryFiles(answers);
 * console.log(result.created);
 * // ['.agentos/memory/semantic.md', '.agentos/memory/corrections.md']
 * ```
 */
export async function generateMemoryFiles(answers: SetupAnswers): Promise<GeneratorResult> {
  const result: GeneratorResult = { created: [], skipped: [] };

  const memoryDir = path.join(answers.targetDir, '.agentos', 'memory');

  // Ensure the memory root and both lazy-load subdirectories exist.
  await fs.mkdir(path.join(memoryDir, 'episodic'), { recursive: true });
  await fs.mkdir(path.join(memoryDir, 'procedural'), { recursive: true });

  // Seed files to write — each is skipped if it already exists.
  const files: Array<{ name: string; content: string }> = [
    { name: 'semantic.md', content: SEMANTIC_CONTENT },
    { name: 'corrections.md', content: CORRECTIONS_CONTENT },
  ];

  for (const file of files) {
    const absPath = path.join(memoryDir, file.name);
    const relPath = path.join('.agentos', 'memory', file.name);

    try {
      await fs.access(absPath);
      // File already exists — skip.
      result.skipped.push(relPath);
    } catch {
      // File does not exist — write it.
      await fs.writeFile(absPath, file.content, 'utf8');
      result.created.push(relPath);
    }
  }

  return result;
}
