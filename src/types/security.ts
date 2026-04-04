/**
 * Security types — AppArmor-style Mandatory Access Control for AI agents.
 *
 * The security policy lives at `.agentos/security/policy.yaml`.
 * It compiles into native enforcement rules per agent.
 *
 * @see docs/architecture.md Section 15 "Security Model"
 */

import type { SecurityMode } from './manifest.js';

/** File access permission type. */
export type FilePermission = 'r' | 'w' | 'rw' | 'x';

/** Action to take on input validation match. */
export type ValidationAction = 'warn' | 'quarantine' | 'block';

/** File access control rules. */
export interface FileAccessPolicy {
  /** Default permission for all files */
  default: FilePermission;
  /** Glob patterns where agent can write freely */
  allow_write: string[];
  /** Glob patterns where agent needs user confirmation to write */
  ask_write: string[];
  /** Glob patterns agent cannot read */
  deny_read: string[];
  /** Glob patterns agent cannot write */
  deny_write: string[];
}

/** Prompt injection detection pattern. */
export interface ValidationPattern {
  pattern: string;
}

/** Input validation configuration. */
export interface InputValidationPolicy {
  enabled: boolean;
  scan_on_read: ValidationPattern[];
  action: ValidationAction;
  quarantine_path: string;
}

/** Exfiltration detection pattern. */
export interface ExfilPattern {
  regex: string;
}

/** Network/exfiltration control. */
export interface NetworkPolicy {
  deny_exfil_patterns: ExfilPattern[];
  allowed_domains: string[];
}

/** Command control rules. */
export interface CommandPolicy {
  blocked: string[];
  ask_before: string[];
}

/**
 * Full security policy — `.agentos/security/policy.yaml`.
 *
 * Compiles into native enforcement:
 * - Claude Code → `.claude/settings.json` permissions.deny[]
 * - Others → advisory text in compiled output
 */
export interface SecurityPolicy {
  version: string;
  default_mode: SecurityMode;
  file_access: FileAccessPolicy;
  input_validation: InputValidationPolicy;
  network: NetworkPolicy;
  commands: CommandPolicy;
}
