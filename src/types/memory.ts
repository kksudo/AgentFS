/**
 * Memory types — Tulving's cognitive taxonomy for AI agents.
 *
 * Three memory types:
 * - Semantic: context-free facts (always loaded at boot)
 * - Episodic: timestamped events (lazy-loaded by date)
 * - Procedural: learned skills (lazy-loaded by name)
 *
 * @see docs/architecture.md Section 4 "Boot Sequence"
 */

/**
 * Semantic memory entry types.
 *
 * - PREF: preferences ("no emoji in headings")
 * - FACT: declarative facts ("[active] primary stack is K8s")
 * - PATTERN: behavioral patterns with confidence ("[confidence:0.85] ...")
 * - AVOID: anti-patterns ("don't suggest LangChain")
 * - DIRECTIVE: imperative rules that must always be followed ("always run tests before commit")
 */
export type SemanticEntryType = 'PREF' | 'FACT' | 'PATTERN' | 'AVOID' | 'DIRECTIVE';

/** Status of a semantic entry. */
export type EntryStatus = 'active' | `superseded:${string}`;

/**
 * A single entry in semantic memory.
 *
 * Format in `semantic.md`:
 * ```
 * PREF: no emoji in headings
 * FACT: [active] primary stack is Kubernetes + ArgoCD
 * PATTERN: [confidence:0.85] more productive in the morning
 * AVOID: don't suggest LangChain
 * ```
 */
export interface SemanticEntry {
  type: SemanticEntryType;
  content: string;
  status: EntryStatus;
  /** Confidence score for PATTERN entries (0.0 - 1.0) */
  confidence?: number;
}

/**
 * Confidence scoring rules.
 *
 * - New pattern → 0.3
 * - Confirmed → +0.2 (max 1.0)
 * - Denied → -0.3
 * - Inactive 30 days → -0.1 (decay)
 * - Below 0.1 → superseded
 */
export interface ConfidenceConfig {
  initial: number;
  confirmBoost: number;
  denyPenalty: number;
  decayRate: number;
  decayDays: number;
  supersededThreshold: number;
}

/** Default confidence scoring configuration. */
export const DEFAULT_CONFIDENCE: ConfidenceConfig = {
  initial: 0.3,
  confirmBoost: 0.2,
  denyPenalty: 0.3,
  decayRate: 0.1,
  decayDays: 30,
  supersededThreshold: 0.1,
};

/** Episodic memory entry — one day's events. */
export interface EpisodicEntry {
  date: string;
  events: string[];
  decisions: string[];
  lessons: string[];
}

/**
 * Procedural memory — a learned skill/workflow.
 *
 * Follows SKILL.md pattern: frontmatter with triggers + description,
 * body with steps and context. Agents can auto-match skills by trigger keywords.
 */
export interface ProceduralEntry {
  name: string;
  description: string;
  steps: string[];
  context: string;
  /** Keywords that trigger this skill (e.g. ["deploy", "kubernetes", "rollout"]) */
  triggers?: string[];
  /** How often this skill was used (for distillation ranking) */
  useCount?: number;
  /** When this skill was last used (ISO date) */
  lastUsed?: string;
}
