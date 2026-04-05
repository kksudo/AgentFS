/**
 * Tests for the memory module: parser, serialiser, and confidence engine.
 *
 * Coverage targets:
 * - Parse all four entry types (PREF, FACT, PATTERN, AVOID)
 * - Parse active and superseded status variants
 * - Parse confidence scores on PATTERN entries
 * - Serialize round-trip fidelity (parse → serialize → parse = same)
 * - Confidence: confirm increases, deny decreases, decay applies per 30-day
 *   period, superseded threshold triggers status change
 * - Append deduplication (same type + content is not appended twice)
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseSemanticMemory,
  serializeSemanticEntry,
  appendSemanticEntry,
  confirmPattern,
  denyPattern,
  decayPattern,
  isSuperseded,
} from '../src/memory/index.js';
import { DEFAULT_CONFIDENCE } from '../src/types/index.js';
import type { SemanticEntry } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePattern(confidence: number): SemanticEntry {
  return { type: 'PATTERN', content: 'more productive in the morning', status: 'active', confidence };
}

// ---------------------------------------------------------------------------
// parseSemanticMemory — entry type parsing
// ---------------------------------------------------------------------------

describe('parseSemanticMemory — entry types', () => {
  test('parses PREF entry without modifier', () => {
    const entries = parseSemanticMemory('PREF: no emoji in headings');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject<SemanticEntry>({
      type: 'PREF',
      content: 'no emoji in headings',
      status: 'active',
    });
    expect(entries[0].confidence).toBeUndefined();
  });

  test('parses AVOID entry without modifier', () => {
    const entries = parseSemanticMemory("AVOID: don't suggest LangChain");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject<SemanticEntry>({
      type: 'AVOID',
      content: "don't suggest LangChain",
      status: 'active',
    });
    expect(entries[0].confidence).toBeUndefined();
  });

  test('parses FACT with [active] modifier', () => {
    const entries = parseSemanticMemory('FACT: [active] primary stack is Kubernetes + ArgoCD');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject<SemanticEntry>({
      type: 'FACT',
      content: 'primary stack is Kubernetes + ArgoCD',
      status: 'active',
    });
  });

  test('parses FACT with [superseded:YYYY-MM-DD] modifier', () => {
    const entries = parseSemanticMemory('FACT: [superseded:2026-04-01] old stack was AWS');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject<SemanticEntry>({
      type: 'FACT',
      content: 'old stack was AWS',
      status: 'superseded:2026-04-01',
    });
  });

  test('parses PATTERN with confidence score', () => {
    const entries = parseSemanticMemory('PATTERN: [confidence:0.85] more productive in the morning');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject<SemanticEntry>({
      type: 'PATTERN',
      content: 'more productive in the morning',
      status: 'active',
      confidence: 0.85,
    });
  });

  test('parses PATTERN with confidence 0.30 (two decimal places)', () => {
    const entries = parseSemanticMemory('PATTERN: [confidence:0.30] early riser');
    expect(entries[0].confidence).toBeCloseTo(0.3);
  });

  test('ignores markdown headings and blank lines', () => {
    const content = [
      '# Semantic Memory',
      '',
      '## Preferences',
      'PREF: prefer concise answers',
      '',
      '## Facts',
    ].join('\n');
    const entries = parseSemanticMemory(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('PREF');
  });

  test('ignores comment lines and unknown lines', () => {
    const content = [
      '<!-- PREF: entries go here -->',
      'Some random prose line',
      'FACT: [active] valid fact',
    ].join('\n');
    const entries = parseSemanticMemory(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('valid fact');
  });

  test('parses multiple entries from a full file block', () => {
    const content = [
      'PREF: no emoji in headings',
      'FACT: [active] primary stack is Kubernetes + ArgoCD',
      'FACT: [superseded:2026-04-01] old stack was AWS',
      'PATTERN: [confidence:0.85] more productive in the morning',
      "AVOID: don't suggest LangChain",
    ].join('\n');
    const entries = parseSemanticMemory(content);
    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.type)).toEqual(['PREF', 'FACT', 'FACT', 'PATTERN', 'AVOID']);
  });
});

// ---------------------------------------------------------------------------
// serializeSemanticEntry — output format
// ---------------------------------------------------------------------------

describe('serializeSemanticEntry — output format', () => {
  test('serialises PREF without modifier', () => {
    const entry: SemanticEntry = { type: 'PREF', content: 'no emoji in headings', status: 'active' };
    expect(serializeSemanticEntry(entry)).toBe('PREF: no emoji in headings');
  });

  test('serialises AVOID without modifier', () => {
    const entry: SemanticEntry = { type: 'AVOID', content: "don't suggest LangChain", status: 'active' };
    expect(serializeSemanticEntry(entry)).toBe("AVOID: don't suggest LangChain");
  });

  test('serialises FACT [active]', () => {
    const entry: SemanticEntry = { type: 'FACT', content: 'primary stack is Kubernetes', status: 'active' };
    expect(serializeSemanticEntry(entry)).toBe('FACT: [active] primary stack is Kubernetes');
  });

  test('serialises FACT [superseded:date]', () => {
    const entry: SemanticEntry = { type: 'FACT', content: 'old stack was AWS', status: 'superseded:2026-04-01' };
    expect(serializeSemanticEntry(entry)).toBe('FACT: [superseded:2026-04-01] old stack was AWS');
  });

  test('serialises PATTERN with two-decimal confidence', () => {
    const entry: SemanticEntry = { type: 'PATTERN', content: 'more productive in the morning', status: 'active', confidence: 0.85 };
    expect(serializeSemanticEntry(entry)).toBe('PATTERN: [confidence:0.85] more productive in the morning');
  });

  test('serialises PATTERN with default confidence when confidence is absent', () => {
    const entry: SemanticEntry = { type: 'PATTERN', content: 'early riser', status: 'active' };
    expect(serializeSemanticEntry(entry)).toBe('PATTERN: [confidence:0.30] early riser');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parse → serialize → parse
// ---------------------------------------------------------------------------

describe('round-trip fidelity', () => {
  const canonical = [
    'PREF: no emoji in headings',
    'FACT: [active] primary stack is Kubernetes + ArgoCD',
    'FACT: [superseded:2026-04-01] old stack was AWS',
    'PATTERN: [confidence:0.85] more productive in the morning',
    "AVOID: don't suggest LangChain",
  ];

  test('each canonical line survives parse → serialize → parse unchanged', () => {
    for (const line of canonical) {
      const [parsed] = parseSemanticMemory(line);
      const serialised = serializeSemanticEntry(parsed);
      const [reparsed] = parseSemanticMemory(serialised);

      expect(reparsed.type).toBe(parsed.type);
      expect(reparsed.content).toBe(parsed.content);
      expect(reparsed.status).toBe(parsed.status);
      if (parsed.confidence !== undefined) {
        expect(reparsed.confidence).toBeCloseTo(parsed.confidence, 5);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// confirmPattern
// ---------------------------------------------------------------------------

describe('confirmPattern', () => {
  test('increases confidence by 0.2', () => {
    const entry = makePattern(0.5);
    expect(confirmPattern(entry).confidence).toBeCloseTo(0.7);
  });

  test('clamps at 1.0', () => {
    const entry = makePattern(0.9);
    expect(confirmPattern(entry).confidence).toBeCloseTo(1.0);
  });

  test('does not exceed 1.0 when already at 1.0', () => {
    const entry = makePattern(1.0);
    expect(confirmPattern(entry).confidence).toBeCloseTo(1.0);
  });

  test('uses DEFAULT_CONFIDENCE.initial when confidence is absent', () => {
    const entry: SemanticEntry = { type: 'PATTERN', content: 'test', status: 'active' };
    const confirmed = confirmPattern(entry);
    expect(confirmed.confidence).toBeCloseTo(DEFAULT_CONFIDENCE.initial + DEFAULT_CONFIDENCE.confirmBoost);
  });

  test('returns non-PATTERN entries unchanged', () => {
    const entry: SemanticEntry = { type: 'FACT', content: 'test', status: 'active' };
    expect(confirmPattern(entry)).toBe(entry);
  });

  test('keeps status active after confirm', () => {
    const entry = makePattern(0.5);
    expect(confirmPattern(entry).status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// denyPattern
// ---------------------------------------------------------------------------

describe('denyPattern', () => {
  test('decreases confidence by 0.3', () => {
    const entry = makePattern(0.8);
    expect(denyPattern(entry).confidence).toBeCloseTo(0.5);
  });

  test('marks as superseded when confidence drops below 0.1', () => {
    const entry = makePattern(0.3);
    const denied = denyPattern(entry); // 0.3 - 0.3 = 0.0 → superseded
    expect(denied.confidence).toBeCloseTo(0.0);
    expect(isSuperseded(denied)).toBe(true);
  });

  test('marks as superseded when confidence is exactly at threshold after deny', () => {
    // 0.35 - 0.3 = 0.05, which is below threshold 0.1
    const entry = makePattern(0.35);
    expect(isSuperseded(denyPattern(entry))).toBe(true);
  });

  test('does not supersede when result is exactly 0.1', () => {
    // 0.4 - 0.3 = 0.1, not below threshold
    const entry = makePattern(0.4);
    const denied = denyPattern(entry);
    expect(denied.confidence).toBeCloseTo(0.1);
    expect(isSuperseded(denied)).toBe(false);
  });

  test('clamps to 0 — never negative', () => {
    const entry = makePattern(0.0);
    expect(denyPattern(entry).confidence).toBeCloseTo(0.0);
  });

  test('returns non-PATTERN entries unchanged', () => {
    const entry: SemanticEntry = { type: 'AVOID', content: 'test', status: 'active' };
    expect(denyPattern(entry)).toBe(entry);
  });

  test('superseded status includes today date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const entry = makePattern(0.1);
    // 0.1 - 0.3 → -0.2, clamp to 0.0 → superseded
    const denied = denyPattern(entry);
    expect(denied.status).toBe(`superseded:${today}`);
  });
});

// ---------------------------------------------------------------------------
// decayPattern
// ---------------------------------------------------------------------------

describe('decayPattern', () => {
  test('no decay when days < 30', () => {
    const entry = makePattern(0.8);
    expect(decayPattern(entry, 29).confidence).toBeCloseTo(0.8);
  });

  test('one decay period at exactly 30 days', () => {
    const entry = makePattern(0.8);
    expect(decayPattern(entry, 30).confidence).toBeCloseTo(0.7);
  });

  test('one decay period at 59 days (< 2 full periods)', () => {
    const entry = makePattern(0.8);
    expect(decayPattern(entry, 59).confidence).toBeCloseTo(0.7);
  });

  test('two decay periods at 60 days', () => {
    const entry = makePattern(0.8);
    expect(decayPattern(entry, 60).confidence).toBeCloseTo(0.6);
  });

  test('two decay periods at 75 days (as per architecture example)', () => {
    const entry = makePattern(0.5);
    expect(decayPattern(entry, 75).confidence).toBeCloseTo(0.3);
  });

  test('marks as superseded when decay pushes below threshold', () => {
    const entry = makePattern(0.15);
    // 1 period → 0.15 - 0.1 = 0.05 → superseded
    expect(isSuperseded(decayPattern(entry, 30))).toBe(true);
  });

  test('returns entry unchanged when daysSinceLastSeen is 0', () => {
    const entry = makePattern(0.5);
    // Same object reference — no copy needed.
    expect(decayPattern(entry, 0).confidence).toBeCloseTo(0.5);
  });

  test('returns non-PATTERN entries unchanged', () => {
    const entry: SemanticEntry = { type: 'PREF', content: 'test', status: 'active' };
    expect(decayPattern(entry, 60)).toBe(entry);
  });
});

// ---------------------------------------------------------------------------
// isSuperseded
// ---------------------------------------------------------------------------

describe('isSuperseded', () => {
  test('returns true for FACT with superseded status', () => {
    const entry: SemanticEntry = { type: 'FACT', content: 'old fact', status: 'superseded:2026-04-01' };
    expect(isSuperseded(entry)).toBe(true);
  });

  test('returns false for FACT with active status', () => {
    const entry: SemanticEntry = { type: 'FACT', content: 'current fact', status: 'active' };
    expect(isSuperseded(entry)).toBe(false);
  });

  test('returns false for PATTERN with active status', () => {
    expect(isSuperseded(makePattern(0.9))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// appendSemanticEntry — deduplication
// ---------------------------------------------------------------------------

describe('appendSemanticEntry', () => {
  let tmpFile: string;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-test-'));
    tmpFile = path.join(dir, 'semantic.md');
    await fs.writeFile(tmpFile, '', 'utf8');
  });

  test('appends a new entry to an empty file', async () => {
    const entry: SemanticEntry = { type: 'PREF', content: 'no emoji in headings', status: 'active' };
    await appendSemanticEntry(tmpFile, entry);
    const content = await fs.readFile(tmpFile, 'utf8');
    expect(content.trim()).toBe('PREF: no emoji in headings');
  });

  test('appends multiple distinct entries', async () => {
    const e1: SemanticEntry = { type: 'PREF', content: 'concise answers', status: 'active' };
    const e2: SemanticEntry = { type: 'AVOID', content: "don't use LangChain", status: 'active' };
    await appendSemanticEntry(tmpFile, e1);
    await appendSemanticEntry(tmpFile, e2);
    const entries = parseSemanticMemory(await fs.readFile(tmpFile, 'utf8'));
    expect(entries).toHaveLength(2);
  });

  test('does not append a duplicate entry (same type + content)', async () => {
    const entry: SemanticEntry = { type: 'PREF', content: 'no emoji in headings', status: 'active' };
    await appendSemanticEntry(tmpFile, entry);
    await appendSemanticEntry(tmpFile, entry); // second call — should be skipped
    const entries = parseSemanticMemory(await fs.readFile(tmpFile, 'utf8'));
    expect(entries).toHaveLength(1);
  });

  test('allows same content with different type (PREF vs AVOID)', async () => {
    const e1: SemanticEntry = { type: 'PREF', content: 'keep it short', status: 'active' };
    const e2: SemanticEntry = { type: 'AVOID', content: 'keep it short', status: 'active' };
    await appendSemanticEntry(tmpFile, e1);
    await appendSemanticEntry(tmpFile, e2);
    const entries = parseSemanticMemory(await fs.readFile(tmpFile, 'utf8'));
    expect(entries).toHaveLength(2);
  });

  test('appends correctly when file already has a trailing newline', async () => {
    await fs.writeFile(tmpFile, 'PREF: existing entry\n', 'utf8');
    const entry: SemanticEntry = { type: 'AVOID', content: 'no jest', status: 'active' };
    await appendSemanticEntry(tmpFile, entry);
    const content = await fs.readFile(tmpFile, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('AVOID: no jest');
  });

  test('appends correctly when file has no trailing newline', async () => {
    await fs.writeFile(tmpFile, 'PREF: existing entry', 'utf8'); // no trailing \n
    const entry: SemanticEntry = { type: 'AVOID', content: 'no verbose output', status: 'active' };
    await appendSemanticEntry(tmpFile, entry);
    const content = await fs.readFile(tmpFile, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('AVOID: no verbose output');
  });

  test('appends a PATTERN entry with correct confidence format', async () => {
    const entry: SemanticEntry = {
      type: 'PATTERN',
      content: 'more productive in the morning',
      status: 'active',
      confidence: 0.85,
    };
    await appendSemanticEntry(tmpFile, entry);
    const content = await fs.readFile(tmpFile, 'utf8');
    expect(content.trim()).toBe('PATTERN: [confidence:0.85] more productive in the morning');
  });

  test('appends a FACT entry with [active] modifier', async () => {
    const entry: SemanticEntry = {
      type: 'FACT',
      content: 'primary stack is Kubernetes',
      status: 'active',
    };
    await appendSemanticEntry(tmpFile, entry);
    const content = await fs.readFile(tmpFile, 'utf8');
    expect(content.trim()).toBe('FACT: [active] primary stack is Kubernetes');
  });
});
