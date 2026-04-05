/**
 * AgentFS generators — barrel export.
 *
 * Generators are one-shot scaffold-time modules. Each creates
 * a specific part of the vault structure from SetupAnswers.
 */

export { runSetupPrompts, createDefaultAnswers } from './prompts.js';
export { generateFilesystem } from './filesystem.js';
export { generateManifest } from './manifest.js';
export { generateInitScripts } from './init.js';
export { generateIgnoreFiles } from './ignore.js';
export { generateMemoryFiles } from './memory.js';
export { scaffold, formatScaffoldSummary } from './scaffold.js';
