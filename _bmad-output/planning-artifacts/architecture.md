---
stepsCompleted: [init, context, starter, decisions, patterns, structure, validation, complete]
inputDocuments:
  - docs/architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief.md
  - docs/competitive-research.md
workflowType: 'architecture'
project_name: 'AgentFS'
user_name: 'kksudo'
date: '2026-04-04'
---

# Architecture Decision Document — AgentFS

_Этот документ фиксирует ключевые архитектурные решения для AgentFS на основе полной спецификации `docs/architecture.md` (v3, 17 секций)._

## System Context & Constraints

### Контекст системы

AgentFS — CLI-инструмент, который создаёт и управляет файловой структурой vault. Он НЕ runtime-сервис: запускается по команде, делает работу (scaffold/compile/sync), завершается.

```
┌─────────────┐     npx create-agentfs      ┌──────────────┐
│  Пользователь│ ─────────────────────────── │   AgentFS    │
│  (engineer)  │     agentfs compile         │   CLI        │
│              │     agentfs onboard         │   (Node.js)  │
└─────────────┘     agentfs security         └──────┬───────┘
                                                     │
                                              reads/writes
                                                     │
                                              ┌──────▼───────┐
                                              │  Vault (fs)   │
                                              │  .agentos/    │
                                              │  .claude/     │
                                              │  .omc/        │
                                              │  vault dirs   │
                                              └───────────────┘
                                                     │
                                              reads native
                                                     │
                                         ┌───────────┴──────────┐
                                         │                      │
                                    ┌────▼─────┐          ┌────▼─────┐
                                    │Claude Code│          │ Cursor   │
                                    │(reads     │          │(reads    │
                                    │CLAUDE.md) │          │.cursorrules)
                                    └──────────┘          └──────────┘
```

### Constraints

| Constraint | Обоснование |
|-----------|------------|
| Всё — файлы (no DB, no API, no cloud) | Vault должен работать с `cat` и `grep` |
| Node.js 18+ / npx compatible | Стандартный DX для CLI tools |
| TypeScript strict mode | Type safety для compile pipeline |
| YAML + Markdown only | Нет проприетарных форматов, нет vendor lock-in |
| Idempotent операции | Безопасный повторный запуск |
| Agent-agnostic | Ядро не знает про конкретный агент |
| Vault работает без AgentFS | Нет runtime dependency |

## Technology Stack

### Core

| Layer | Technology | Обоснование |
|-------|-----------|------------|
| Language | TypeScript (strict) | Type safety для compile pipeline, широкий tooling |
| Runtime | Node.js 18+ | npx compatibility, filesystem APIs |
| Template Engine | Handlebars (.hbs) | Logic-less templates, partials, helpers |
| Config Format | YAML (js-yaml) | Human-readable, supports complex structures |
| Content Format | Markdown | Universal: human, agent, Obsidian |
| CLI Framework | inquirer | Interactive prompts для setup/onboard |

### Security (Phase 5-6)

| Component | Technology | Обоснование |
|-----------|-----------|------------|
| Encryption | SOPS + age | Industry standard для secrets-as-code |
| Policy | Custom YAML (AppArmor-inspired) | Нет existing solution для AI agent access control |
| Input Validation | Custom regex scanner | Prompt injection detection |
| Lint | agnix (npm dep) | 385 validation rules для agent configs |

### Build & Test

| Tool | Purpose |
|------|---------|
| tsc | TypeScript compilation |
| Jest | Unit + integration tests |
| eslint | Code quality |

## Key Architecture Decisions

### ADR-1: Три слоя (Kernel → Drivers → User Space)

**Решение:** Трёхслойная архитектура по аналогии с Linux.

**Контекст:** Каждый AI-агент читает только свой нативный формат. Нужен единый source of truth, который транслируется в нативные конфиги.

**Альтернативы:**
- Symlinks/mounts → не все агенты поддерживают, OS-specific
- Single unified config → нет стандарта, каждый агент парсит по-своему
- Runtime proxy → adds dependency, vault перестаёт работать без proxy

**Следствия:**
- `.agentos/` — canonical state, никогда не читается агентами напрямую
- `compile.d/{agent}/` — per-agent драйверы-трансляторы
- Новый агент = новый driver, ядро не меняется

### ADR-2: Compile Pipeline (не symlink, не runtime)

**Решение:** `agentfs compile` генерирует нативные конфиги из source of truth.

**Контекст:** Каждый агент ожидает свой формат: CLAUDE.md, .cursorrules, .omc/project-memory.json.

**Альтернативы:**
- Symlinks → не все FS поддерживают, CLAUDE.md != .cursorrules по формату
- Runtime translation → requires daemon, vault не работает offline
- Manual sync → error-prone, drift

**Следствия:**
- Handlebars templates для каждого output формата
- `--dry-run` для preview
- Ownership model: compiled files owned by AgentFS, user files — не трогаем

### ADR-3: Memory по Tulving (Semantic / Episodic / Procedural)

**Решение:** Три типа памяти по когнитивной таксономии Tulving.

**Контекст:** Плоский key-value не масштабируется. Нужно различать факты (semantic), события (episodic), навыки (procedural).

**Альтернативы:**
- Single file → не масштабируется, все токены при каждом boot
- Database → нарушает "всё есть файл"
- JSON → менее читаем человеком

**Следствия:**
- `semantic.md` — always loaded at boot (compact, ~10x token savings)
- `episodic/YYYY-MM-DD.md` — lazy-loaded by date
- `procedural/{skill}.md` — lazy-loaded by name
- Confidence scoring с decay для PATTERN записей

### ADR-4: AppArmor-style Security

**Решение:** `policy.yaml` с Mandatory Access Control, компилируемый в native enforcement.

**Контекст:** Claude Code имеет `permissions.deny[]` — реальный path-based deny. Но он не настроен по умолчанию.

**Альтернативы:**
- Advisory-only (text в CLAUDE.md) → agent может игнорировать
- Runtime proxy → complexity, availability
- No security → unacceptable for sensitive vaults

**Следствия:**
- `policy.yaml` — единая политика
- Compile → `.claude/settings.json` permissions (real enforcement)
- Compile → CLAUDE.md security section (advisory layer)
- Agents без enforcement (OpenClaw) — только advisory
- Три режима: enforce / complain / disabled

### ADR-5: SysVinit Boot Sequence

**Решение:** Runlevels 0-6 для progressive context loading.

**Контекст:** Загрузка всего контекста при boot — wasteful. Нужен progressive disclosure.

**Следствия:**
- `init.d/00-identity.md` → `init.d/30-projects.md` — последовательная загрузка
- Semantic memory — всегда, rest — lazy
- ~10x token savings vs loading everything

### ADR-6: FHS Mapping

**Решение:** Vault directories маппятся на Linux FHS.

**Контекст:** Нужна понятная, стандартная метафора для структуры vault.

**Следствия:**
- `Inbox/` = `/tmp`, `Daily/` = `/var/log`, `.agentos/` = `/etc`
- Маппинг определён в `manifest.yaml → paths`
- Знакомо для инженеров, самодокументирующееся

## Implementation Patterns

### Pattern 1: Compiler Interface

Каждый agent driver реализует единый интерфейс:

```typescript
interface AgentCompiler {
  name: string;                    // 'claude' | 'openclaw' | 'cursor'
  compile(manifest: Manifest, context: CompileContext): CompileResult;
  supports(feature: string): boolean;
}
```

### Pattern 2: Ownership Model

Строгое разделение файлов по ownership:

| Owner | Files | Кто пишет |
|-------|-------|-----------|
| AgentFS (compiled) | CLAUDE.md, AGENT-MAP.md, .cursorrules | `agentfs compile` |
| AgentFS (kernel) | .agentos/**  | `agentfs init/compile/sync` |
| Agent runtime | .claude/sessions/, .omc/state/ | Agent itself |
| User | .claude/settings.json (native), vault content | User + Agent |

### Pattern 3: Idempotent Operations

Все операции AgentFS идемпотентны:
- `create-agentfs` на existing vault: creates missing, skips existing user files
- `compile`: always overwrites compiled outputs, never touches user-owned
- `security add`: merges module, doesn't duplicate

### Pattern 4: Template-Driven Output

Все compiled outputs через Handlebars:

```
templates/
├── compilers/
│   ├── claude.md.hbs          ← CLAUDE.md template
��   ├── soul.md.hbs            ← SOUL.md (OpenClaw)
│   ├── cursorrules.hbs        ← .cursorrules
│   └── agent-map.md.hbs       ← AGENT-MAP.md
├── manifest.yaml.hbs
├── init.d/
├── cron.d/
└── security-modules/
```

### Pattern 5: Merge Strategy for Bidirectional Sync

Memory sync (Phase 7-8):
- **Compile direction:** canonical (semantic.md) → native (.omc/project-memory.json)
- **Import direction:** native → canonical (new facts only, no delete)
- **Conflict resolution:** canonical wins, import creates new entries
- **Drift detection:** `agentfs sync` reports differences без auto-merge

## Project Structure & Boundaries

### Complete Project Directory Structure

```
create-agentfs/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── jest.config.js
├── README.md
├── CONTRIBUTING.md
├── CLAUDE.md
├── LICENSE
├── src/
│   ├── cli.ts                          ← main entry (prompts + orchestration)
│   ├── profiles/
│   │   ├── personal.ts                 ← personal profile generator
│   │   ├── company.ts                  ← company profile generator
│   │   └── shared.ts                   ← shared profile generator
│   ├── generators/
│   │   ├── filesystem.ts               ← create directory structure
│   │   ├── manifest.ts                 ← generate manifest.yaml
│   │   ├── init.ts                     ← generate init.d/ scripts
│   │   ├── cron.ts                     ← generate cron.d/ jobs
│   │   ├── memory.ts                   ← initialize memory system
│   │   ├── secrets.ts                  ← .gitignore, .agentignore, git-crypt
│   │   └── templates.ts               ← generate project/note templates
│   ├── compilers/
│   │   ├── base.ts                     ← abstract compiler interface
│   │   ├── claude.ts                   ← manifest → CLAUDE.md + .claude/skills/
│   │   ├── openclaw.ts                 ← manifest → .omc/ + MEMORY.md
│   │   ├── cursor.ts                   ← manifest → .cursorrules
│   │   ├── memory-sync.ts             ← bidirectional memory sync
│   │   └── security.ts                ← policy.yaml → native permissions
│   ├��─ security/
│   │   ├── policy-parser.ts            ← parse policy.yaml
│   │   ├── apparmor.ts                 ← generate per-agent AppArmor profiles
│   │   ├── secrets-manager.ts          ← SOPS/age integration
│   │   ├── exec-proxy.ts              ← agentfs exec --with-secrets
│   │   ├── regex-guard.ts             ← exfiltration pattern scanner
│   │   └── audit.ts                   ← violation logging
│   ├── modules/
│   │   ├── career.ts
│   │   ├── content.ts
│   │   ├── engineering.ts
│   │   ├── bmad.ts
│   │   └── clients.ts
│   ├── commands/
│   │   ├── compile.ts                  ← agentfs compile [agent] [--dry-run]
│   │   ├── import.ts                   ← agentfs import memory
│   │   ├── status.ts
│   │   ├── doctor.ts                   ← vault checks + agnix (385 rules)
│   │   ├── triage.ts
│   │   ├── migrate.ts
│   │   ├── memory.ts
│   │   ├── onboard.ts                  ← agent-led interview
│   │   ├── sync.ts                     ← bidirectional manifest ↔ compiled
│   │   ├── secrets.ts                  ← secret add|remove|list|rotate|inject
│   │   ├── security.ts                 ← security mode|audit|test|add|remove
│   │   └── exec.ts                     �� exec --with-secrets proxy
│   └── utils/
│       ├── frontmatter.ts
│       ├── naming.ts                   ��� kebab-case enforcement
│       └── fhs-mapping.ts             ← Linux FHS → vault path resolver
├── templates/
│   ├── compilers/
│   │   ├── claude.md.hbs
│   │   ├── soul.md.hbs
│   │   ├── cursorrules.hbs
│   │   └── agent-map.md.hbs
│   ├── manifest.yaml.hbs
│   ├── init.d/
│   ├── cron.d/
│   ├── security-modules/
│   │   ├── crypto.yaml
│   │   ├── web.yaml
│   │   ├── infra.yaml
│   │   ├── cloud.yaml
│   │   └── ci-cd.yaml
│   └── user-templates/
│       ├── project.md.hbs
│       ├── daily.md.hbs
│       ├── person.md.hbs
│       └── note.md.hbs
└── tests/
    ├── unit/
    │   ├── compilers/
    │   ├── generators/
    │   ├── security/
    │   └── utils/
    ├── integration/
    │   ├── compile-pipeline.test.ts
    │   ├── scaffold.test.ts
    │   └── memory-sync.test.ts
    └── fixtures/
        ├── sample-vault/
        └── sample-manifest.yaml
```

### Architectural Boundaries

**CLI Boundary:**
- `src/cli.ts` — е��инственный entry point
- Commands в `src/commands/` — каждый отдельный subcommand
- Все команды получают parsed args, возвращают exit code

**Compiler Boundary:**
- `src/compilers/base.ts` — abstract interface
- Каждый driver изолирован в своём файле
- Driver НЕ знает про другие drivers
- Input: Manifest + CompileContext → Output: файлы на disk

**Security Boundary:**
- `src/security/` — изолированный модуль
- policy-parser.ts → security model → apparmor.ts/regex-guard.ts
- Secrets manager NEVER exposes raw values to compile pipeline

**Generator Boundary:**
- `src/generators/` — scaffold-time, one-shot
- `src/compilers/` — compile-time, repeatable
- Generators и Compilers не зависят друг от друга

### Requirements to Structure Mapping

| FR | Directories |
|----|------------|
| FR-1 (Scaffolding) | src/cli.ts, src/profiles/, src/generators/ |
| FR-2 (Compile) | src/compilers/, templates/compilers/ |
| FR-3 (Memory) | src/generators/memory.ts, src/compilers/memory-sync.ts |
| FR-4 (Cron) | src/generators/cron.ts, templates/cron.d/ |
| FR-5 (Security) | src/security/, templates/security-modules/ |
| FR-6 (Secrets) | src/security/secrets-manager.ts, src/commands/secrets.ts |
| FR-7 (Sync) | src/commands/sync.ts, src/compilers/memory-sync.ts |
| FR-8 (Onboard) | src/commands/onboard.ts |
| FR-9 (Migration) | src/commands/migrate.ts |
| FR-10 (Doctor) | src/commands/doctor.ts |

## Validation

### Architecture Completeness Check

| Проверка | Статус |
|----------|--------|
| Все FR покрыты архитектурными компонентами | Да |
| Все NFR учтены в решениях | Да |
| Нет circular dependencies между modules | Да |
| Security boundary изолирован | Да |
| Extensibility: новый agent = новый driver | Да |
| Idempotency обеспечена паттернами | Да |
| Vault работает без AgentFS (no runtime) | Да |

### Risk Assessment

| Риск | Вероятность | Влияние | Mitigation |
|------|------------|---------|------------|
| Agent native format changes | Medium | High | Drivers isolated, template-based |
| Memory scaling (large vault) | Low | Medium | Progressive disclosure, lazy load |
| Security bypass through agent | Medium | High | Real enforcement via permissions.deny[] |
| Wikilink breakage at migration | High | Medium | Git branch strategy, atomic commits |
| OMC lacks enforcement API | Certain | Low | Advisory-only, documented limitation |
