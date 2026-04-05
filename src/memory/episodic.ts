/**
 * Episodic memory writer — creates/appends to daily event logs.
 *
 * Episodic memory stores timestamped session events in per-day markdown files:
 *   `.agentos/memory/episodic/YYYY-MM-DD.md`
 *
 * Each file contains sections for events, decisions, and lessons learned.
 * Appending is idempotent — duplicate event lines are skipped.
 *
 * @module memory/episodic
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { EpisodicEntry } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPISODIC_DIR = '.agentos/memory/episodic';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write or append an episodic entry for a given date.
 *
 * If the file for the date already exists, new events/decisions/lessons are
 * appended only if they are not already present (substring dedup).
 *
 * If the file does not exist, it is created with the full entry.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @param entry     - The episodic entry to persist
 */
export async function writeEpisodicEntry(
  vaultRoot: string,
  entry: EpisodicEntry,
): Promise<void> {
  const dir = path.join(vaultRoot, EPISODIC_DIR);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${entry.date}.md`);

  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch {
    // File doesn't exist — will create fresh
  }

  if (existing === null) {
    // Create new file
    const content = renderEpisodicEntry(entry);
    await fs.writeFile(filePath, content, 'utf8');
    return;
  }

  // Append new items that don't already exist
  const linesToAppend: string[] = [];

  for (const event of entry.events) {
    if (!existing.includes(event)) {
      linesToAppend.push(`- ${event}`);
    }
  }

  for (const decision of entry.decisions) {
    if (!existing.includes(decision)) {
      linesToAppend.push(`- **Decision:** ${decision}`);
    }
  }

  for (const lesson of entry.lessons) {
    if (!existing.includes(lesson)) {
      linesToAppend.push(`- **Lesson:** ${lesson}`);
    }
  }

  if (linesToAppend.length > 0) {
    const separator = existing.endsWith('\n') ? '' : '\n';
    await fs.appendFile(filePath, `${separator}${linesToAppend.join('\n')}\n`, 'utf8');
  }
}

/**
 * Read an episodic entry for a specific date, returning null if it doesn't exist.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @param date      - Date string in YYYY-MM-DD format
 * @returns The raw markdown content, or null
 */
export async function readEpisodicEntry(
  vaultRoot: string,
  date: string,
): Promise<string | null> {
  const filePath = path.join(vaultRoot, EPISODIC_DIR, `${date}.md`);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * List all episodic entry dates available in the vault.
 *
 * @param vaultRoot - Absolute path to the vault root directory
 * @returns Sorted array of date strings (YYYY-MM-DD)
 */
export async function listEpisodicDates(
  vaultRoot: string,
): Promise<string[]> {
  const dir = path.join(vaultRoot, EPISODIC_DIR);
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
 * Render a full episodic entry as markdown.
 */
function renderEpisodicEntry(entry: EpisodicEntry): string {
  const lines: string[] = [];

  lines.push(`# ${entry.date}`);
  lines.push('');

  if (entry.events.length > 0) {
    lines.push('## Events');
    for (const event of entry.events) {
      lines.push(`- ${event}`);
    }
    lines.push('');
  }

  if (entry.decisions.length > 0) {
    lines.push('## Decisions');
    for (const decision of entry.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  if (entry.lessons.length > 0) {
    lines.push('## Lessons');
    for (const lesson of entry.lessons) {
      lines.push(`- ${lesson}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
