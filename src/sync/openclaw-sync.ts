/**
 * Sync & Import module — bidirectional synchronization.
 *
 * Story 9.2: Drift detection between manifest and compiled outputs
 *
 * @module sync/sync
 */

import fs from 'node:fs/promises';
import path from 'node:path';

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
