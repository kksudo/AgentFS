# AgentFS Quick Start Guide

This guide will help you get an AgentFS vault up and running in under 5 minutes.

## 1. Setup

You can deploy AgentFS into an empty directory or an existing Obsidian vault.

```bash
# Easiest way (scaffolds interactively)
npx create-agentfs my-vault

# Go into your new vault
cd my-vault

# Run the CLI tool (installed globally or locally via npx)
npm link # If you cloned the repository locally
```

## 2. Onboarding (Interactive)

If you chose to skip the interactive prompts during scaffolding, you can run the onboard wizard manually. The setup wizard is an "agent-led interview" that builds your `manifest.yaml` and identity profile:

```bash
agentfs onboard
```

## 3. The Kernel Files (`.agentos/`)

Your vault now has an `.agentos/` hidden folder. This is the **Kernel Workspace**. Never let agents directly overwrite this unless explicitly ordered. 

Check your configuration:
- `.agentos/manifest.yaml` (Your settings, preferred agents, paths)
- `.agentos/init.d/00-identity.md` (Who you are and how agents should act)
- `.agentos/memory/semantic.md` (Agent long-term facts)

## 4. Compiling the Vault (The Magic)

Because AI agents (Claude Code, Cursor, OpenClaw) don't speak the same configuration language, AgentFS uses **Compilers**.

```bash
agentfs compile
```

This commands reads everything in your `.agentos/` kernel and translates it into native formats for every AI tool you use:
- Generates `CLAUDE.md` and `.claude/settings.json` for Claude Code.
- Generates `.cursorrules` for Cursor.
- Generates `SOUL.md` and `.omc/project-memory.json` for OpenClaw.

Whenever you change your preferences in the kernel, just run `agentfs compile` again to propagate the updates to all agents simultaneously.

## 5. Daily CLI Commands

Here are the primary commands you will use to manage your AI Operating System:

```bash
# Add a fact to the AI's long-term memory
agentfs memory add "I strictly use TypeScript strict mode."

# Check the health of your vault infrastructure
agentfs doctor

# Categorize loose files in your Inbox/ down to your daily notes
agentfs triage

# Merge native agent memory edits (like from OpenClaw) back into the canonical kernel
agentfs sync
```

## Next Steps
- Read [AI Manual](ai-manual.md) to understand how the AI Agent itself operates within AgentFS.
- Read [Architecture](architecture.md) for the internal file structures and principles.
