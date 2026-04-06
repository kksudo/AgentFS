---
title: "Design Draft: Modules & Plugin System"
date: 2026-04-07
status: draft
phase: 11
---

# Modules & Plugin System — Design Draft

## Problem

AgentFS scaffold генерирует базовую структуру vault (Inbox, Daily, Tasks, Projects, etc.). Но у разных пользователей разные потребности: кому-то нужен career track, кому-то content pipeline, кому-то engineering knowledge base.

Сейчас это решается через `--modules` flag при scaffold:

```bash
npx create-agentfs . --json '{"modules": ["career", "content", "engineering"]}'
```

Но это: статично (только при создании vault), встроено в core (нельзя расширять), и не имеет lifecycle (install/update/remove).

## Два уровня расширений

### 1. Built-in Modules (есть сейчас)

Генераторы папок и файлов, встроенные в AgentFS. Работают при scaffold.

```
src/modules/
  career/      → Career/, Career/applications/, Career/interviews/
  content/     → Content/, Content/LinkedIn/, Content/Threads/, ...
  engineering/ → Engineering/, Engineering/runbooks/, ...
```

### 2. Community Plugins (новое)

npm-пакеты с расширенной функциональностью.

```
agentfs-module-{name}   → npm package
```

## Plugin Architecture

### Plugin Package Structure

```
agentfs-module-devops/
  package.json          ← name: "agentfs-module-devops"
  agentfs.plugin.yaml   ← Plugin manifest
  generators/
    scaffold.ts         ← Directory/file generator
  compilers/
    claude.ts           ← Custom CLAUDE.md sections
    cursor.ts           ← Custom .cursor/rules/ additions
  memory/
    semantic.md         ← Default semantic entries
    procedural/
      incident-response.md
      runbook-creation.md
  security/
    devops.yaml         ← Security module (deny patterns for infra)
  templates/
    runbook.md.hbs      ← Handlebars templates
```

### agentfs.plugin.yaml

```yaml
name: devops
version: 1.0.0
description: "DevOps module for AgentFS — runbooks, incident response, IaC patterns"
author: "kksudo"
license: MIT

# What this plugin provides
provides:
  directories:
    - path: Engineering/runbooks/
      purpose: "Operational runbooks"
    - path: Engineering/postmortems/
      purpose: "Incident postmortems"

  memory:
    semantic:
      - type: PREF
        content: "runbooks use step-by-step format with rollback instructions"
      - type: AVOID
        content: "don't store credentials in runbooks, use secret refs"
    procedural:
      - name: incident-response
      - name: runbook-creation

  security:
    modules:
      - devops.yaml

  compilers:
    claude: compilers/claude.ts
    cursor: compilers/cursor.ts

# Dependencies on other modules
requires:
  modules: []                    # No module dependencies
  agentfs: ">=0.3.0"            # Minimum AgentFS version
```

### CLI Commands

```bash
# Discovery
agentfs module search devops           # Search npm registry
agentfs module search --tag security   # Search by tag
agentfs module list                    # List installed modules

# Lifecycle
agentfs module install devops          # npm install + scaffold + compile
agentfs module update devops           # npm update + re-scaffold (non-destructive)
agentfs module remove devops           # Remove generated files + entries

# Info
agentfs module info devops             # Show plugin manifest
agentfs module diff devops             # Show what install would change
```

### Install Flow

```
agentfs module install devops
  │
  ├─ 1. npm install agentfs-module-devops --save-dev
  │
  ├─ 2. Read agentfs.plugin.yaml
  │
  ├─ 3. Run generators (create directories, template files)
  │     └─ Non-destructive: skip existing files
  │
  ├─ 4. Merge memory entries
  │     ├─ Append semantic entries to .agentos/memory/semantic.md
  │     └─ Copy procedural skills to .agentos/memory/procedural/
  │
  ├─ 5. Register security modules
  │     └─ Copy devops.yaml to .agentos/security/modules/
  │
  ├─ 6. Update manifest.yaml
  │     └─ Add to modules: [devops] list
  │
  └─ 7. Recompile
        └─ agentfs compile (includes new compiler sections)
```

### Compiler Extension API

Plugins can extend the compile output:

```typescript
// compilers/claude.ts
import type { CompilerExtension } from 'agentfs';

export const claudeExtension: CompilerExtension = {
  // Append to CLAUDE.md after core sections
  sections: [
    {
      title: 'DevOps Conventions',
      content: `
## Runbook Format
- Use numbered steps with clear preconditions
- Include rollback procedure for each step
- Tag with severity: P1/P2/P3/P4

## Incident Response
- Start with impact assessment
- Use Engineering/postmortems/ template for PIR
      `.trim()
    }
  ],

  // Add to .claude/settings.json
  settings: {
    deny_read: [
      '**/*.tfstate',
      '**/*.tfstate.backup',
      '**/kubeconfig*'
    ]
  }
};
```

### Security Model for Plugins

Plugins CANNOT:
- Override core security policy (deny patterns are additive only)
- Modify .agentos/manifest.yaml directly (only through CLI)
- Execute arbitrary code at compile time (sandboxed generators)
- Access secrets or encrypted files

Plugins CAN:
- Add deny-read/deny-write patterns (additive merge)
- Add semantic/episodic/procedural memory entries
- Extend compiler output with custom sections
- Generate directories and template files

### Security Module as Plugin Subtype

Security modules (`agentfs-security-{domain}`) are a specialized plugin type:

```yaml
# agentfs-security-crypto/agentfs.plugin.yaml
name: security-crypto
type: security-module        # Special type
version: 1.0.0
description: "Deny patterns for cryptographic material"

provides:
  security:
    modules:
      - crypto.yaml

# crypto.yaml
deny_read:
  - "**/*.pem"
  - "**/*.key"
  - "**/*.p12"
  - "**/*.pfx"
  - "**/*.jks"
  - "**/*.keystore"
  - "**/id_rsa*"
  - "**/id_ed25519*"
  - "**/.ssh/config"

deny_write:
  - "**/*.pem"
  - "**/*.key"
```

```bash
# Install as regular module
agentfs module install security-crypto

# Or via security shortcut
agentfs security add crypto
# → equivalent to: agentfs module install security-crypto
```

### Built-in → Plugin Migration

Existing built-in modules (career, content, engineering) should eventually become plugins:

Phase 1 (current): built-in generators in `src/modules/`
Phase 2 (v0.3.0): extract to `agentfs-module-career`, `agentfs-module-content`, `agentfs-module-engineering`
Phase 3 (v1.0.0): built-in modules become thin wrappers that install the npm package

This allows community to fork and customize.

### Plugin Registry / Marketplace

v1.0.0: npm registry search with `agentfs-module-*` naming convention.

Future: curated marketplace with verified badge, ratings, install counts.

```bash
agentfs module search --verified    # Only verified plugins
agentfs module search --popular     # Sort by installs
```

### manifest.yaml Integration

```yaml
# .agentos/manifest.yaml (after module install)
modules:
  builtin:
    - career
    - content
  plugins:
    - name: devops
      version: "1.0.0"
      installed: "2026-04-07"
    - name: security-crypto
      version: "1.2.0"
      installed: "2026-04-07"
```

### Open Questions

1. Версионирование плагинов при обновлении AgentFS — как мигрировать breaking changes в plugin API?
2. Нужен ли lock file (аналог package-lock.json) для плагинов?
3. Стоит ли поддерживать локальные плагины (без публикации в npm) для закрытых команд?
4. Как хендлить конфликты между плагинами (два плагина добавляют deny pattern на одинаковый путь)?
5. Нужен ли dry-run для `module install` по умолчанию (показать что изменится)?
