/**
 * Confidence scoring engine for PATTERN entries in semantic memory.
 *
 * Implements the rules from docs/architecture.md Section 4:
 *
 *   New PATTERN  → confidence: 0.3  (DEFAULT_CONFIDENCE.initial)
 *   Confirmed    → confidence += 0.2  (max 1.0)
 *   Denied       → confidence -= 0.3
 *   Inactive 30 days → confidence -= 0.1  (decay)
 *   confidence < 0.1 → mark as superseded
 *
 * All functions are pure — they return a new `SemanticEntry` and never
 * mutate the input.  Non-PATTERN entries are returned unchanged.
 *
 * @module memory/confidence
 */

import { DEFAULT_CONFIDENCE } from '../types/index.js';
import type { SemanticEntry } from '../types/index.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a number to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns the effective confidence for an entry.
 * For non-PATTERN entries this is always 1.0 (not used in scoring).
 * For PATTERN entries it defaults to DEFAULT_CONFIDENCE.initial when absent.
 */
function effectiveConfidence(entry: SemanticEntry): number {
  if (entry.type !== 'PATTERN') return 1.0;
  return entry.confidence ?? DEFAULT_CONFIDENCE.initial;
}

/**
 * Returns a copy of `entry` with the given confidence applied, automatically
 * marking the entry as superseded when the score drops below the threshold.
 */
function withConfidence(entry: SemanticEntry, score: number): SemanticEntry {
  const clamped = clamp(score, 0, 1.0);

  if (clamped < DEFAULT_CONFIDENCE.supersededThreshold) {
    // Use today's date in YYYY-MM-DD format for the superseded marker.
    const today = new Date().toISOString().slice(0, 10);
    return {
      ...entry,
      confidence: clamped,
      status: `superseded:${today}`,
    };
  }

  return { ...entry, confidence: clamped, status: 'active' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Increases the confidence of a PATTERN entry by `confirmBoost` (default 0.2),
 * capped at 1.0.
 *
 * Non-PATTERN entries are returned unchanged.
 *
 * @param entry - The entry to confirm.
 * @returns A new entry with updated confidence.
 */
export function confirmPattern(entry: SemanticEntry): SemanticEntry {
  if (entry.type !== 'PATTERN') return entry;
  return withConfidence(
    entry,
    effectiveConfidence(entry) + DEFAULT_CONFIDENCE.confirmBoost,
  );
}

/**
 * Decreases the confidence of a PATTERN entry by `denyPenalty` (default 0.3).
 *
 * If the result drops below `supersededThreshold` (0.1) the entry is
 * automatically marked as superseded.
 *
 * Non-PATTERN entries are returned unchanged.
 *
 * @param entry - The entry to deny.
 * @returns A new entry with updated confidence and status.
 */
export function denyPattern(entry: SemanticEntry): SemanticEntry {
  if (entry.type !== 'PATTERN') return entry;
  return withConfidence(
    entry,
    effectiveConfidence(entry) - DEFAULT_CONFIDENCE.denyPenalty,
  );
}

/**
 * Applies time-based confidence decay to a PATTERN entry.
 *
 * Each full `decayDays`-period (default 30 days) of inactivity reduces
 * confidence by `decayRate` (default 0.1).  Fractional periods are truncated.
 *
 * Examples:
 * - 29 days inactive → 0 decay periods → no change
 * - 30 days inactive → 1 decay period  → -0.1
 * - 75 days inactive → 2 decay periods → -0.2
 *
 * Non-PATTERN entries are returned unchanged.
 *
 * @param entry             - The entry to decay.
 * @param daysSinceLastSeen - Number of days since the pattern was last confirmed.
 * @returns A new entry with decayed confidence (and possibly superseded status).
 */
export function decayPattern(
  entry: SemanticEntry,
  daysSinceLastSeen: number,
): SemanticEntry {
  if (entry.type !== 'PATTERN') return entry;

  const periods = Math.floor(daysSinceLastSeen / DEFAULT_CONFIDENCE.decayDays);
  if (periods === 0) return entry;

  return withConfidence(
    entry,
    effectiveConfidence(entry) - periods * DEFAULT_CONFIDENCE.decayRate,
  );
}

/**
 * Returns `true` when an entry has been marked as superseded.
 *
 * An entry is superseded when its `status` string starts with "superseded:".
 * This covers both confidence-driven supersession and manual date-based
 * supersession (e.g. `FACT: [superseded:2026-04-01] …`).
 *
 * @param entry - Any semantic entry.
 * @returns Whether the entry is superseded.
 */
export function isSuperseded(entry: SemanticEntry): boolean {
  return entry.status.startsWith('superseded:');
}
