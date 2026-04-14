/**
 * Distillation cron job — Issue #10.
 *
 * Runs every 2 days to extract recurring patterns from episodic memory
 * and promote them to semantic memory as PATTERN entries.
 *
 * Algorithm:
 * 1. Read recent episodic entries (configurable window, default 14 days)
 * 2. Extract lessons learned lines
 * 3. Find lessons that appear in 2+ different entries (recurring → pattern)
 * 4. Append new PATTERN entries to semantic.md (deduped by appendSemanticEntry)
 * 5. Apply temporal decay to existing PATTERN entries
 * 6. Write a distillation event to today's episodic log
 *
 * Since AgentFS is LLM-free, pattern detection is lexical:
 * exact-match and normalised-lowercase deduplication.
 *
 * @module cron/jobs/distillation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CronJob, CronResult } from '../types.js';
import {
  parseSemanticMemory,
  appendSemanticEntry,
  isSuperseded,
} from '../../memory/index.js';
import { decayPattern } from '../../memory/confidence.js';
import { listEpisodicDates, readEpisodicEntry, writeEpisodicEntry } from '../../memory/episodic.js';
import { serializeSemanticEntry } from '../../memory/parser.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many days back to scan for recurring lessons. */
const DEFAULT_WINDOW_DAYS = 14;

/** Minimum occurrences across distinct days before promoting to PATTERN. */
const MIN_OCCURRENCES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a lesson string for deduplication:
 * lowercase, collapse whitespace, strip trailing punctuation.
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
}

/**
 * Extract lesson lines from an episodic entry markdown string.
 *
 * Handles two formats produced by `writeEpisodicEntry`:
 *   - New file (renderEpisodicEntry): `- lesson text`
 *   - Appended:                       `- **Lesson:** lesson text`
 *
 * Only lines inside the "## Lessons" section are collected.
 */
function extractLessons(content: string): string[] {
  const lessons: string[] = [];
  let inLessons = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('## Lessons')) {
      inLessons = true;
      continue;
    }
    if (inLessons) {
      if (line.startsWith('## ')) {
        inLessons = false;
        continue;
      }
      // Match: "- **Lesson:** text" or "- text"
      const withPrefix = line.match(/^-\s+\*\*Lesson:\*\*\s+(.+)$/);
      const plain = line.match(/^-\s+(?!\*\*)(.+)$/);
      if (withPrefix) {
        lessons.push(withPrefix[1].trim());
      } else if (plain) {
        lessons.push(plain[1].trim());
      }
    }
  }
  return lessons;
}

/**
 * Apply temporal decay to all PATTERN entries in semantic.md and rewrite the file.
 * Returns the number of entries decayed.
 */
async function applyDecayToFile(semanticPath: string): Promise<number> {
  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    return 0;
  }

  let decayCount = 0;
  const newLines: string[] = [];

  // Rebuild file line by line, parsing each PATTERN line independently.
  // This avoids the false-positive substring matching that occurs when
  // correlating pre-parsed entries back against raw lines.
  for (const line of content.split('\n')) {
    if (line.startsWith('PATTERN:')) {
      const parsed = parseSemanticMemory(line);
      if (parsed.length === 1 && parsed[0].type === 'PATTERN' && !isSuperseded(parsed[0])) {
        const decayed = decayPattern(parsed[0], DEFAULT_WINDOW_DAYS);
        if (decayed.confidence !== parsed[0].confidence) {
          decayCount++;
          newLines.push(serializeSemanticEntry(decayed));
          continue;
        }
      }
    }
    newLines.push(line);
  }

  if (decayCount > 0) {
    await fs.writeFile(semanticPath, newLines.join('\n'), 'utf8');
  }

  return decayCount;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export const distillationJob: CronJob = {
  name: 'distillation',
  description: 'Extract recurring patterns from episodic memory → semantic PATTERN entries',

  async run(vaultRoot: string): Promise<CronResult> {
    const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

    // Verify semantic memory exists
    try {
      await fs.access(semanticPath);
    } catch {
      return {
        success: false,
        job: 'distillation',
        message: 'No semantic memory found. Run `agentfs onboard` first.',
      };
    }

    // 1. Collect recent episodic dates within the window
    const allDates = await listEpisodicDates(vaultRoot);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEFAULT_WINDOW_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recentDates = allDates.filter((d) => d >= cutoffStr);

    // 2. Extract lessons from each date's entry
    const lessonsByDate: Map<string, string[]> = new Map();
    for (const date of recentDates) {
      const content = await readEpisodicEntry(vaultRoot, date);
      if (content) {
        const lessons = extractLessons(content);
        if (lessons.length > 0) {
          lessonsByDate.set(date, lessons);
        }
      }
    }

    // 3. Count occurrences per normalised lesson (across distinct days)
    const occurrences: Map<string, { count: number; raw: string }> = new Map();
    for (const [, lessons] of lessonsByDate) {
      const seenInDay = new Set<string>();
      for (const lesson of lessons) {
        const key = normalise(lesson);
        if (!seenInDay.has(key)) {
          seenInDay.add(key);
          const existing = occurrences.get(key);
          if (existing) {
            existing.count++;
          } else {
            occurrences.set(key, { count: 1, raw: lesson });
          }
        }
      }
    }

    // 4. Promote recurring lessons to PATTERN entries.
    // Read current semantic content once for dedup check — appendSemanticEntry
    // skips duplicates silently, which would inflate the promoted counter.
    const currentSemantic = await fs.readFile(semanticPath, 'utf8');
    const existingEntries = parseSemanticMemory(currentSemantic);

    let promoted = 0;
    for (const [key, { count, raw }] of occurrences) {
      if (count >= MIN_OCCURRENCES) {
        const alreadyExists = existingEntries.some(
          (e) => e.type === 'PATTERN' && normalise(e.content) === key,
        );
        if (!alreadyExists) {
          await appendSemanticEntry(semanticPath, {
            type: 'PATTERN',
            content: raw,
            status: 'active',
            confidence: 0.3,
          });
          promoted++;
        }
      }
    }

    // 5. Apply temporal decay to existing PATTERN entries
    const decayed = await applyDecayToFile(semanticPath);

    // 6. Record distillation event in today's episodic log
    const today = new Date().toISOString().slice(0, 10);
    await writeEpisodicEntry(vaultRoot, {
      date: today,
      events: [`Distillation ran — scanned ${recentDates.length} days, promoted ${promoted} patterns, decayed ${decayed} patterns`],
      decisions: [],
      lessons: [],
    });

    return {
      success: true,
      job: 'distillation',
      message: `Distillation complete. Scanned ${recentDates.length} episodic entries (last ${DEFAULT_WINDOW_DAYS} days). Promoted ${promoted} new patterns. Applied decay to ${decayed} patterns.`,
      details: {
        windowDays: DEFAULT_WINDOW_DAYS,
        datesScanned: recentDates.length,
        lessonsFound: [...occurrences.values()].reduce((s, v) => s + v.count, 0),
        promoted,
        decayed,
      },
    };
  },
};
