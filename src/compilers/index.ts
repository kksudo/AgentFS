/**
 * Compilers barrel — re-exports all public compiler symbols.
 *
 * Import from here to avoid deep relative paths across the codebase:
 * ```ts
 * import { claudeCompiler, generateAgentMap, buildCompileContext } from './compilers/index.js';
 * ```
 *
 * @module compilers/index
 */

export { claudeCompiler } from './claude.js';
export { generateAgentMap } from './agent-map.js';
export { buildCompileContext, writeOutputs, readManifest } from './base.js';
