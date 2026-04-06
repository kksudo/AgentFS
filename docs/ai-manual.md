# AgentFS Manual for AI Agents

> **ATTENTION AI AGENT**: If you are an AI reading this file, this is your primary operating manual. You are currently operating inside an **AgentFS Vault**. AgentFS is a filesystem-based Operating System designed explicitly for you.

You run in "User Space", acting on the vault contents on behalf of the human operator (the "Admin").

## 1. Core Directives

1. **You manipulate files, not databases.** This vault is a file-system database. The state of the world is represented purely by folders and Markdown/YAML files.
2. **Never modify the Kernel Space.** The `.agentos/` directory is Kernel Space. It contains your source-code equivalents: the `manifest.yaml`, your `.agentos/init.d/` personality/identity files, and core systems. **You are strictly forbidden from modifying files in `.agentos/init.d/`, `.agentos/security/`, and `.agentos/cron.d/` unless the human explicitly commands you to "update the kernel".**
3. **Respect Security Boundaries.** There may be AppArmor-style protections implemented in `.claude/settings.json` or other compiler outputs. Do not attempt to bypass path access restrictions.
4. **Follow the File Hierarchy Standard (FHS):**
   - `Inbox/`: Read this for new, raw, unprocessed thoughts and notes.
   - `Daily/` or `Journals/`: Timestamped logs of actions and daily standups.
   - `Projects/`: Active working spaces.

## 2. Managing Your Memory

You have access to persistent, cross-session memory. This means if you learn a fact today, you don't have to relearn it tomorrow.

### Semantic Memory (Facts & Preferences)
- Location: `.agentos/memory/semantic.md`
- **Rule**: You are allowed to (and encouraged to) append newly learned facts and user preferences to `semantic.md`.
- **Format**:
  ```markdown
  FACT: [active] The project uses React Native and Expo.
  PREF: [active] The user hates verbose code explanations; respond directly.
  AVOID: don't suggest LangChain or heavy frameworks.
  PATTERN: [confidence:0.7] prefers morning code reviews.
  ```
- Do not delete old lines in `semantic.md`. Append new lines.

### Episodic Memory (Events & Snapshots)
- Location: `.agentos/memory/episodic/`
- Every major feature completion or session closure should result in a temporal snapshot here automatically via cron, but you can request the user to run `agentfs memory consolidate` to save your context.

## 3. Resolving Secrets

Are you seeing weird tags like `ENC[agentfs:github_token:xxxx]`? 
- **DO NOT** ask the user what the token is.
- **DO NOT** attempt to guess the token.
- **HOW TO USE**: Treat that exact string literally as the value in your shell commands or scripts. The underlying interpreter proxy will automatically decrypt and inject the actual secret at runtime.
- **WARNING**: Do not echo or log the token in your markdown output, an `ExfiltrationGuard` might terminate your session.

## 4. Compilers and Native Formats

The reason you exist with your exact ruleset is because of the AgentFS Compiler. 
If you are Claude Code, your instructions come from `CLAUDE.md`. If Cursor, `.cursorrules`. If OpenClaw, `SOUL.md`.

These files are auto-generated. **Do not modify `CLAUDE.md`, `.cursorrules`, or `SOUL.md` manually.** If you want to change your permanent rules, you must either edit `.agentos/init.d/00-identity.md` (if permitted by the user) or ask the human to update it and run `agentfs compile`.

## 5. Summary

Everything you need is in this folder structure. Treat this vault like a Linux system where you are a highly privileged daemon.

Good luck.
