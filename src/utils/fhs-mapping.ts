/**
 * FHS Mapping Utility — Linux Filesystem Hierarchy Standard to vault path resolver.
 *
 * AgentFS maps standard Linux FHS paths to human-readable vault directories.
 * This module provides per-profile default mappings and a resolution helper.
 *
 * @see docs/architecture.md Section 11 "FHS Mapping"
 * @module fhs-mapping
 */

import type { FhsPaths, Profile } from '../types/index.js';

// ---------------------------------------------------------------------------
// FHS_DESCRIPTIONS
// ---------------------------------------------------------------------------

/**
 * Human-readable metadata for every FHS key.
 *
 * Each entry documents:
 * - `linuxPath`   — the canonical Linux FHS location this key mirrors
 * - `description` — semantic role in the vault context
 *
 * Agents and tooling can surface these descriptions in help text,
 * validation errors, and generated documentation.
 *
 * @example
 * ```ts
 * const meta = FHS_DESCRIPTIONS.tmp;
 * // { linuxPath: '/tmp', description: 'Entry point for new notes and captures' }
 * ```
 */
export const FHS_DESCRIPTIONS: Record<
  keyof Required<FhsPaths>,
  { linuxPath: string; description: string }
> = {
  tmp: {
    linuxPath: '/tmp',
    description: 'Entry point for new notes and captures — the only inbox',
  },
  log: {
    linuxPath: '/var/log',
    description: 'Chronological daily journals — one file per day',
  },
  spool: {
    linuxPath: '/var/spool',
    description: 'Task queues — priorities, backlog, content pipeline',
  },
  home: {
    linuxPath: '/home',
    description: 'Active user workspaces — BMAD-structured projects',
  },
  srv: {
    linuxPath: '/srv',
    description: 'Content staged for publishing — drafts and published pieces',
  },
  usr_share: {
    linuxPath: '/usr/share',
    description: 'Shared knowledge base — evergreen notes outside of projects',
  },
  proc_people: {
    linuxPath: '/proc',
    description: 'Live contacts — people as running processes',
  },
  etc: {
    linuxPath: '/etc',
    description: 'System configuration — the .agentos/ kernel space',
  },
  archive: {
    linuxPath: '/var/archive',
    description: 'Completed and archived items — past projects, old notes',
  },
  home_contracts: {
    linuxPath: '/home/contracts',
    description: 'Client and contract work (personal profile only)',
  },
  usr_local_career: {
    linuxPath: '/usr/local/career',
    description: 'Job search pipeline — CV, companies, interviews (personal profile only)',
  },
  home_user: {
    linuxPath: '/home/{user}',
    description: 'Professional knowledge base — engineering expertise (personal profile only)',
  },
  usr_share_media: {
    linuxPath: '/usr/share/media',
    description: 'Media assets — images, brand files, content attachments',
  },
};

// ---------------------------------------------------------------------------
// getDefaultPaths
// ---------------------------------------------------------------------------

/**
 * Returns the default FHS → vault directory mapping for a given profile.
 *
 * The returned object is ready to be written into `manifest.yaml` under
 * the `paths:` key. Profile-specific optional paths are included only when
 * they apply to the chosen profile.
 *
 * Profile semantics:
 * - `personal`  — solo engineer/creator; includes Work/, Career/, Engineering/
 * - `company`   — team vault; home maps to Teams/, srv maps to Clients/
 * - `shared`    — multi-user collaborative; home maps to Spaces/, usr_share maps to Shared/
 *
 * @param profile - The vault profile type.
 * @returns A fully-populated `FhsPaths` object with sensible defaults.
 *
 * @example
 * ```ts
 * const paths = getDefaultPaths('personal');
 * paths.tmp;            // 'Inbox'
 * paths.home_contracts; // 'Work'
 * ```
 */
export function getDefaultPaths(profile: Profile): FhsPaths {
  /** Core paths shared by all three profiles. */
  const core = {
    tmp: 'Inbox',
    log: 'Daily',
    spool: 'Tasks',
    etc: '.agentos',
    archive: 'Archive',
    usr_share_media: 'assets',
  } as const satisfies Pick<FhsPaths, 'tmp' | 'log' | 'spool' | 'etc' | 'archive' | 'usr_share_media'>;

  switch (profile) {
    case 'personal':
      return {
        ...core,
        home: 'Projects',
        srv: 'Content',
        usr_share: 'Knowledge',
        proc_people: 'People',
        // personal-only optional paths
        home_contracts: 'Work',
        usr_local_career: 'Career',
        home_user: 'Engineering',
      };

    case 'company':
      return {
        ...core,
        // /home → Teams (team workspaces instead of personal projects)
        home: 'Teams',
        // /srv → Clients (client-facing content)
        srv: 'Clients',
        usr_share: 'Knowledge',
        proc_people: 'People',
        // company profile re-uses Projects/ at the vault root, but the FHS
        // /home key points to Teams/ per the architecture spec §3.2
      };

    case 'shared':
      return {
        ...core,
        // /home → Spaces (per-user namespaced areas)
        home: 'Spaces',
        // /srv → Shared (common content area)
        srv: 'Shared',
        // /usr/share → Shared (shared knowledge collapses into the same root)
        usr_share: 'Shared',
        proc_people: 'People',
      };
  }
}

// ---------------------------------------------------------------------------
// resolveFhsPath
// ---------------------------------------------------------------------------

/**
 * Resolves a FHS key to its vault-relative directory path.
 *
 * Looks up `fhsKey` in the provided `paths` object and returns the
 * corresponding vault directory string. Throws a descriptive error when the
 * key is present in the type but absent from the runtime object — this
 * surfaces misconfigured manifests early rather than silently producing
 * `undefined` paths downstream.
 *
 * @param fhsKey - A key from the `FhsPaths` interface (e.g. `'tmp'`, `'home'`).
 * @param paths  - The resolved `FhsPaths` instance (e.g. from `manifest.paths`).
 * @returns The vault-relative directory string for the given FHS key.
 * @throws {Error} When `fhsKey` is an optional path not present in `paths`.
 *
 * @example
 * ```ts
 * const paths = getDefaultPaths('personal');
 * resolveFhsPath('tmp', paths);            // 'Inbox'
 * resolveFhsPath('home_contracts', paths); // 'Work'
 * ```
 */
export function resolveFhsPath(fhsKey: keyof FhsPaths, paths: FhsPaths): string {
  const value = paths[fhsKey];

  if (value === undefined) {
    throw new Error(
      `FHS path key "${fhsKey}" is not defined in the provided paths object. ` +
        `This optional path may not be enabled for the current profile. ` +
        `Check manifest.paths or use getDefaultPaths() for the correct profile.`,
    );
  }

  return value;
}
