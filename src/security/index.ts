/**
 * Security module — barrel export.
 * @module security
 */

export {
  readSecurityPolicy,
  writeSecurityPolicy,
  validateSecurityPolicy,
  scanForInjections,
  checkCommand,
  DEFAULT_POLICY,
} from './parser.js';
export type { SecurityPolicyResult } from './parser.js';

export { compileClaudeSecurity } from './claude-compiler.js';
