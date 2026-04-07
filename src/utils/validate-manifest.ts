/**
 * Manifest validation — checks required fields and type constraints.
 *
 * Called before compilation to surface misconfigured manifests early
 * rather than letting them produce silent failures downstream.
 *
 * @module utils/validate-manifest
 */

import type { Manifest, Profile, AgentRuntime } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PROFILES: Profile[] = ['personal', 'company', 'shared'];
const VALID_RUNTIMES: AgentRuntime[] = ['claude', 'openclaw', 'cursor'];

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Result of validating a manifest. */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

/**
 * Validate a parsed manifest object against required field constraints.
 *
 * Errors block compilation; warnings are advisory.
 *
 * Required fields checked:
 * - `vault.name` — must be a non-empty string
 * - `vault.owner` — must be a non-empty string
 * - `agents.primary` — must be a valid AgentRuntime
 * - `agentos.version` — must be present
 *
 * Type constraints checked:
 * - `vault.profile` (via `agentos.profile`) — must be 'personal' | 'company' | 'shared'
 * - `agents.primary` — must be one of the known runtimes
 * - `agents.supported` — must include `agents.primary`
 *
 * @param manifest - The parsed manifest to validate
 * @returns Validation result with `valid`, `errors`, and `warnings`
 */
export function validateManifest(manifest: Manifest): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // Required fields
  // -------------------------------------------------------------------------

  if (!manifest.vault?.name || typeof manifest.vault.name !== 'string' || manifest.vault.name.trim() === '') {
    errors.push('manifest: vault.name is required and must be a non-empty string');
  }

  if (!manifest.vault?.owner || typeof manifest.vault.owner !== 'string' || manifest.vault.owner.trim() === '') {
    errors.push('manifest: vault.owner is required and must be a non-empty string');
  }

  if (!manifest.agentos?.version || typeof manifest.agentos.version !== 'string') {
    errors.push('manifest: agentos.version is required');
  }

  if (!manifest.agents?.primary) {
    errors.push('manifest: agents.primary is required');
  }

  // -------------------------------------------------------------------------
  // Type constraints
  // -------------------------------------------------------------------------

  const profile = manifest.agentos?.profile;
  if (profile !== undefined && !VALID_PROFILES.includes(profile)) {
    errors.push(
      `manifest: agentos.profile must be one of ${VALID_PROFILES.map((p) => `'${p}'`).join(', ')}, got '${profile}'`,
    );
  }

  const primary = manifest.agents?.primary;
  if (primary !== undefined) {
    if (!VALID_RUNTIMES.includes(primary)) {
      errors.push(
        `manifest: agents.primary must be one of ${VALID_RUNTIMES.map((r) => `'${r}'`).join(', ')}, got '${primary}'`,
      );
    } else {
      // Primary must appear in supported list
      const supported = manifest.agents?.supported ?? [];
      if (!supported.includes(primary)) {
        errors.push(
          `manifest: agents.supported must include agents.primary ('${primary}')`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Warnings (advisory only)
  // -------------------------------------------------------------------------

  const supported = manifest.agents?.supported ?? [];
  for (const runtime of supported) {
    if (!VALID_RUNTIMES.includes(runtime)) {
      warnings.push(
        `manifest: agents.supported contains unknown runtime '${runtime}' — no compiler available`,
      );
    }
  }

  if (!manifest.vault?.created) {
    warnings.push('manifest: vault.created is missing — consider adding a creation date');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
