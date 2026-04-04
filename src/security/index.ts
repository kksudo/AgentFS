/**
 * Security module — barrel export.
 * @module security
 */

export {
  readSecurityPolicy,
  writeSecurityPolicy,
  scanForInjections,
  checkCommand,
  DEFAULT_POLICY,
} from './parser.js';

export { compileClaudeSecurity } from './claude-compiler.js';
