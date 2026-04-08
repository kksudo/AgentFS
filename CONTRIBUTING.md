# Contributing to AgentFS

Thank you for your interest in contributing to **AgentFS**! This document provides guidelines and workflows for contributing to the project.

## Table of Contents
1. [Core Philosophy](#core-philosophy)
2. [Development Setup](#development-setup)
3. [Adding a New Compiler Driver](#adding-a-new-compiler-driver)
4. [Creating Security Modules](#creating-security-modules)
5. [Commit Convention](#commit-convention)
6. [Pull Request Process](#pull-request-process)
7. [Release Process](#release-process)

## Core Philosophy

AgentFS is built on **Unix philosophy adapted for AI agents** (see `docs/architecture.md`, Section 0):

1. **Everything is a file.** Memory, tasks, skills, configs — markdown. No databases.
2. **Do one thing well.** Each file has one responsibility.
3. **Programs work together.** Frontmatter is the API contract. Wikilinks are pipes.
4. **Text is the universal interface.** Markdown: human-readable, agent-parseable, Obsidian-renderable.
5. **No captive UI.** The vault works without Obsidian, without any agent, without cloud.

Key constraints:
- Avoid external dependencies whenever possible — keep the core CLI lean.
- Files must be human-readable standard Markdown/YAML — both humans and agents interact with them directly.
- Canonical state lives in `.agentos/`; agents read from it, tools compile it into native formats.

## Development Setup

### Prerequisites
- **Node.js >= 24.0.0** (LTS) — use `nvm use` (`.nvmrc` included)
- **pnpm** — `npm install -g pnpm`

### Quick Start

```bash
# Clone
git clone git@github.com:kksudo/agentfs.git
cd agentfs

# Switch to correct Node version
nvm use

# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests (261+ tests, Jest ESM mode)
pnpm test

# Test CLI locally
node dist/cli.js --help

# Or link globally
pnpm link --global
agentfs --help
```

### Install from Local Repo

```bash
# Link globally (uses local build, updates live)
npm link
agentfs --help

# Unlink when done
npm unlink -g create-agentfs
```

### All Commands

```bash
pnpm run build        # compile TypeScript → dist/
pnpm run dev          # watch mode (auto-recompile)
pnpm test             # run Jest tests
pnpm run test:watch   # watch mode for tests
pnpm run lint         # eslint
pnpm run lint:fix     # eslint with auto-fix
pnpm run typecheck    # type check without emitting
```

### Important: ESM Project

This is an ESM project (`"type": "module"` in package.json). All imports must use `.js` extensions:

```typescript
import { readManifest } from '../compilers/base.js';  // correct
import { readManifest } from '../compilers/base';     // WRONG
```

## Adding a New Compiler Driver

To support a new AI agent runtime (like Cursor, OpenClaw, or a custom LLM interface), you need to implement an `AgentCompiler` driver.

1. **Create the driver file** in `src/compilers/`:
   ```typescript
   import type { AgentCompiler, CompileContext, CompileResult } from '../types/index.js';

   export const myagentCompiler: AgentCompiler = {
     name: 'myagent',
     
     async compile(context: CompileContext): Promise<CompileResult> {
       // Logic to read manifest, init scripts, and semantic memory
       // Output native configuration formats (e.g. .myagentrc or instructions.md)
       
       return {
         agent: 'myagent',
         outputs: [
           { path: '.myagent/rules.md', content: '# Rules...', managed: true }
         ],
         summary: 'Compiled instructions for MyAgent.'
       };
     },
     
     supports(_feature: string): boolean {
       // e.g. return true for 'security-enforce' if native MAC is supported
       return false;
     }
   };
   ```

2. **Register it** in `src/commands/compile.ts` inside `COMPILER_REGISTRY`.

3. **Write tests** in `tests/multi-agent.test.ts`.

## Creating Security Modules

AgentFS supports composable security modules. A security module is simply a YAML file that provides extensions to the main `policy.yaml`.

The community shares domain-specific security modules via npm, prefixed with `agentfs-security-`.

### Creating a Module
1. Create a `policy.yaml` file outlining the rules for your module.
2. Publish it to npm with the name `agentfs-security-<your-domain>` (e.g., `agentfs-security-docker`).

### Using a Module
Users can install your module via:
```bash
agentfs security add agentfs-security-docker
```
AgentFS will automatically fetch the policies and merge them into the local vault's security configuration under `.agentos/security/modules/`.

## Commit Convention

We use Conventional Commits. All PRs must have atomic commits following this format:
- `feat(scope): add new feature`
- `fix(scope): resolve bug`
- `docs(scope): update documentation`
- `test(scope): add missing tests`
- `refactor(scope): restructure without changing behavior`
- `chore(repo): update config, dependencies, etc.`

Scoping is highly encouraged: e.g. `feat(compile)`, `feat(memory)`, `fix(cli)`.

### Git Trailers (recommended)

Structured metadata appended to commit messages for decision tracking:

```
feat(compile): add OpenClaw driver

Implement compile.d/openclaw for .omc/project-memory.json output.

Constraint: OMC has no enforcement API — advisory text only
Rejected: JSON Schema validation | too complex for v1
Confidence: high
Scope-risk: narrow
```

## Pull Request Process

1. Create a feature branch (`feat/your-feature-name` or `fix/your-fix-name`).
2. **Never push directly to `main`** — always use a PR.
3. Add comprehensive unit tests. We mandate **high test coverage** (95%+).
4. Run `pnpm run lint` and `pnpm test` before pushing.
5. Ensure your PR description documents the exact problem, the solution, and provides any needed verification steps or commands.
6. CI must pass (build + typecheck + lint + test on Node 24).
7. Code ownership check: please request a review from `@kksudo`.

## Release Process

Releases are automated via GitHub Actions. Creating a GitHub Release triggers `npm publish`.

### Prerequisites (one-time setup)

1. **npm account** — register at https://www.npmjs.com
2. **npm token** — Profile → Access Tokens → Generate New Token → **Automation**
3. **GitHub secret** — Repo → Settings → Secrets → Actions → `NPM_TOKEN` = your token

### Publishing a Release

```bash
# 1. Make sure you're on main with latest
git checkout main && git pull

# 2. Bump version (creates commit + git tag)
npm version patch   # 0.1.0 → 0.1.1 (bugfix)
npm version minor   # 0.1.0 → 0.2.0 (new features)
npm version major   # 0.1.0 → 1.0.0 (breaking changes)

# 3. Push commit and tag
git push && git push --tags

# 4. Create GitHub Release (triggers npm publish)
gh release create v0.1.1 --title "v0.1.1" --generate-notes
```

### What Happens Automatically

```
GitHub Release created
  → publish.yml triggers
    → pnpm install → build → test
      → pnpm publish --provenance --access public
        → Package live on npm
```

### Verify

```bash
npm view create-agentfs        # check package info
npx create-agentfs --help      # test as end user
```

### Version Policy

- **patch** (0.0.x) — bug fixes, lint fixes, doc updates
- **minor** (0.x.0) — new features, new compile drivers, new commands
- **major** (x.0.0) — breaking changes to manifest.yaml schema, CLI args, or compile output format
