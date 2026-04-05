/**
 * Setup answers — collected from interactive prompts during `npx create-agentfs`.
 *
 * These answers drive all generators: filesystem, manifest, init.d, memory, etc.
 *
 * @see src/generators/ for consumers of this type
 */

import type { Profile, AgentRuntime } from './manifest.js';

/**
 * Answers collected from the interactive setup wizard.
 *
 * Every generator receives this as input — it's the contract
 * between the prompts step and all downstream generators.
 */
export interface SetupAnswers {
  /** Name of the vault (e.g. "my-notes", "company-kb") */
  vaultName: string;
  /** Owner name (person or team) */
  ownerName: string;
  /** Vault profile type */
  profile: Profile;
  /** Primary AI agent runtime */
  primaryAgent: AgentRuntime;
  /** All supported agent runtimes (includes primary) */
  supportedAgents: AgentRuntime[];
  /** Optional modules to enable */
  modules: string[];
  /** Target directory for the vault (defaults to cwd) */
  targetDir: string;
}

/**
 * Result of a single generator's execution.
 * Used for the summary report at the end of scaffolding.
 */
export interface GeneratorResult {
  /** What the generator created or skipped */
  created: string[];
  /** Files/dirs that already existed and were skipped */
  skipped: string[];
}

/**
 * Full scaffold result — aggregates all generator results.
 */
export interface ScaffoldResult {
  /** Total directories created */
  dirsCreated: number;
  /** Total files created */
  filesCreated: number;
  /** Total items skipped (already existed) */
  itemsSkipped: number;
  /** Per-generator details */
  details: Record<string, GeneratorResult>;
}
