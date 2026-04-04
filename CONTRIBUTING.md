# Contributing to AgentFS

## Current Phase: Specification

AgentFS is in Phase 1 (specification). The architecture document (`docs/architecture.md`) is the primary deliverable. Code implementation hasn't started yet.

### How to Contribute Now

**Architecture feedback** — open an issue with the `architecture` label if you see gaps, inconsistencies, or have alternative approaches.

**Competing approaches** — if you know of projects solving similar problems, share them. See `docs/competitive-research.md` for existing analysis.

**Use cases** — describe your vault setup, which agents you use, and what pain points AgentFS could solve for you.

### When Implementation Starts (Phase 2+)

**Commit convention:**
```
type(scope): description

Types: feat, fix, docs, refactor, test, chore
Scopes: cli, compile, security, memory, docs, readme
```

**Pull requests:**
- One feature per PR
- Update `docs/architecture.md` if changing design decisions
- Add tests for new functionality
- No personal data in any file (names, emails, API keys, vault paths)

**Code style:**
- TypeScript (strict mode)
- No agent frameworks (LangChain, LlamaIndex, etc.)
- No databases — everything is files
- kebab-case for files, camelCase for variables, PascalCase for classes

### What We Don't Accept

- Obsidian-specific plugins (AgentFS is editor-agnostic)
- Cloud dependencies or SaaS integrations
- Vendor lock-in to any specific AI agent
- Proprietary file formats
