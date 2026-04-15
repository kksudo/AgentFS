/**
 * Secrets module — barrel export.
 * @module secrets
 */

export {
  addSecret,
  removeSecret,
  listSecrets,
  rotateSecret,
  getSecret,
  decryptSecrets,
  resolveSecretRefs,
  auditVault,
} from './vault.js';
export type { VaultAuditResult } from './vault.js';

export {
  scanForExfiltration,
  logViolation,
} from './exfil-guard.js';
export type { ExfilResult } from './exfil-guard.js';
