/**
 * AgentFS Manifest — the heart of kernel space.
 *
 * Lives at `.agentos/manifest.yaml`. Defines what this vault is,
 * which agents are supported, and how directories map to Linux FHS.
 *
 * @see docs/architecture.md Section 2 "Kernel Space"
 */

/** Vault profile type — determines directory layout and features. */
export type Profile = 'personal' | 'company' | 'shared';

/** Supported AI agent runtimes. */
export type AgentRuntime = 'claude' | 'openclaw' | 'cursor';

/** Security enforcement mode (AppArmor-style). */
export type SecurityMode = 'enforce' | 'complain' | 'disabled';

/**
 * Linux FHS path keys — maps standard Linux paths to vault directories.
 *
 * Each key corresponds to a Linux FHS location:
 * - `tmp` → `/tmp` (Inbox/)
 * - `log` → `/var/log` (Daily/)
 * - `spool` → `/var/spool` (Tasks/)
 * - etc.
 *
 * @see docs/architecture.md Section 11 "FHS Mapping"
 */
export interface FhsPaths {
  /** /tmp — entry point for new notes */
  tmp: string;
  /** /var/log — daily journals */
  log: string;
  /** /var/spool — task queues */
  spool: string;
  /** /home — active projects */
  home: string;
  /** /srv — content for publishing */
  srv: string;
  /** /usr/share — shared knowledge base */
  usr_share: string;
  /** /proc — active contacts (people) */
  proc_people: string;
  /** /etc — system configuration (.agentos) */
  etc: string;
  /** /var/archive — completed/archived items */
  archive: string;
  /** /home/contracts — client projects (personal profile) */
  home_contracts?: string;
  /** /usr/local/career — job search pipeline (personal profile) */
  usr_local_career?: string;
  /** /home/{user} — professional knowledge base (personal profile) */
  home_user?: string;
  /** /usr/share/media — media assets */
  usr_share_media?: string;
}

/** Agent configuration within the manifest. */
export interface AgentConfig {
  /** Which agent is the primary runtime */
  primary: AgentRuntime;
  /** All supported agents (primary included) */
  supported: AgentRuntime[];
}

/** Boot sequence configuration. */
export interface BootConfig {
  /** Ordered list of init.d/ scripts to load at boot */
  sequence: string[];
  /** Variable substitutions (e.g. `today: "$(date +%F)"`) */
  variables?: Record<string, string>;
}

/** Frontmatter standards for vault files. */
export interface FrontmatterConfig {
  /** Fields that must be present in every file */
  required: string[];
  /** Recommended but optional fields */
  standard?: string[];
}

/**
 * Subagent completion status (Superpowers pattern).
 *
 * Written to `.agentos/proc/signals/` as status files for inter-agent communication.
 */
export type SubagentStatus =
  | 'DONE'                // task completed successfully
  | 'DONE_WITH_CONCERNS'  // completed but has warnings/questions
  | 'BLOCKED'             // cannot proceed, needs external input
  | 'NEEDS_CONTEXT';      // needs more information from controller

/** Lifecycle hook event names (inspired by OMC's 11-event model). */
export type HookEvent =
  | 'on-boot'        // agent session starts
  | 'on-shutdown'    // agent session ends (runlevel 6)
  | 'pre-compile'    // before agentfs compile
  | 'post-compile'   // after agentfs compile
  | 'on-commit'      // after git commit in vault
  | 'on-file-create' // new file created in vault
  | 'on-triage';     // inbox triage triggered

/** Hook configuration — maps events to handler scripts. */
export interface HooksConfig {
  [event: string]: string[];  // event name → list of script paths relative to .agentos/hooks/
}

/**
 * The full manifest schema — `.agentos/manifest.yaml`.
 *
 * This is the single source of truth for the vault.
 * The compile pipeline reads this to generate native agent configs.
 */
export interface Manifest {
  agentos: {
    version: string;
    profile: Profile;
  };
  vault: {
    name: string;
    owner: string;
    created: string;
  };
  agents: AgentConfig;
  paths: FhsPaths;
  boot: BootConfig;
  frontmatter: FrontmatterConfig;
  /** Optional active modules */
  modules?: string[];
  /** Optional lifecycle hooks */
  hooks?: HooksConfig;
}
