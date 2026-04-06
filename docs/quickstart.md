# AgentFS Quick Start Guide

This guide will help you get an AgentFS vault up and running in under 5 minutes.

## Prerequisites

- **Node.js >= 24.0.0** (LTS) — check with `node --version`
- An empty directory or an existing Obsidian vault

## 1. Setup

```bash
# Scaffold interactively
npx create-agentfs my-vault

# Go into your new vault
cd my-vault
```

Or if you already have a vault and want to add AgentFS to it:

```bash
cd my-existing-vault
npx create-agentfs .
```

## 2. Onboarding (Interactive)

If you chose to skip the interactive prompts during scaffolding, you can run the onboard wizard manually. The setup wizard is an "agent-led interview" that builds your `manifest.yaml` and identity profile:

```bash
agentfs onboard
```

## 3. The Kernel Files (`.agentos/`)

Your vault now has an `.agentos/` hidden folder. This is the **Kernel Workspace**. Never let agents directly overwrite this unless explicitly ordered.

Check your configuration:
- `.agentos/manifest.yaml` — your settings, preferred agents, paths
- `.agentos/init.d/00-identity.md` — who you are and how agents should act
- `.agentos/memory/semantic.md` — agent long-term facts

## 4. Compiling the Vault

Because AI agents (Claude Code, Cursor, OpenClaw) don't speak the same configuration language, AgentFS uses **Compilers**.

```bash
agentfs compile
```

This command reads everything in your `.agentos/` kernel and translates it into native formats for every AI tool you use:
- `CLAUDE.md` and `.claude/settings.json` for Claude Code
- `.cursor/rules/agentfs-global.mdc` for Cursor
- `.openclaw/` configs for OpenClaw

Whenever you change your preferences in the kernel, just run `agentfs compile` again to propagate the updates to all agents simultaneously.

## 5. Daily CLI Commands

```bash
# Add a fact to the AI's long-term memory
agentfs memory add "I strictly use TypeScript strict mode."

# Check the health of your vault infrastructure
agentfs doctor

# Categorize loose files in your Inbox/
agentfs triage

# Merge native agent memory edits back into the canonical kernel
agentfs sync
```

## 6. Migrating an Existing Vault

If you already have a vault with `CLAUDE.md` or `.cursor/rules/` but no `.agentos/` kernel:

```bash
agentfs migrate
```

This analyzes your vault structure and suggests how to set up the kernel without losing existing configs.

## Next Steps
- Read [AI Manual](ai-manual.md) to understand how the AI Agent itself operates within AgentFS.
- Read [Architecture](architecture.md) for the internal file structures and principles.
- Read [Internals](internals.md) for memory system, boot sequence, security model details.
- After running `agentfs compile`, check `AGENT-MAP.md` at your vault root for the generated vault router.
