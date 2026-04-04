# AgentFS — Instructions for AI Agents

This file contains instructions for AI agents (Claude Code, Cursor, OpenClaw, etc.) working on the AgentFS project.

## Project Overview

AgentFS is a CLI tool (`npx create-agentfs`) that scaffolds an Obsidian vault as a filesystem-based operating system for AI agents. The core concept: a `.agentos/` kernel space serves as single source of truth and compiles into native agent config formats.

**Status:** Phase 1 — Specification. No implementation code yet. Architecture document is in `docs/architecture.md`.

## Repository Structure

```
AgentFS/
├── README.md                    ← Project overview and roadmap
├── CLAUDE.md                    ← This file (agent instructions)
├── CONTRIBUTING.md              ← Contribution guidelines
├── LICENSE                      ← MIT license
├── docs/
│   ├── architecture.md          ← Full architecture spec (v3) — THE source of truth
│   ├── competitive-research.md  ← Analysis of 12 existing repos
│   └── metrics/                 ← Migration metrics and baseline data
└── .gitignore
```

## Key Architecture Concepts

Before making any changes, read `docs/architecture.md`. Key concepts:

1. **Three-layer architecture:** User Space (vault/) → Native Runtimes (.claude/, .omc/) → Kernel Space (.agentos/)
2. **Compile pipeline:** `.agentos/manifest.yaml` compiles into CLAUDE.md, .cursorrules, .omc/ via per-agent "drivers" in `compile.d/`
3. **Tulving's memory taxonomy:** semantic.md (facts, always loaded) + episodic/ (events, lazy) + procedural/ (skills, lazy)
4. **AppArmor-style security:** policy.yaml → real enforcement via native agent permissions
5. **Boot sequence:** SysVinit runlevels 0-6 with progressive disclosure

## Development Rules

### Code Style (when implementation starts)
- Language: TypeScript (strict mode)
- Runtime: Node.js (npx compatible)
- Template engine: Handlebars (.hbs)
- Config format: YAML (manifest, policy) + Markdown (init.d/, memory/)
- Naming: kebab-case for files, camelCase for variables, PascalCase for classes

### Architecture Rules
- **Everything is a file.** No databases, no APIs, no cloud dependencies
- **Vault works without AgentFS.** The generated vault must be usable with plain `cat` and `grep`
- **Agent is replaceable.** Never couple to a specific agent runtime
- **Idempotent.** `create-agentfs` on existing vault = safe. Never overwrite user files
- **Compile, don't symlink.** Each agent needs its own native format — compile from source of truth

### Commit Convention
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Scope: `cli`, `compile`, `security`, `memory`, `docs`, `readme`
- Examples:
  - `feat(cli): add interactive profile selection`
  - `docs(architecture): add composable security modules`
  - `fix(compile): handle missing init.d files gracefully`

### Pull Request Convention
- PR title matches commit convention
- Description includes: what changed, why, how to test
- Architecture changes require update to `docs/architecture.md`

## How to Set Up This Project

```bash
# Clone
git clone https://github.com/<owner>/AgentFS.git
cd AgentFS

# When implementation starts (Phase 2):
npm init -y
npm install typescript @types/node handlebars js-yaml inquirer
npx tsc --init --strict --target ES2022 --module NodeNext

# Project structure (Phase 2):
mkdir -p src/{cli,profiles,generators,compilers,security,commands,modules,utils}
mkdir -p templates/{compilers,init.d,cron.d,user-templates,security-modules}
mkdir -p tests
```

## Architecture Document Navigation

The main spec (`docs/architecture.md`) has 17 sections:

| Section | Content |
|---------|---------|
| 0 | Unix manifesto adapted for agents |
| 1 | Three-layer architecture (user space, native runtimes, kernel space) |
| 2 | Kernel space structure (`.agentos/`) |
| 3 | User space layouts (personal, company, shared profiles) |
| 4 | Boot sequence (SysVinit runlevels, memory bootstrap) |
| 5 | Cron jobs (heartbeat, consolidation, distillation, triage) |
| 6 | Signals (inter-agent communication via files) |
| 7 | Frontmatter as syscall API |
| 8 | CLI commands (`create-agentfs`, post-init commands) |
| 9 | Compile pipeline (kernel → native configs) |
| 10 | Package architecture (src/ tree, dependencies) |
| 11 | FHS mapping table |
| 12 | Naming conventions |
| 13 | Invariant principles |
| 14 | Migration strategy (existing vault → AgentFS) |
| 15 | Security model (5-level defense in depth) |
| 16 | Open questions |
| 17 | Roadmap (11 phases) |

## What NOT to Do

- Do NOT add personal data (names, emails, API keys, vault paths) to any file
- Do NOT implement code before architecture is approved (Phase 1 = docs only)
- Do NOT create Obsidian-specific plugins — AgentFS is agent-agnostic and editor-agnostic
- Do NOT add dependencies without justification in architecture doc
- Do NOT use LangChain, LlamaIndex, or any agent framework — this is a filesystem tool
