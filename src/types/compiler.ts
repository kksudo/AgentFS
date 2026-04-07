/**
 * Compile Pipeline types — kernel → native agent configs.
 *
 * Each agent has a "driver" (compiler) that translates the canonical
 * manifest + init.d + memory into the agent's native format.
 *
 * @see docs/architecture.md Section 9 "Compile Pipeline"
 */

import type { AgentRuntime, Manifest } from './manifest.js';

/**
 * Context passed to compilers during the compile phase.
 * Contains everything a driver needs to generate native output.
 */
export interface CompileContext {
  /** Parsed manifest.yaml */
  manifest: Manifest;
  /** Contents of init.d/ scripts, keyed by filename */
  initScripts: Record<string, string>;
  /** Semantic memory content (always loaded) */
  semanticMemory: string | null;
  /** Corrections content (agent mistakes) */
  corrections: string | null;
  /** Root path of the vault */
  vaultRoot: string;
  /** Whether this is a dry-run (preview only, don't write) */
  dryRun: boolean;
  /** Advisory warnings from init.d validation (never blocks compilation) */
  initScriptWarnings?: string[];
}

/** A single file that a compiler wants to write. */
export interface CompileOutput {
  /** Relative path from vault root */
  path: string;
  /** File content to write */
  content: string;
  /** Whether this file is owned by AgentFS (true) or user (false) */
  managed: boolean;
}

/** Result of a compile operation. */
export interface CompileResult {
  /** Which agent this result is for */
  agent: AgentRuntime;
  /** Files to write (or that would be written in dry-run) */
  outputs: CompileOutput[];
  /** Human-readable summary of what was/would be done */
  summary: string;
}

/**
 * Agent compiler interface — one per supported agent.
 *
 * Implement this to add support for a new AI agent runtime.
 * Each compiler lives in `src/compilers/{agent}.ts`.
 *
 * @example
 * ```ts
 * const claude: AgentCompiler = {
 *   name: 'claude',
 *   compile(ctx) { ... },
 *   supports(feature) { ... },
 * };
 * ```
 */
export interface AgentCompiler {
  /** Agent runtime name */
  readonly name: AgentRuntime;

  /**
   * Compile manifest + context into native agent config files.
   *
   * @param context - Everything the compiler needs
   * @returns Files to write and a summary
   */
  compile(context: CompileContext): Promise<CompileResult>;

  /**
   * Check if this agent supports a given feature.
   *
   * Used to determine which security/memory features
   * can be compiled for this agent.
   *
   * @param feature - Feature name (e.g. 'security-enforce', 'memory-sync')
   */
  supports(feature: string): boolean;
}
