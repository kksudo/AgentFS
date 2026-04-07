/**
 * Memory INDEX.md generator — enforces lazy-load semantics for episodic and
 * procedural memory.
 *
 * Generates `.agentos/memory/INDEX.md` during compile. This file acts as the
 * agent's memory manifest: semantic memory is always loaded; episodic and
 * procedural files are loaded lazily only when explicitly needed.
 *
 * @module memory/memory-index
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CompileOutput } from '../types/index.js';
import { listEpisodicDates } from './episodic.js';
import { listProceduralSkills } from './procedural.js';

// ---------------------------------------------------------------------------
// generateMemoryIndex
// ---------------------------------------------------------------------------

/**
 * Generate the content and path for `.agentos/memory/INDEX.md`.
 *
 * Reads the episodic and procedural directories to list available files.
 * Returns a `CompileOutput` so callers can hand it to `writeOutputs`.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @returns CompileOutput for `.agentos/memory/INDEX.md`
 */
export async function generateMemoryIndex(vaultRoot: string): Promise<CompileOutput> {
  const [episodicDates, proceduralSkills, hasSemanticMemory] = await Promise.all([
    listEpisodicDates(vaultRoot),
    listProceduralSkills(vaultRoot),
    checkFileExists(path.join(vaultRoot, '.agentos', 'memory', 'semantic.md')),
  ]);

  const content = renderMemoryIndex(episodicDates, proceduralSkills, hasSemanticMemory);

  return {
    path: '.agentos/memory/INDEX.md',
    content,
    managed: true,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderMemoryIndex(
  episodicDates: string[],
  proceduralSkills: string[],
  hasSemanticMemory: boolean,
): string {
  const lines: string[] = [];

  lines.push('# Memory Index');
  lines.push('');
  lines.push('Agents: read this file first. Load episodic/procedural files only when explicitly needed.');
  lines.push('');

  // -------------------------------------------------------------------------
  // Semantic memory — always loaded at boot
  // -------------------------------------------------------------------------

  lines.push('## Semantic Memory (always loaded)');
  lines.push('');
  if (hasSemanticMemory) {
    lines.push('- `semantic.md` — preferences, facts, patterns, directives');
  } else {
    lines.push('- `semantic.md` — (not yet created)');
  }
  lines.push('');

  // -------------------------------------------------------------------------
  // Episodic memory — lazy, load only when needed
  // -------------------------------------------------------------------------

  lines.push('## Episodic Memory (lazy — load only when needed)');
  lines.push('');
  lines.push('Load a specific date file when the user asks about past events or decisions.');
  lines.push('');

  if (episodicDates.length === 0) {
    lines.push('- (no episodic entries yet)');
  } else {
    for (const date of episodicDates) {
      lines.push(`- \`episodic/${date}.md\``);
    }
  }
  lines.push('');

  // -------------------------------------------------------------------------
  // Procedural memory — lazy, load only when a skill is needed
  // -------------------------------------------------------------------------

  lines.push('## Procedural Memory (lazy — load by name when skill is needed)');
  lines.push('');
  lines.push('Load a specific skill file when the user asks to perform a known workflow.');
  lines.push('');

  if (proceduralSkills.length === 0) {
    lines.push('- (no procedural skills yet)');
  } else {
    for (const skill of proceduralSkills) {
      lines.push(`- \`procedural/${skill}.md\``);
    }
  }
  lines.push('');

  return lines.join('\n');
}
