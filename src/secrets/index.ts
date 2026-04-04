/**
 * Secrets module — barrel export.
 * @module secrets
 */

export {
  addSecret,
  removeSecret,
  listSecrets,
  rotateSecret,
  decryptSecrets,
  resolveSecretRefs,
} from './vault.js';

export {
  scanForExfiltration,
  logViolation,
} from './exfil-guard.js';
export type { ExfilResult } from './exfil-guard.js';
