# AgentFS — Instructions for AI Agents

This file contains instructions for AI agents (Claude Code, Cursor, OpenClaw, etc.) working on the AgentFS project.

## Project Overview

AgentFS is a CLI tool (`npx create-agentfs`) that scaffolds an Obsidian vault as a filesystem-based operating system for AI agents. The core concept: a `.agentos/` kernel space serves as single source of truth and compiles into native agent config formats.

**Status:** v0.1.4 — All 13 epics implemented (Phases 1–11 complete). See `docs/architecture.md` for the full spec.

## Repository Structure

```
AgentFS/
├── AGENTS.md                    ← This file (agent instructions for all runtimes)
├── CLAUDE.md                    ← Includes @AGENTS.md (Claude Code entry point)
├── .cursorrules                 ← Cursor agent entry point (includes this file)
├── README.md                    ← Project overview and roadmap
├── CONTRIBUTING.md              ← Contribution guidelines
├── LICENSE                      ← MIT license
├── package.json                 ← create-agentfs (Node.js >= 24.0.0, ESM)
├── tsconfig.json                ← TypeScript strict, ES2022, NodeNext
├── tsconfig.test.json           ← Extends tsconfig for Jest + ESM
├── jest.config.js               ← Jest with ts-jest ESM preset
├── eslint.config.js             ← ESLint flat config with @typescript-eslint
├── docs/
│   ├── architecture.md          ← Full architecture spec (v3, 17 sections) — THE source of truth
│   ├── internals.md             ← Implementation reference (memory, boot, security, FHS)
│   ├── quickstart.md            ← Human quick start guide
│   └── ai-manual.md             ← AI agent manual for vault interaction
├── src/
│   ├── cli.ts                   ← CLI entry point (subcommand router)
│   ├── index.ts                 ← Public API barrel (re-exports main, VERSION)
│   ├── types/                   ← Core interfaces (Manifest, AgentCompiler, SecurityPolicy, Memory, Setup)
│   ├── utils/                   ← Utilities (fhs-mapping)
│   ├── generators/              ← Scaffold generators (filesystem, manifest, init, ignore, memory, prompts)
│   ├── compilers/               ← Compile drivers (base, claude, openclaw, cursor, agent-map)
│   ├── commands/                ← CLI subcommands (compile, onboard)
│   ├── memory/                  ← Memory system (parser, confidence, episodic, procedural)
│   ├── security/                ← Security subsystem (policy parser, AppArmor profiles)
│   ├── secrets/                 ← Secrets management (SOPS/age, exfil guard)
│   ├── cron/                    ← Cron jobs (consolidation, distillation, triage, heartbeat)
│   ├── sync/                    ← Sync & import (memory sync, drift detection)
│   ├── profiles/                ← Profile generators (personal, company, shared)
│   └── modules/                 ← Optional modules (career, content, engineering)
├── templates/
│   └── compilers/               ← Handlebars templates (claude.md.hbs, agent-map.md.hbs)
├── tests/                       ← Jest tests (261+ tests across 18 suites)
└── _bmad/                       ← BMAD Method tooling (skills, planning artifacts)
```

## Key Architecture Concepts

Before making any changes, read `docs/architecture.md`. Key concepts:

1. **Three-layer architecture:** User Space (vault/) → Native Runtimes (.claude/, .openclaw/, .cursor/rules/) → Kernel Space (.agentos/)
2. **Compile pipeline:** `.agentos/manifest.yaml` compiles into CLAUDE.md, .cursor/rules/, .openclaw/ via per-agent "drivers" in `compile.d/`
3. **Tulving's memory taxonomy:** semantic.md (facts, always loaded) + episodic/ (events, lazy) + procedural/ (skills, lazy)
4. **AppArmor-style security:** policy.yaml → real enforcement via native agent permissions
5. **Boot sequence:** SysVinit runlevels 0-6 with progressive disclosure

## Technical Context

### Runtime
- **Node.js >= 24.0.0 (LTS)** required (`engines` field in package.json)
- **ESM modules** — `"type": "module"` in package.json. All imports must use `.js` extensions:
  ```typescript
  import { readManifest } from '../compilers/base.js';  // correct
  import { readManifest } from '../compilers/base';     // WRONG — will fail at runtime
  ```
- **TypeScript strict mode** with `NodeNext` module resolution

### Testing
- **Jest in ESM mode** — requires `--experimental-vm-modules` flag (already configured in package.json `test` script)
- **Separate tsconfig** for tests: `tsconfig.test.json` adds `"types": ["jest"]` and `"isolatedModules": true`
- Test files go in `tests/` directory, not alongside source

## Development Rules

### Code Style
- Language: TypeScript (strict mode)
- Runtime: Node.js >= 24.0.0 (npx compatible, ESM)
- Template engine: Handlebars (.hbs)
- Config format: YAML (manifest, policy) + Markdown (init.d/, memory/)
- Naming: kebab-case for files, camelCase for variables, PascalCase for classes

### Architecture Rules
- **Everything is a file.** No databases, no APIs, no cloud dependencies
- **Vault works without AgentFS.** The generated vault must be usable with plain `cat` and `grep`
- **Agent is replaceable.** Never couple to a specific agent runtime
- **Idempotent.** `create-agentfs` on existing vault = safe. Never overwrite user files
- **Compile, don't symlink.** Each agent needs its own native format — compile from source of truth
- **Use existing standards.** Follow formats from `docs/architecture.md` exactly. Don't invent new conventions.

### Commit Convention
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Scope: `cli`, `compile`, `security`, `memory`, `docs`, `readme`
- Examples:
  - `feat(cli): add interactive profile selection`
  - `docs(architecture): add composable security modules`
  - `fix(compile): handle missing init.d files gracefully`

### Git Trailers (recommended)

Structured metadata appended to commit messages for decision tracking:

- `Constraint:` — active constraint that shaped this decision
- `Rejected:` — alternative considered and reason for rejection
- `Directive:` — warning for future modifiers of this code
- `Confidence:` — high | medium | low
- `Scope-risk:` — narrow | moderate | broad
- `Not-tested:` — edge case not covered by tests

Example:

```
feat(compile): add OpenClaw driver

Implement compile.d/openclaw for .omc/project-memory.json output.

Constraint: OMC has no enforcement API — advisory text only
Rejected: JSON Schema validation | too complex for v1
Confidence: high
Scope-risk: narrow
```

### Pull Request Convention
- PR title matches commit convention
- Description includes: what changed, why, how to test
- Architecture changes require update to `docs/architecture.md`

## How to Develop

```bash
# Setup
pnpm install              # install dependencies

# Build & run
pnpm run build            # compile TypeScript → dist/
pnpm run dev              # watch mode (auto-recompile)
pnpm run start            # run CLI: node dist/cli.js

# Test locally
pnpm link --global                 # register as global CLI
agentfs --help           # verify CLI works
agentfs compile --dry-run # test compile pipeline
node dist/cli.js --help  # alternative without pnpm link --global

# Quality
pnpm test                 # run Jest tests (261+ tests)
pnpm run test:watch       # watch mode for tests
pnpm run lint             # eslint
pnpm run lint:fix         # eslint with auto-fix
pnpm run typecheck        # type check without emitting
```

## AI Agent Usage (non-interactive mode)

All commands support `--json`, `--config`, and `--output json` flags for non-interactive use by AI agents:

```bash
# Scaffold vault without prompts — pass answers as JSON
agentfs init --json '{"vaultName":"my-vault","ownerName":"user","profile":"personal","primaryAgent":"claude","supportedAgents":["claude"],"modules":[]}'

# Or read answers from a YAML/JSON file
agentfs init --config setup.yaml

# Compile with JSON output (structured, parseable)
agentfs compile --output json

# Specify target directory
agentfs init --json '{"vaultName":"x"}' --dir /tmp/test-vault

# Combine flags
agentfs compile --output json --dir /path/to/vault
```

Common flags available on all commands:
- `--json '<json>'` — inline JSON input (replaces interactive prompts)
- `--config <path>` — read input from JSON or YAML file
- `--output json` — structured JSON output instead of human text
- `--dir <path>` — target vault directory (defaults to cwd)

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

## Additional Resources

- **[docs/ai-manual.md](docs/ai-manual.md)** — Detailed AI agent manual for vault interaction
- **[docs/quickstart.md](docs/quickstart.md)** — Human quick start guide

## What NOT to Do

- Do NOT add personal data (names, emails, API keys, vault paths) to any file
- Do NOT create Obsidian-specific plugins — AgentFS is agent-agnostic and editor-agnostic
- Do NOT add dependencies without justification in architecture doc
- Do NOT use LangChain, LlamaIndex, or any agent framework — this is a filesystem tool
- Do NOT use CommonJS (`require()`) — this is an ESM project, use `import`
- Do NOT create `.ts` test files alongside source — all tests go in `tests/`
