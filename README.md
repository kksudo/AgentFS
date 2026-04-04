# AgentFS: The OS for AI Agents in Your Vault

**AgentFS is a CLI tool that turns your Obsidian vault into a standardized "Operating System" for AI agents.** It provides a single source of truth for your identity, memory, and security, allowing multiple AI agents (Claude, Cursor, OpenClaw) to work in perfect harmony in the same space.

## 🔴 The Problem: Agent Fragmentation
Currently, every AI tool is a silo. 
- **Claude Code** needs `CLAUDE.md`. 
- **Cursor** needs `.cursorrules`. 
- **OpenClaw** needs `.omc/project-memory.json`. 

When you use multiple agents, you have to maintain your rules, identity, and context in three different places. They don't share memory. They don't respect the same security rules. They are strangers in your vault every time you start a new session.

## 🟢 The Solution: A Unified Kernel
AgentFS introduces a **Kernel Space** (`.agentos/`) to your vault. You define who you are and what you remember once, and AgentFS **compiles** that state into native configurations for every agent you use.

- **One Source of Truth**: Edit your identity in one place; update all agents with one command.
- **Persistent Memory**: A standardized memory system (Tulving's taxonomy) that agents actually use and update.
- **AppArmor-Style Security**: Real enforcement that prevents agents from reading your secrets or core system files.
- **Linux-Style FHS**: A predictable directory structure that agents understand immediately.

```
┌─────────────────────────────────────────────────┐
│               USER SPACE (vault/)               │
│   Human-readable folders, notes, content        │
│   Obsidian sees and renders everything           │
├─────────────────────────────────────────────────┤
│          NATIVE RUNTIMES (per-agent)            │
│   .claude/  .omc/  .cursor/  .obsidian/         │
│   Native configs — each agent reads its own      │
├─────────────────────────────────────────────────┤
│         KERNEL SPACE (.agentos/)                │
│   Source of truth → compiles to native formats   │
│   manifest.yaml, init.d/, memory/, cron.d/      │
└─────────────────────────────────────────────────┘
```

Five rules, stolen from Unix:

1. **Everything is a file.** Memory, tasks, skills, configs — markdown. The agent doesn't query a database. It reads files.
2. **Do one thing well.** Each file is responsible for one thing. `stack.md` = stack. `brief.md` = vision. Don't mix.
3. **Programs work together.** Frontmatter is the API contract between human, agent, and Obsidian. Wikilinks are pipes.
4. **Text is the universal interface.** Markdown is human-readable, agent-parseable, Obsidian-renderable.
5. **No captive UI.** The vault works without Obsidian, without any agent, without cloud. `cat` and `grep` are enough.

## How It Works

### Kernel Space: `.agentos/`

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
│   ├── openclaw/              ← manifest → SOUL.md + .omc/
│   └── cursor/                ← manifest → .cursorrules
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

### Compile Pipeline

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
   CLAUDE.md    SOUL.md    .cursorrules
   .claude/     .omc/      .cursor/
   settings     project-
               memory.json

         + AGENTS.md (vault router)
```

```bash
agentfs compile              # manifest → all native formats
agentfs compile claude       # only Claude configs
agentfs compile --dry-run    # preview changes
agentfs import memory        # sync memory from native → canonical
```

### Linux FHS Mapping

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

### Memory System (Tulving's Taxonomy)

Agent memory is split into three types based on cognitive science:

**Semantic** (`semantic.md`) — context-free facts. Always loaded at boot. ~10x token savings vs loading everything.
```
PREF: no emoji in headings
FACT: [active] primary stack is Kubernetes + ArgoCD
PATTERN: [confidence:0.85] more productive in the morning
AVOID: don't suggest LangChain
```

**Episodic** (`episodic/YYYY-MM-DD.md`) — timestamped events. Lazy-loaded when needed.

**Procedural** (`procedural/{skill}.md`) — learned skills and workflows. Lazy-loaded by name.

Confidence scoring with decay: new patterns start at 0.3, confirmed +0.2, denied -0.3, inactive 30 days -0.1. Below 0.1 = superseded. Facts use immutable append — never deleted, marked as `[superseded:{date}]`.

### Security Model (5-Level Defense in Depth)

```
Level 5: ENCRYPTION AT REST    — SOPS/age for secrets, git-crypt for PII
Level 4: SECRETS VAULT          — agent NEVER sees raw values, only references
Level 3: APPARMOR PROFILES      — policy.yaml → .claude/settings.json deny rules
Level 2: AGENT POLICY           — .agentignore + Security Policy in CLAUDE.md
Level 1: GIT HYGIENE            — .gitignore for runtime state
```

`policy.yaml` defines what the agent can read, write, and execute. It compiles into real enforcement — Claude Code's `permissions.deny[]` actually blocks file access. For agents without enforcement (OpenClaw), it falls back to advisory text.

Composable security modules: base policy + domain-specific extensions (crypto, web, infra, cloud, ci-cd).

### Boot Sequence (SysVinit Runlevels)

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

## Three Profiles

| Profile | For | Key Features |
|---------|-----|-------------|
| `personal` | Solo engineer, creator, builder | Career pipeline, content publishing, engineering knowledge base |
| `company` | Team with shared knowledge | RBAC, team directories, ADR, postmortems, onboarding path |
| `shared` | Multi-user collaborative | Per-user spaces, shared projects, user config files |

## CLI

```bash
# Scaffold
npx create-agentfs                    # interactive setup

# Compile
agentfs compile                       # all native formats
agentfs compile claude --dry-run      # preview Claude changes

# Memory
agentfs memory show                   # show semantic memory
agentfs memory consolidate            # manual consolidation

# Security
agentfs security mode enforce         # enforce | complain | disabled
agentfs security add crypto           # add domain-specific module
agentfs security test                 # dry-run policy check

# Maintenance
agentfs doctor                        # vault health check (+ agnix 385 rules)
agentfs triage                        # classify Inbox/ files
agentfs onboard                       # agent-led interview → identity + memory
agentfs sync                          # bidirectional manifest ↔ compiled outputs
```

**Release v0.1.0** — Core architecture and all planned epics are fully implemented. 

### Core Documentation
- 🚀 **[Quick Start Guide](docs/quickstart.md)** — Go here if you are a human.
- 🤖 **[AI Agent Manual](docs/ai-manual.md)** — Tell your AI to read this file first. Yes, AgentFS is 100% **AI-Native** and provides an explicit instruction manual for the AI itself.
- 🏛️ **[Architecture Document](docs/architecture.md)** — Full design document (v3, 17 sections).
- 🔍 **[Competitive Research](docs/competitive-research.md)** — Analysis of 12 existing repos and what we took from them.
- 🗺️ **[AGENTS.md](AGENTS.md)** — Vault router (generated).

## Roadmap

All phases (1 through 11) have been successfully completed:
- ✅ Phase 1:    Spec → review → approve
- ✅ Phase 2:    MVP — npx create-agentfs: personal + compile.d/claude
- ✅ Phase 2.5:  Onboard — agent-led interview
- ✅ Phase 3:    Memory — Tulving taxonomy + confidence scoring
- ✅ Phase 4:    Cron — consolidation + distillation + inbox-triage
- ✅ Phase 5:    Security — policy.yaml + AppArmor + input validation
- ✅ Phase 6:    Secrets — SOPS/age + exec --with-secrets
- ✅ Phase 7:    Sync — bidirectional manifest ↔ CLAUDE.md
- ✅ Phase 8:    compile.d/openclaw + memory sync
- ✅ Phase 9:    Company + Shared profiles
- ✅ Phase 10:   Full CLI (doctor + agnix, triage, migrate)
- ✅ Phase 11:   Community — npm publish, contributing guide

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding agent compilers and security modules.

## License

MIT
