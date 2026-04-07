---
title: "Design Draft: Global Compile"
date: 2026-04-07
status: draft
epic: global-compile
---

# Global Compile — Design Draft

## Problem

AgentFS compiles context into agent-native configs at the vault root. This works when the agent operates inside the vault directory. But when the user works in a different repository (e.g., `~/work/my-project/`), the agent has zero context from the vault — no identity, no preferences, no memory, no security policy.

This is equivalent to losing your `~/.bashrc` every time you `cd` to a new directory.

### Current workaround

For Claude Code, users can create a skill (e.g., Jarvis) that manually reads `~/notes/CLAUDE.md` on invocation. This works but has limitations: it's Claude-only, requires explicit skill invocation, and doesn't cover Cursor or OpenClaw.

## Solution

Add a `--global` flag to `agentfs compile` that writes compiled output to each agent's global config directory instead of the vault root.

```bash
# Compile to vault root (existing behavior, unchanged)
agentfs compile

# Compile to global home directories
agentfs compile --global

# Compile specific agent globally
agentfs compile claude --global

# Preview what would be written
agentfs compile --global --dry-run
```

The Linux analogy: `agentfs compile` writes to `/etc/` (project-local), `agentfs compile --global` writes to `~/` (user-global).

## Per-Agent Global Paths

Each agent runtime has its own convention for global config. AgentFS must respect these native paths.

| Agent | Global output path | Format | Notes |
|-------|--------------------|--------|-------|
| Claude | `~/.claude/CLAUDE.md` | Markdown | Claude Code reads this for all projects |
| Claude | `~/.claude/settings.json` | JSON | Global permissions (deny/allow) |
| Cursor | `~/.cursor/rules/agentfs-global.mdc` | MDC (YAML frontmatter + MD) | Modern Cursor rules format |
| OpenClaw | `~/.openclaw/SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `SECURITY.md` | Markdown | Standard OpenClaw structure |

### Path resolution

The global home directory is resolved as:

```
$AGENTFS_HOME   (if set)
  → $XDG_CONFIG_HOME/agentfs  (if XDG set)
    → $HOME
```

Agent-specific paths are then relative to `$HOME`:

```typescript
const GLOBAL_PATHS: Record<AgentRuntime, string> = {
  claude: path.join(os.homedir(), '.claude'),
  cursor: path.join(os.homedir(), '.cursor', 'rules'),
  openclaw: path.join(os.homedir(), '.openclaw'),
};
```

## Content Filtering

Global config should NOT contain everything from the local compile. Some things are vault-specific and don't make sense globally.

### Included in global compile

- Identity (from `init.d/00-identity.md`)
- Semantic memory — facts, preferences, patterns, directives
- Corrections (agent mistakes to avoid)
- Security baseline — deny patterns for secrets, keys, env files

### Excluded from global compile

- Directory structure (FHS paths are vault-specific)
- Boot sequence (references vault-local init.d/ files)
- Module-specific rules (career, content, engineering — vault-local)
- AGENT-MAP.md (vault-local navigation)

This means compilers need a `mode` parameter: `'local' | 'global'`. In global mode, vault-specific sections are omitted.

## Rollback

This is critical. Writing to `~/.claude/` or `~/.cursor/` affects ALL projects on the machine. Users must be able to undo this cleanly.

### Approach: manifest file + `--uninstall`

On `--global` compile, AgentFS writes a manifest alongside the config files:

```
~/.claude/.agentfs-managed.json
~/.cursor/rules/.agentfs-managed.json
~/.openclaw/.agentfs-managed.json
```

Contents:

```json
{
  "version": "0.1.x",
  "compiledAt": "2026-04-07T12:00:00Z",
  "sourceVault": "/Users/kirill/notes",
  "files": [
    "CLAUDE.md",
    "settings.json"
  ]
}
```

To rollback:

```bash
# Remove all globally compiled files for all agents
agentfs compile --global --uninstall

# Remove for specific agent
agentfs compile claude --global --uninstall

# Preview what would be removed
agentfs compile --global --uninstall --dry-run
```

The `--uninstall` command reads `.agentfs-managed.json`, deletes only the listed files, then deletes the manifest itself.

### Safety rules

1. `--global` NEVER overwrites files not listed in `.agentfs-managed.json`. If `~/.claude/CLAUDE.md` exists and was NOT created by AgentFS — refuse and warn.
2. On first `--global` compile, if target files already exist, prompt for confirmation (unless `--force`).
3. `--uninstall` only deletes files from the manifest. It does NOT remove the parent directory (`~/.claude/` etc.) — those may contain user files.
4. The manifest is the single source of truth for what AgentFS owns globally. No manifest = nothing to uninstall.

### Backup before overwrite

On first `--global` compile, if existing files are found:

```
~/.claude/CLAUDE.md → ~/.claude/CLAUDE.md.agentfs-backup
```

On `--uninstall`, if backup exists, restore it:

```
~/.claude/CLAUDE.md.agentfs-backup → ~/.claude/CLAUDE.md
```

## User Stories

### US-1: First-time global compile

**As** a developer with an AgentFS vault at `~/notes`,
**I want** to run `agentfs compile --global`
**So that** my agent identity and preferences are available in all projects.

**Acceptance criteria:**

- Running `agentfs compile --global` from `~/notes` writes identity + memory to `~/.claude/CLAUDE.md`
- Running `agentfs compile --global` from outside the vault with `--dir ~/notes` also works
- If `~/.claude/CLAUDE.md` already exists (not created by AgentFS), the command warns and exits without `--force`
- `--dry-run` shows what would be written without touching disk
- `.agentfs-managed.json` is created in each agent's global directory

### US-2: Global compile for all supported agents

**As** a user with `supported: [claude, cursor]` in manifest,
**I want** `agentfs compile --global` to write configs for both agents
**So that** I don't have to compile each agent separately.

**Acceptance criteria:**

- All agents listed in `manifest.agents.supported` receive global configs
- Single-agent mode (`agentfs compile claude --global`) still works
- Each agent's global directory gets its own `.agentfs-managed.json`

### US-3: Clean uninstall

**As** a user who wants to stop using AgentFS global configs,
**I want** to run `agentfs compile --global --uninstall`
**So that** all AgentFS-managed files are cleanly removed from my home directory.

**Acceptance criteria:**

- Only files listed in `.agentfs-managed.json` are deleted
- If backup files exist (`.agentfs-backup`), they are restored
- The `.agentfs-managed.json` manifest is deleted last
- `--dry-run` shows what would be removed
- If manifest is missing, warn and exit (nothing to uninstall)

### US-4: Re-compile (update)

**As** a user who changed their identity or added new semantic memory,
**I want** `agentfs compile --global` to update the global configs
**So that** changes propagate to all my projects.

**Acceptance criteria:**

- Re-running `--global` overwrites previously managed files (no `--force` needed for re-compile)
- `.agentfs-managed.json` is updated with new timestamp
- Files that are no longer in the compile output are cleaned up (removed from global + manifest)

### US-5: Global compile doesn't interfere with local compile

**As** a developer working in a project that has its own `.agentos/`,
**I want** the local vault's compile to take precedence over global
**So that** project-specific rules override my personal defaults.

**Acceptance criteria:**

- `agentfs compile` (without `--global`) behavior is completely unchanged
- Agent runtimes natively merge global + local (Claude Code: `~/.claude/CLAUDE.md` + `./CLAUDE.md`)
- Global config does NOT include vault-specific sections (FHS paths, boot sequence, modules)

## Implementation Plan

### Phase 1: Global path resolution + managed manifest

1. Add `resolveGlobalPath(agent: AgentRuntime): string` to `src/utils/`
2. Add `ManagedManifest` type and read/write helpers to `src/utils/managed-manifest.ts`
3. Add `--global` and `--uninstall` flag parsing to `src/commands/compile.ts`

### Phase 2: Compiler changes

4. Add `mode: 'local' | 'global'` to `CompileContext` interface
5. Update `claudeCompiler.compile()` — in global mode, omit vault-specific sections
6. Update `cursorCompiler.compile()` — same
7. Update `openclawCompiler.compile()` — same
8. Skip `AGENT-MAP.md` generation in global mode (vault-specific)

### Phase 3: Compile command orchestration

9. In `compileCommand()`, when `--global`:
   - Resolve global paths per agent
   - Check for existing non-managed files (warn or `--force`)
   - Create backups if needed
   - Write outputs to global paths instead of vault root
   - Write `.agentfs-managed.json`

10. When `--uninstall`:
    - Read `.agentfs-managed.json` per agent
    - Delete managed files
    - Restore backups if present
    - Delete manifest

### Phase 4: Tests

11. Unit tests for `resolveGlobalPath()`
12. Unit tests for `ManagedManifest` read/write/cleanup
13. Integration tests for `compile --global --dry-run`
14. Integration tests for `compile --global --uninstall`
15. Edge cases: missing home dir, read-only fs, pre-existing files

### Phase 5: Documentation

16. Update `docs/architecture.md` Section 9 with global compile
17. Update `docs/ai-manual.md` with global setup instructions
18. Update CLI `--help` text

## Alternative: Skill-based Approach (Status Quo)

For reference, the current workaround via Claude skills:

```
~/.claude/skills/jarvis-assistant/SKILL.md
```

This skill reads `~/notes/CLAUDE.md`, daily notes, and tasks on invocation. It effectively bootstraps vault context into any Claude session.

**Pros:** no changes to AgentFS, works today, flexible (can load dynamic context like today's tasks).

**Cons:** Claude-only, requires explicit invocation, no Cursor/OpenClaw support, no security policy enforcement, no rollback mechanism, skill logic duplicates compile logic.

The `--global` feature and the skill approach are complementary. `--global` provides static baseline (identity, preferences, security), while the skill provides dynamic context (today's tasks, recent memory).

## Open Questions

1. **Conflict resolution.** If `~/.claude/CLAUDE.md` (global) and `./CLAUDE.md` (local) both exist, agent behavior depends on the runtime. Claude Code concatenates them (global first, local second). Cursor uses specificity rules. OpenClaw behavior is undocumented. Should AgentFS document expected behavior per agent?

2. **Selective global sections.** Should users be able to choose which sections go into global config? E.g., `agentfs compile --global --sections identity,memory` — or is the default split (identity + memory + security vs. everything else) good enough?

3. **`$AGENTFS_HOME` vs. `--source-vault`.** If the user runs `agentfs compile --global` from a directory that isn't a vault, should it look for `$AGENTFS_HOME` or require `--dir`?

4. **Multi-vault global merge.** If someone has two vaults (personal + work) and wants both in global config — is that a future concern or should the design account for it now? Current recommendation: YAGNI, single source vault per global compile.

5. **`settings.json` merge strategy (Claude).** `~/.claude/settings.json` may already contain user-defined `permissions.deny` rules. AgentFS cannot blindly overwrite — it would erase user's own settings. Options: (a) only write `CLAUDE.md` globally, skip `settings.json`; (b) merge AgentFS deny rules into existing settings (risky — need to track which rules are ours); (c) write AgentFS rules to a separate file and document that users should reference it. Recommended: option (a) for v1 — security enforcement stays vault-local, global config is advisory only.
