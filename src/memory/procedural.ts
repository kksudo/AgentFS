/**
 * Procedural memory writer — creates/updates skill files.
 *
 * Procedural memory stores learned workflows as individual markdown files:
 *   `.agentos/memory/procedural/{skill-name}.md`
 *
 * Each file documents: description, steps, context, and optional examples.
 * Creates new files or overwrites existing ones (skills are versioned as a
 * whole, not appended line-by-line like episodic memory).
 *
 * @module memory/procedural
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProceduralEntry } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROCEDURAL_DIR = '.agentos/memory/procedural';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write or overwrite a procedural skill file.
 *
 * The skill name is slugified for the filename (lowercase, hyphens).
 * The full content is always rewritten — procedural skills are atomic.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @param entry     - The procedural entry to persist
 */
export async function writeProceduralEntry(
  vaultRoot: string,
  entry: ProceduralEntry,
): Promise<void> {
  const dir = path.join(vaultRoot, PROCEDURAL_DIR);
  await fs.mkdir(dir, { recursive: true });

  const slug = slugify(entry.name);
  const filePath = path.join(dir, `${slug}.md`);
  const content = renderProceduralEntry(entry);

  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Read a procedural entry by skill name, returning null if it doesn't exist.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @param name      - Skill name (will be slugified)
 * @returns The raw markdown content, or null
 */
export async function readProceduralEntry(
  vaultRoot: string,
  name: string,
): Promise<string | null> {
  const slug = slugify(name);
  const filePath = path.join(vaultRoot, PROCEDURAL_DIR, `${slug}.md`);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * List all procedural skill names available in the vault.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @returns Sorted array of skill names (derived from filenames)
 */
export async function listProceduralSkills(
  vaultRoot: string,
): Promise<string[]> {
  const dir = path.join(vaultRoot, PROCEDURAL_DIR);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Slugify a skill name: lowercase, spaces → hyphens, strip non-alnum.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Render a full procedural entry as markdown.
 */
function renderProceduralEntry(entry: ProceduralEntry): string {
  const lines: string[] = [];

  lines.push(`# ${entry.name}`);
  lines.push('');
  lines.push(entry.description);
  lines.push('');

  if (entry.context) {
    lines.push('## Context');
    lines.push(entry.context);
    lines.push('');
  }

  if (entry.steps.length > 0) {
    lines.push('## Steps');
    for (let i = 0; i < entry.steps.length; i++) {
      lines.push(`${i + 1}. ${entry.steps[i]}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
