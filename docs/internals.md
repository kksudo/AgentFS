# AgentFS Internals

Implementation reference for AgentFS subsystems. This document describes **how things work** in the current codebase. For **why** decisions were made, see [architecture.md](architecture.md) (the original design spec in Russian). For the high-level overview, see the [README](../README.md).

## Kernel Space: `.agentos/`

```
.agentos/
├── manifest.yaml              ← what is this vault (name, profile, paths, agents)
├── init.d/                    ← boot sequence (agent-agnostic)
│   ├── 00-identity.md         ← who am I, whose vault, roles
│   ├── 10-memory.md           ← load memory (semantic on boot, rest lazy)
│   ├── 20-today.md            ← load daily note + tasks
│   └── 30-projects.md         ← load active projects
├── compile.d/                 ← per-agent "drivers"
│   ├── claude/                ← manifest → CLAUDE.md + .claude/settings.json
│   ├── openclaw/              ← manifest → .openclaw/
│   └── cursor/                ← manifest → .cursor/rules/
├── security/                  ← AppArmor-style profiles + secrets vault
│   ├── policy.yaml            ← Mandatory Access Control rules
│   ├── modules/               ← domain-specific security (crypto, web, infra)
│   └── secrets/               ← SOPS/age encrypted values (agent CANNOT read)
├── cron.d/                    ← scheduled jobs
│   ├── heartbeat.md           ← status updates
│   ├── memory-consolidation.md ← end-of-session memory snapshot
│   ├── distillation.md        ← deep cross-session pattern analysis (every 2 days)
│   └── inbox-triage.md        ← classify new files
├── memory/                    ← persistent agent state (Tulving's taxonomy)
│   ├── semantic.md            ← facts, preferences (always loaded at boot)
│   ├── episodic/              ← timestamped events (lazy-loaded by date)
│   ├── procedural/            ← learned skills (lazy-loaded by name)
│   └── corrections.md         ← past mistakes
└── proc/                      ← runtime state (ephemeral, gitignored)
```

## Compile Pipeline

Write once in `.agentos/`, compile to all native formats:

```
              .agentos/
              manifest.yaml
              init.d/ + memory/
                    │
              agentfs compile
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
    claude/     openclaw/    cursor/
         │          │          │
         ▼          ▼          ▼
   CLAUDE.md    .openclaw/  .cursor/rules/
   .claude/     AGENTS,     agentfs-global
   settings     SOUL...     .mdc

         + AGENT-MAP.md (vault router)
```

## Linux FHS Mapping

Vault directories map to Linux filesystem hierarchy:

| Linux FHS | Vault Path | Purpose |
|-----------|-----------|---------|
| `/tmp` | `Inbox/` | Entry point for new notes |
| `/var/log` | `Daily/` | Daily journals |
| `/var/spool` | `Tasks/` | Task queues |
| `/home` | `Projects/` | Active projects |
| `/srv` | `Content/` | Content for publishing |
| `/usr/share` | `Knowledge/` | Shared knowledge base |
| `/etc` | `.agentos/` | System configuration |
| `/var/lib` | `.agentos/memory/` | Persistent agent state |
| `/etc/init.d` | `.agentos/init.d/` | Boot scripts |
| `/etc/cron.d` | `.agentos/cron.d/` | Scheduled jobs |
| `/proc` | `.agentos/proc/` | Runtime state (ephemeral) |

## Memory System (Tulving's Taxonomy)

Agent memory is split into three types based on cognitive science:

### Semantic (`semantic.md`)

Context-free facts. Always loaded at boot. ~10x token savings vs loading everything.

```
FACT: [active] primary stack is Kubernetes + ArgoCD
FACT: [active] project uses React Native and Expo
PREF: no emoji in headings
PREF: always use TypeScript strict mode
PATTERN: [confidence:0.85] more productive in the morning
AVOID: don't suggest LangChain
AVOID: never use lodash, prefer native methods
AVOID: don't translate English technical terms to Russian
```

Prefixes and when to use them:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `FACT` | Objective knowledge about stack, project, environment | `FACT: [active] deploy target is AWS EKS` |
| `PREF` | Personal preferences for how agent should behave | `PREF: short commit messages, no emojis` |
| `PATTERN` | Observed behavioral patterns (with confidence score) | `PATTERN: [confidence:0.7] prefers morning code reviews` |
| `AVOID` | Things the agent must NOT do | `AVOID: never add dependencies without justification` |

### Episodic (`episodic/YYYY-MM-DD.md`)

Timestamped events. Lazy-loaded when needed.

### Procedural (`procedural/{skill}.md`)

Learned skills and workflows. Lazy-loaded by name.

### Confidence Scoring

New patterns start at 0.3, confirmed +0.2, denied -0.3, inactive 30 days -0.1. Below 0.1 = superseded. Facts use immutable append — never deleted, marked as `[superseded:{date}]`.

## Security Model (5-Level Defense in Depth)

```
Level 5: ENCRYPTION AT REST    — SOPS/age for secrets, git-crypt for PII
Level 4: SECRETS VAULT          — agent NEVER sees raw values, only references
Level 3: APPARMOR PROFILES      — policy.yaml → .claude/settings.json deny rules
Level 2: AGENT POLICY           — .agentignore + Security Policy in CLAUDE.md
Level 1: GIT HYGIENE            — .gitignore for runtime state
```

`policy.yaml` defines what the agent can read, write, and execute. It compiles into real enforcement — Claude Code's `permissions.deny[]` actually blocks file access. For agents without enforcement (OpenClaw), it falls back to advisory text.

Composable security modules: base policy + domain-specific extensions (crypto, web, infra, cloud, ci-cd).

## Boot Sequence (SysVinit Runlevels)

```
Runlevel 0: HALT        — agent off
Runlevel 1: IDENTITY    — load who I am, whose vault
Runlevel 2: MEMORY      — load semantic memory (episodic + procedural lazy)
Runlevel 3: CONTEXT     — load today's daily note + tasks
Runlevel 4: PROJECTS    — load active projects
Runlevel 5: FULL        — interactive mode (all systems go)
Runlevel 6: SHUTDOWN    — memory consolidation, save state
```

Progressive disclosure: only semantic memory loaded at boot. Episodic and procedural memory loaded on demand. Reduces boot context by ~10x.

## Vault Profiles

| Profile | For | Key Features |
|---------|-----|-------------|
| `personal` | Solo engineer, creator, builder | Career pipeline, content publishing, engineering knowledge base |
| `company` | Team with shared knowledge | RBAC, team directories, ADR, postmortems, onboarding path |
| `shared` | Multi-user collaborative | Per-user spaces, shared projects, user config files |
