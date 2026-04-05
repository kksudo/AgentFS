/**
 * Sync & Import module — bidirectional synchronization.
 *
 * Story 9.1: Import memory from native agent stores (e.g. .omc/project-memory.json)
 * Story 9.2: Drift detection between manifest and compiled outputs
 * Story 9.3: Bidirectional OpenClaw memory sync
 *
 * @module sync/sync
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSemanticMemory, appendSemanticEntry } from '../memory/parser.js';
import type { SemanticEntry } from '../types/index.js';

// ---------------------------------------------------------------------------
// Story 9.1: Memory Import
// ---------------------------------------------------------------------------

/**
 * Import memory facts from .omc/project-memory.json into semantic.md.
 * Canonical source always wins on conflicts — duplicates are skipped.
 *
 * @param vaultRoot - Vault root path
 * @returns Import result with counts
 */
export async function importFromOmc(
  vaultRoot: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const omcPath = path.join(vaultRoot, '.omc/project-memory.json');
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  let omcData: unknown;
  try {
    const raw = await fs.readFile(omcPath, 'utf8');
    omcData = JSON.parse(raw);
  } catch {
    return { imported: 0, skipped: 0, errors: ['Cannot read .omc/project-memory.json'] };
  }

  // Parse OMC memory format — expects { facts: string[] } or similar
  const facts = extractFactsFromOmc(omcData);
  if (facts.length === 0) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  // Ensure semantic.md exists
  try {
    await fs.access(semanticPath);
  } catch {
    return { imported: 0, skipped: 0, errors: ['No semantic.md found. Run agentfs onboard first.'] };
  }

  for (const fact of facts) {
    try {
      const entry: SemanticEntry = {
        type: 'FACT',
        content: fact,
        status: 'active',
      };
      // appendSemanticEntry handles dedup internally
      const before = await fs.readFile(semanticPath, 'utf8');
      await appendSemanticEntry(semanticPath, entry);
      const after = await fs.readFile(semanticPath, 'utf8');

      if (before === after) {
        skipped++;
      } else {
        imported++;
      }
    } catch {
      errors.push(`Failed to import fact: ${fact}`);
    }
  }

  return { imported, skipped, errors };
}

/**
 * Extract facts from OMC memory format.
 * Handles various shapes: { facts: [] }, { entries: [] }, or array directly.
 */
function extractFactsFromOmc(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.filter((d) => typeof d === 'string');
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Try common keys
    for (const key of ['facts', 'entries', 'memories', 'items']) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as unknown[])
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'content' in item) {
              return String((item as Record<string, unknown>).content);
            }
            return null;
          })
          .filter((s): s is string => s !== null);
      }
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Story 9.2: Drift Detection
// ---------------------------------------------------------------------------

/** Drift detection result for a single file. */
export interface DriftResult {
  file: string;
  drifted: boolean;
  currentHash: string;
  expectedHash: string;
}

/**
 * Detect drift between compiled outputs and what compile would generate.
 *
 * Simple approach: compare file content hashes.
 *
 * @param vaultRoot - Vault root path
 * @param files     - List of managed file paths to check
 * @returns Array of DriftResults
 */
export async function detectDrift(
  vaultRoot: string,
  files: string[],
): Promise<DriftResult[]> {
  const results: DriftResult[] = [];

  for (const file of files) {
    const filePath = path.join(vaultRoot, file);
    let currentHash = '';

    try {
      const content = await fs.readFile(filePath, 'utf8');
      currentHash = simpleHash(content);
    } catch {
      currentHash = 'MISSING';
    }

    results.push({
      file,
      drifted: false, // Will be set to true when we have compiled comparison
      currentHash,
      expectedHash: '', // Populated during compile comparison
    });
  }

  return results;
}

/**
 * Simple string hash for drift detection.
 * Not cryptographic — just for comparison.
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

// ---------------------------------------------------------------------------
// Story 9.3: Export to OMC
// ---------------------------------------------------------------------------

/**
 * Export semantic memory to .omc/project-memory.json format.
 *
 * @param vaultRoot - Vault root path
 * @returns Number of entries exported
 */
export async function exportToOmc(
  vaultRoot: string,
): Promise<number> {
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    return 0;
  }

  const entries = parseSemanticMemory(content);
  const active = entries.filter((e) => e.status === 'active');

  const omcData = {
    version: '1.0',
    source: 'agentfs',
    facts: active.map((e) => `${e.type}: ${e.content}`),
  };

  const omcDir = path.join(vaultRoot, '.omc');
  await fs.mkdir(omcDir, { recursive: true });
  await fs.writeFile(
    path.join(omcDir, 'project-memory.json'),
    JSON.stringify(omcData, null, 2) + '\n',
    'utf8'
  );

  return active.length;
}
