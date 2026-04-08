# AgentFS

**One config. Every AI agent. Persistent memory.**

AgentFS turns your Obsidian vault into a unified operating system for AI agents. Define your identity, memory, and security rules once — compile to native formats for Claude Code, Cursor, OpenClaw, and others.

[![npm version](https://img.shields.io/npm/v/create-agentfs.svg)](https://www.npmjs.com/package/create-agentfs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## The Problem: Context Fragmentation

AI agents today are silos. Claude Code needs `CLAUDE.md`, Cursor needs `.cursor/rules/`, and OpenClaw needs `.openclaw/`. You maintain the same rules, identity, and context in three different places. Agents don't share memory. They don't respect the same security policies. They start from zero every session. 

**Most importantly: Agents lack a "Persistent State."** They can't "pause" and "resume" tasks across sessions or hand off context to other agents without major manual intervention.

## The Solution: AgentFS (The Agent OS Infrastructure)

AgentFS introduces a **Kernel Space** (`.agentos/`) — a single source of truth for who you are, what you know, and what's off-limits. One command compiles it into native configs for every agent you use.

- **Persistent State:** Agents can maintain state across toolchains and sessions.
- **Inter-Agent Sync:** A shared filesystem where different agents exchange context without API overhead.
- **Secure Context Isolation:** Deterministic security rules that agents *actually* respect across environments.

AgentFS isn't just a config generator; it's the **missing infrastructure layer** for autonomous AI agents. While others build the *agents*, AgentFS builds the *environment* they live in.

```
.agentos/                        CLAUDE.md
  manifest.yaml     agentfs      .claude/settings.json
  init.d/          -------->     .cursor/rules/*.mdc
  memory/           compile      .openclaw/
  security/                      AGENT-MAP.md
```

## Install

```bash
# Install globally from npm
npm install -g create-agentfs

# Verify
agentfs --version
```

Or use without installing:

```bash
npx create-agentfs my-vault
```

### Uninstall

```bash
npm uninstall -g create-agentfs
```

## Quick Start

```bash
agentfs init my-vault
cd my-vault
agentfs compile
```

That's it. Your vault now has a kernel, and every supported agent gets native configuration.

For detailed setup with interactive onboarding, modules, and profiles — see the [Quick Start Guide](docs/quickstart.md).

## Two Ways to Use AgentFS

### Persistent Agents (full power)

Long-lived agents like Cowork, OpenClaw, or Cursor in background mode get the complete experience: memory accumulates between sessions, cron jobs consolidate knowledge, the agent "grows" over time.

```bash
agentfs compile                   # compile kernel → native configs
agentfs memory consolidate        # snapshot session memory
agentfs sync                      # sync memory back to kernel
```

The agent reads `semantic.md` on boot, writes episodic memories, runs consolidation at session end. Full read-write cycle.

### Session Agents (instant context)

Short-lived sessions (Claude Code in terminal, one-off Cursor tasks) use AgentFS as a smart context loader. The agent starts knowing who you are, your stack, your preferences, your security rules — no warm-up questions.

```bash
npx create-agentfs my-project     # scaffold once
agentfs compile                   # compile once
# now every Claude Code session in this directory starts with full context
```

The agent consumes context but doesn't write back. That's fine — even read-only access to your identity and memory saves 2-3 rounds of "what framework do you use?" per session.

## Give Your Agent the Prompt

After running `agentfs compile`, paste this into your agent's first message (or add it to your workflow):

```
Read the file AGENT-MAP.md in the project root. It contains the vault structure,
your identity, memory, security rules, and operating instructions. Follow them.

If you see .agentos/memory/semantic.md — read it first. It contains facts and
preferences that persist across sessions. If you learn something new about me
or my project, append it to semantic.md in the correct format:

FACT: [active] description
PREF: [active] description
AVOID: description of what NOT to do

Never modify files in .agentos/init.d/, .agentos/security/, or .agentos/cron.d/
unless I explicitly ask you to "update the kernel".
```

For a comprehensive AI agent manual, see [docs/ai-manual.md](docs/ai-manual.md).

## CLI Commands

```bash
# Scaffold & Setup
agentfs init [dir]                # scaffold vault (same as npx create-agentfs)
agentfs onboard                   # interactive interview → identity + memory
agentfs migrate                   # migrate existing vault to AgentFS structure

# Compile
agentfs compile [agent]           # compile kernel → native configs (all or specific agent)
agentfs compile --dry-run         # preview changes without writing

# Memory
agentfs memory show               # display semantic memory
agentfs memory add "fact"         # add a fact to long-term memory
agentfs memory consolidate        # snapshot current session

# Security & Secrets
agentfs security mode <mode>      # enforce | complain | disabled
agentfs security add <module>     # add domain-specific security module
agentfs secret set <key>          # manage SOPS/age encrypted secrets

# Maintenance
agentfs doctor                    # vault health check
agentfs triage                    # classify Inbox/ files
agentfs sync                      # bidirectional memory sync
agentfs cron run <job>            # manually trigger a cron job
```

All commands support `--json`, `--config`, and `--output json` flags for non-interactive use by AI agents.

## Key Concepts

**Kernel Space** (`.agentos/`) — single source of truth: manifest, identity, memory, security, cron jobs. Never edited by agents directly.

**Compile Pipeline** — translates kernel into native formats: `CLAUDE.md` + `.claude/settings.json` for Claude, `.cursor/rules/agentfs-global.mdc` for Cursor, `.openclaw/` for OpenClaw.

**Memory System** — based on Tulving's taxonomy: semantic (facts, always loaded), episodic (events, lazy), procedural (skills, lazy). Confidence scoring with decay.

**Security** — AppArmor-style policies in `policy.yaml`. Compiles to real deny rules for Claude Code, advisory text for agents without enforcement.

**Three Profiles** — `personal` (solo), `company` (team with RBAC), `shared` (multi-user collaborative).

For the full architecture deep-dive, see [docs/architecture.md](docs/architecture.md).

## Documentation

| Document | For |
|----------|-----|
| [Quick Start Guide](docs/quickstart.md) | Humans — setup in 5 minutes |
| [AI Agent Manual](docs/ai-manual.md) | AI agents — operating instructions |
| [Architecture](docs/architecture.md) | Deep-dive into the full design |
| [Internals](docs/internals.md) | Memory system, boot sequence, security model, FHS mapping |
| [Contributing](CONTRIBUTING.md) | Adding compilers, security modules, commit conventions |

## Roadmap

| Quarter | Milestone |
|---------|-----------|
| Q2 2026 | Stable core (v0.2), 3+ example vaults, auto-compile (file watcher + git hooks), first community module |
| Q3 2026 | AgentFS Cloud MVP (hosted vault, sync, team profiles), MemPalace integration |
| Q4 2026 | Module Marketplace beta, Security Marketplace (`agentfs-security-{domain}`), Obsidian companion plugin |
| Q1 2027 | Multi-vault sync, Product Hunt launch |

## Strategic Integrations

AgentFS is an infrastructure layer — its value grows with every integration.

### MemPalace — Long-term Agent Memory
[github.com/milla-jovovich/mempalace](https://github.com/milla-jovovich/mempalace)

The highest-scoring open source memory system for AI: 96.6% on LongMemEval with zero cloud calls. AgentFS defines *where* and *when* to store memory (`.agentos/memory/`), MemPalace solves *how* to search and compress it. AAAK encoding provides 30x context compression — agents get the same knowledge at ~170 tokens instead of 650K. Direct API cost savings for users.

### Cognithor — Local-first AI OS

Cognithor builds a local operating system for AI agents (executor layer). AgentFS occupies the kernel layer: manifest, security policy, and memory standards. The "Kernel (AgentFS) + Executor (Cognithor)" stack delivers fully autonomous agents with zero cloud dependency.

### Plugin System — Community-driven Extensibility

The `agentfs-module-{name}` architecture enables community-built modules for specific domains: `agentfs-module-github`, `agentfs-module-slack`, `agentfs-security-hipaa`, `agentfs-security-fintech`. Each module is a reusable package of rules, integrations, and security policies — creating network effects as the ecosystem grows.

## License

MIT
