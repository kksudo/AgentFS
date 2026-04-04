/**
 * AgentFS core types — barrel export.
 *
 * Import all types from here:
 * ```ts
 * import type { Manifest, AgentCompiler, SecurityPolicy } from './types/index.js';
 * ```
 */

export type {
  Profile,
  AgentRuntime,
  SecurityMode,
  FhsPaths,
  AgentConfig,
  BootConfig,
  FrontmatterConfig,
  HookEvent,
  HooksConfig,
  Manifest,
} from './manifest.js';

export type {
  CompileContext,
  CompileOutput,
  CompileResult,
  AgentCompiler,
} from './compiler.js';

export type {
  FilePermission,
  ValidationAction,
  FileAccessPolicy,
  InputValidationPolicy,
  NetworkPolicy,
  CommandPolicy,
  SecurityPolicy,
} from './security.js';

export type {
  SemanticEntryType,
  EntryStatus,
  SemanticEntry,
  ConfidenceConfig,
  EpisodicEntry,
  ProceduralEntry,
} from './memory.js';

export { DEFAULT_CONFIDENCE } from './memory.js';

export type {
  SetupAnswers,
  GeneratorResult,
  ScaffoldResult,
} from './setup.js';
