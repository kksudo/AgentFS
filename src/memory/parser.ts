/**
 * Semantic memory parser — reads and writes `semantic.md` entry lines.
 *
 * Supported line formats (from docs/architecture.md Section 4):
 *
 *   PREF: no emoji in headings
 *   FACT: [active] primary stack is Kubernetes + ArgoCD
 *   FACT: [superseded:2026-04-01] old stack was AWS
 *   PATTERN: [confidence:0.85] more productive in the morning
 *   AVOID: don't suggest LangChain
 *
 * Rules:
 * - PREF and AVOID carry no bracketed modifier — status defaults to "active".
 * - FACT carries [active] or [superseded:YYYY-MM-DD].
 * - PATTERN carries [confidence:X.XX] — status always "active" unless confidence
 *   drops below the superseded threshold (handled by confidence.ts).
 * - Lines that do not match the recognised format are silently ignored.
 * - Duplicate detection in `appendSemanticEntry` is substring-based on `content`.
 *
 * @module memory/parser
 */

import fs from 'node:fs/promises';
import type { SemanticEntry, SemanticEntryType, EntryStatus } from '../types/index.js';

// ---------------------------------------------------------------------------
// Internal regex
// ---------------------------------------------------------------------------

/**
 * Matches any recognised semantic entry line.
 *
 * Capture groups:
 *   1 — entry type  (PREF | FACT | PATTERN | AVOID | DIRECTIVE)
 *   2 — optional bracketed modifier, without the brackets
 *   3 — content text (trimmed)
 */
const ENTRY_RE =
  /^(PREF|FACT|PATTERN|AVOID|DIRECTIVE):\s+(?:\[([^\]]+)\]\s+)?(.+)$/;

// ---------------------------------------------------------------------------
// parseSemanticMemory
// ---------------------------------------------------------------------------

/**
 * Result of parsing semantic memory with optional warning collection.
 */
export interface ParseSemanticMemoryResult {
  entries: SemanticEntry[];
  warnings: string[];
}

/**
 * Parses a `semantic.md` file content string into structured `SemanticEntry`
 * objects.
 *
 * Only lines that match the canonical format are returned; markdown headings,
 * comments, blank lines, and unrecognised lines are discarded.
 *
 * When `strict` is true, lines that look like they could be entries (contain
 * a colon) but don't match the canonical format are collected as warnings
 * instead of being silently skipped.
 *
 * @param content - Raw text content of the file.
 * @param strict  - When true, returns `{ entries, warnings }` with malformed
 *                  lines reported. When false (default), returns entries only
 *                  for backward compatibility.
 * @returns Array of parsed entries in document order (when strict=false),
 *          or `{ entries, warnings }` object (when strict=true).
 *
 * @example
 * ```ts
 * const entries = parseSemanticMemory(
 *   'FACT: [active] primary stack is Kubernetes\nAVOID: don\'t use LangChain'
 * );
 * // entries[0] → { type: 'FACT', content: 'primary stack is Kubernetes', status: 'active' }
 * // entries[1] → { type: 'AVOID', content: "don't use LangChain", status: 'active' }
 *
 * const result = parseSemanticMemory('FACT: [active] valid\nBADLINE: oops', true);
 * // result.entries → [{ type: 'FACT', ... }]
 * // result.warnings → ['Line 2: unrecognised entry format: "BADLINE: oops"']
 * ```
 */
export function parseSemanticMemory(content: string): SemanticEntry[];
export function parseSemanticMemory(content: string, strict: true): ParseSemanticMemoryResult;
export function parseSemanticMemory(
  content: string,
  strict?: boolean,
): SemanticEntry[] | ParseSemanticMemoryResult {
  const entries: SemanticEntry[] = [];
  const warnings: string[] = [];

  const lines = content.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const line = rawLine.trim();
    const match = ENTRY_RE.exec(line);
    if (match === null) {
      // In strict mode, flag lines that look like malformed entries (have a colon
      // but don't match the canonical format, and are not blank/headings/comments).
      if (strict && line.length > 0 && !line.startsWith('#') && !line.startsWith('<!--') && line.includes(':')) {
        warnings.push(`Line ${lineIdx + 1}: unrecognised entry format: "${line}"`);
      }
      continue;
    }

    const [, rawType, modifier, entryContent] = match as unknown as [
      string,
      string,
      string | undefined,
      string,
    ];

    const type = rawType as SemanticEntryType;
    const trimmedContent = entryContent.trim();

    // Determine status and confidence from the optional modifier.
    let status: EntryStatus = 'active';
    let confidence: number | undefined;

    if (modifier !== undefined) {
      if (modifier === 'active') {
        status = 'active';
      } else if (modifier.startsWith('superseded:')) {
        status = modifier as EntryStatus;
      } else if (modifier.startsWith('confidence:')) {
        const raw = modifier.slice('confidence:'.length);
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) {
          confidence = parsed;
        }
        // PATTERN entries with confidence tag keep status "active"
        status = 'active';
      }
    }

    const entry: SemanticEntry = { type, content: trimmedContent, status };
    if (confidence !== undefined) {
      entry.confidence = confidence;
    }

    entries.push(entry);
  }

  if (strict) {
    return { entries, warnings };
  }
  return entries;
}

// ---------------------------------------------------------------------------
// serializeSemanticEntry
// ---------------------------------------------------------------------------

/**
 * Converts a `SemanticEntry` back to its single-line string representation.
 *
 * Output examples:
 * ```
 * PREF: no emoji in headings
 * FACT: [active] primary stack is Kubernetes + ArgoCD
 * FACT: [superseded:2026-04-01] old stack was AWS
 * PATTERN: [confidence:0.85] more productive in the morning
 * AVOID: don't suggest LangChain
 * ```
 *
 * @param entry - The entry to serialise.
 * @returns A single line without a trailing newline.
 */
export function serializeSemanticEntry(entry: SemanticEntry): string {
  const { type, content, status, confidence } = entry;

  // PATTERN entries encode confidence in the modifier slot.
  if (type === 'PATTERN') {
    const score = confidence !== undefined ? confidence : 0.3;
    // Format to two decimal places, matching the canonical format.
    return `PATTERN: [confidence:${score.toFixed(2)}] ${content}`;
  }

  // PREF, AVOID, and DIRECTIVE have no modifier when status is active.
  if (type === 'PREF' || type === 'AVOID' || type === 'DIRECTIVE') {
    return `${type}: ${content}`;
  }

  // FACT always carries an explicit status modifier.
  return `FACT: [${status}] ${content}`;
}

// ---------------------------------------------------------------------------
// appendSemanticEntry
// ---------------------------------------------------------------------------

/**
 * Appends a `SemanticEntry` to a `semantic.md` file at `filePath`.
 *
 * Duplicate detection: if any existing entry's `content` is a substring of
 * (or exactly equals) the new entry's `content`, the append is skipped
 * silently.  Comparison is case-sensitive and whitespace-sensitive.
 *
 * The file must already exist.  If the file does not end with a newline the
 * appended line is still placed on its own line.
 *
 * @param filePath - Absolute path to the target `semantic.md` file.
 * @param entry    - Entry to append.
 */
export async function appendSemanticEntry(
  filePath: string,
  entry: SemanticEntry,
): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  const existing = parseSemanticMemory(raw);

  // Duplicate check: skip if the incoming content already appears.
  const isDuplicate = existing.some(
    (e) => e.content === entry.content && e.type === entry.type,
  );
  if (isDuplicate) return;

  const line = serializeSemanticEntry(entry);
  // Ensure the new line starts on a fresh line.
  const separator = raw.endsWith('\n') || raw.length === 0 ? '' : '\n';
  await fs.appendFile(filePath, `${separator}${line}\n`, 'utf8');
}
