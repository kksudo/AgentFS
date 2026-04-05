/**
 * Exfiltration guard — Story 8.4.
 *
 * Scans output text for patterns that may indicate secret leakage.
 * Logs violations to `.agentos/security/audit/violations.log`.
 *
 * @module secrets/exfil-guard
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecurityPolicy } from '../types/index.js';

const AUDIT_DIR = '.agentos/security/audit';
const VIOLATIONS_LOG = 'violations.log';

/** Result of an exfiltration scan. */
export interface ExfilResult {
  clean: boolean;
  matches: string[];
}

/**
 * Scan text for exfiltration patterns defined in security policy.
 *
 * @param text   - Text to scan (agent output, file content, etc.)
 * @param policy - Security policy with deny_exfil_patterns
 * @returns ExfilResult with matches
 */
export function scanForExfiltration(
  text: string,
  policy: SecurityPolicy,
): ExfilResult {
  const matches: string[] = [];

  for (const pattern of policy.network.deny_exfil_patterns) {
    try {
      const regex = new RegExp(pattern.regex, 'gi');
      const found = text.match(regex);
      if (found) {
        matches.push(...found);
      }
    } catch {
      // Invalid regex — skip silently
    }
  }

  return { clean: matches.length === 0, matches };
}

/**
 * Log an exfiltration violation to the audit log.
 *
 * @param vaultRoot - Vault root path
 * @param source    - Where the violation was detected
 * @param matches   - Matched patterns
 */
export async function logViolation(
  vaultRoot: string,
  source: string,
  matches: string[],
): Promise<void> {
  const dir = path.join(vaultRoot, AUDIT_DIR);
  await fs.mkdir(dir, { recursive: true });

  const logPath = path.join(dir, VIOLATIONS_LOG);
  const timestamp = new Date().toISOString();
  const lines = matches.map(
    (m) => `[${timestamp}] EXFIL_DETECTED source=${source} match="${m}"\n`
  );

  await fs.appendFile(logPath, lines.join(''), 'utf8');
}
