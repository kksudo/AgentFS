/**
 * Migration framework — defines the Migration interface and registry.
 *
 * Schema versions are integers stored in `.agentos/os-release` as
 * `SCHEMA_VERSION`. When the CLI's CURRENT_SCHEMA_VERSION exceeds the vault's
 * recorded version, `agentfs upgrade` runs all migrations in order.
 *
 * @module migrations
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a single migration step. */
export interface MigrationResult {
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  warnings: string[];
}

/**
 * A single schema migration from one version to the next.
 *
 * `from` and `to` are inclusive lower/upper bounds of the schema versions
 * this migration covers. All registered migrations must form a contiguous
 * chain with no gaps.
 */
export interface Migration {
  /** Schema version this migration starts from. */
  from: number;
  /** Schema version this migration produces. */
  to: number;
  /** Human-readable description shown during upgrade. */
  description: string;
  /**
   * Apply the migration.
   *
   * @param vaultRoot - Absolute path to the vault root.
   * @param dryRun - When true, compute changes but do not write to disk.
   * @returns What was (or would be) changed.
   */
  migrate(vaultRoot: string, dryRun: boolean): Promise<MigrationResult>;
}

// ---------------------------------------------------------------------------
// Current version
// ---------------------------------------------------------------------------

/**
 * Schema version that this CLI release expects.
 *
 * Increment this constant whenever a breaking change is made to the vault
 * layout and add a corresponding Migration entry to MIGRATIONS below.
 */
export const CURRENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of all schema migrations.
 *
 * Currently empty: schema v1 is the initial release. Future migrations will
 * be appended here as the schema evolves.
 *
 * @example
 * ```ts
 * {
 *   from: 1,
 *   to: 2,
 *   description: 'Add .agentos/secrets/ directory',
 *   async migrate(vaultRoot, dryRun) {
 *     // ...
 *   }
 * }
 * ```
 */
export const MIGRATIONS: Migration[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return all migrations needed to upgrade a vault from `from` to `to`,
 * sorted in ascending order by `from`.
 *
 * @param from - Current vault schema version (inclusive lower bound).
 * @param to - Target schema version (inclusive upper bound).
 * @returns Ordered array of migrations to apply.
 */
export function getMigrationsForRange(from: number, to: number): Migration[] {
  return MIGRATIONS
    .filter((m) => m.from >= from && m.to <= to)
    .sort((a, b) => a.from - b.from);
}
