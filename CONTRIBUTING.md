# Contributing to AgentFS

Thank you for your interest in contributing to **AgentFS**! This document provides guidelines and workflows for contributing to the project.

## Table of Contents
1. [Core Philosophy](#core-philosophy)
2. [Development Setup](#development-setup)
3. [Adding a New Compiler Driver](#adding-a-new-compiler-driver)
4. [Creating Security Modules](#creating-security-modules)
5. [Commit Convention](#commit-convention)
6. [Pull Request Process](#pull-request-process)

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

1. **Clone the repo**
   ```bash
   git clone git@github.com:kksudo/agentfs.git
   cd agentfs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests**
   We use Jest in ESM mode:
   ```bash
   npm test
   ```

4. **Build and test the CLI locally**
   ```bash
   npm run build
   node dist/cli.js --help
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
     
     supports(feature: string): boolean {
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

## Pull Request Process

1. Create a feature branch (`feat/your-feature-name` or `fix/your-fix-name`).
2. Add comprehensive unit tests. We mandate **high test coverage** (95%+). 
3. Run `npm run lint` and `npm test` before pushing.
4. Ensure your PR description documents the exact problem, the solution, and provides any needed verification steps or commands.
5. Code ownership check: please request a review from `@kksudo`.
