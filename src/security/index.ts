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
  logViolation,
  DEFAULT_POLICY,
} from './parser.js';
export type { SecurityPolicyResult } from './parser.js';

export { compileClaudeSecurity } from './claude-compiler.js';

export {
  BUILTIN_MODULES,
  BUILTIN_MODULE_NAMES,
  isBuiltinModule,
  mergeModules,
} from './modules.js';
