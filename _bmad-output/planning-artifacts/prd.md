---
stepsCompleted: [init, discovery, vision, executive-summary, success, journeys, domain, innovation, project-type, scoping, functional, nonfunctional, polish, complete]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief.md
  - docs/architecture.md
  - docs/competitive-research.md
workflowType: 'prd'
title: "PRD: AgentFS"
status: draft
created: 2026-04-04
project: AgentFS
---

# Product Requirements Document — AgentFS

**Автор:** kksudo
**Дата:** 2026-04-04
**Версия:** 1.0

## Executive Summary

AgentFS — CLI-инструмент (`npx create-agentfs`), который разворачивает Obsidian vault (или любую markdown-директорию) как файловую операционную систему для AI-агентов. Ядро системы — скрытая директория `.agentos/`, выступающая единым source of truth для идентичности, памяти, безопасности и структуры. Compile pipeline транслирует canonical state в нативные форматы каждого поддерживаемого агента.

**Проблема:** AI-агенты (Claude Code, Cursor, OpenClaw) хранят конфиги в разных форматах. При работе с несколькими агентами — идентичность, правила и память дублируются. Нет персистентной памяти между сессиями. Нет security policy. Смена агента = начало с нуля.

**Решение:** Три слоя (как в Linux): User Space → Native Runtimes → Kernel Space. Один source of truth компилируется во все нативные форматы. Когнитивная модель памяти (Tulving), AppArmor-style security, SysVinit boot sequence.

**Целевая аудитория:** технические пользователи (инженеры, builders), использующие 2+ AI-агента на одном workspace.

**Scope:** MVP (Phase 2) — personal profile + compile.d/claude. Полный roadmap — 11 фаз до community publish.

## Классификация проекта

| Параметр | Значение |
|----------|----------|
| Тип | CLI tool / Developer framework |
| Домен | Developer tooling / AI agent infrastructure |
| Целевая платформа | Node.js (npx), macOS/Linux/Windows |
| Сложность | Level 3 (Complex, 12-40 stories) |
| Профиль пользователя | Intermediate-to-expert CLI users |
| Runtime dependencies | Node.js 18+, npm/npx |
| System dependencies (optional) | SOPS, age (для Phase 5-6) |

## Success Criteria

### Пользовательский успех

| Метрика | Цель | Как измеряем |
|---------|------|-------------|
| Time-to-working-vault | < 5 минут от `npx create-agentfs` | CLI timer в init |
| Vault portability | 100% — vault работает без AgentFS | Manual test: `cat`, `grep` достаточно |
| Agent switch time | < 1 минуту (`agentfs compile <agent>`) | CLI timer |
| Memory persistence | Факты сохраняются между сессиями | Integration test: write → restart → verify |
| Idempotent init | 0 перезаписанных user-файлов при повторном запуске | Automated test |

### Бизнес-успех

| Метрика | Цель | Timeline |
|---------|------|----------|
| npm weekly downloads | 100+ | Phase 2 launch + 4 weeks |
| npm weekly downloads | 500+ | Phase 11 (community) |
| GitHub stars | 50+ | Phase 2 launch + 8 weeks |
| Поддерживаемые агенты | 3+ (Claude, Cursor, OpenClaw) | Phase 8 |
| Community security modules | 5+ | Phase 11 |

### Технический ус��ех

| Метрика | Цель |
|---------|------|
| Token savings при boot (progressive disclosure) | ~10x vs loading all memory |
| Compile time (all agents) | < 2 секунды |
| Test coverage | > 80% |
| Zero data loss при compile | 100% — bidirectional sync без потерь |
| Security policy enforcement | Real deny rules в Claude Code permissions |

## User Journeys

### Journey 1: Первичная настройка (New Vault)

**Persona:** Инженер, начинающий новый vault для работы с AI-агентами.

```
1. npx create-agentfs
2. Interactive prompts: имя, профиль (personal), агенты (claude + cursor)
3. AgentFS создаёт структуру:
   - vault/ с FHS-mapped директориями
   - .agentos/ kernel space (manifest, init.d, memory, cron.d)
   - Compiled outputs: CLAUDE.md, .cursorrules, AGENT-MAP.md
4. Пользователь открывает vault в Obsidian — всё работает
5. Claude Code читает CLAUDE.md — знает структуру, правила, идентичность
```

### Journey 2: Миграция существующего vault

**Persona:** Пользователь с existing Obsidian vault (200+ файлов).

```
1. cd ~/notes && npx create-agentfs --migrate
2. AgentFS анализирует структуру: файлы, wikilinks, существующие агент-конфиги
3. Предлагает migration plan с маппингом директорий
4. Создаёт git branch "agentfs/migration"
5. Atomic commits: одна группа перемещений = один коммит
6. Wikilink fix: sed по маппингу
7. Пользователь проверяет в Obsidian → merge
```

### Journey 3: Смена агента

**Persona:** Пользователь переключается с Claude Code на Cursor.

```
1. agentfs compile cursor
2. .cursorrules генерируется из .agentos/ (identity, rules, paths)
3. Cursor читает .cursorrules — тот же контекст, что был у Claude
4. Memory, identity, rules — всё перенесено автоматически
```

### Journey 4: Агент-led onboarding

**Persona:** Новый пользователь AgentFS, не знающий что заполнять.

```
1. agentfs onboard
2. Агент задаёт вопросы: "Как тебя зовут?", "Какой стек?", "Какие предпочтения?"
3. Ответы → .agentos/init.d/00-identity.md + memory/semantic.md
4. agentfs compile → CLAUDE.md обновлён с identity
```

### Journey 5: Security hardening

**Persona:** Security-conscious инженер с секретами в проекте.

```
1. agentfs security mode enforce
2. policy.yaml → .claude/settings.json permissions.deny[]
3. Агент больше не может читать .env, *.key, credentials
4. agentfs security add crypto → domain-specific rules
5. agentfs security test → dry-run проверка
```

## Domain Model

### Ключевые сущности

```
Vault ──────────── единица работы (директория с markdown)
  ├── Kernel (.agentos/) ── source of truth
  │   ├── Manifest ── метаданные vault (profile, paths, agents)
  │   ├── InitScript ── boot-time instructions (runlevel 1-4)
  │   ├── Memory ── persistent agent state
  │   │   ├── SemanticMemory ── факты, preferences (always loaded)
  │   │   ├── EpisodicMemory ── timestamped events (lazy)
  │   │   └── ProceduralMemory ── learned skills (lazy)
  │   ├── CronJob ── scheduled tasks
  │   ├── SecurityPolicy ── access control rules
  │   └── CompileDriver ── per-agent translator
  ├── UserSpace ── human-readable vault directories
  └── NativeRuntime ── per-agent configs (.claude/, .cursor/, .omc/)
```

### Отношения

- **Vault** 1:1 **Manifest** — каждый vault имеет один manifest
- **Vault** 1:N **CompileDriver** — по одному на каждый поддерживаемый агент
- **CompileDriver** produces **NativeRuntime** — manifest → CLAUDE.md, .cursorrules, etc.
- **Memory** is source for **CompileDriver** — semantic.md → injected в compiled outputs
- **SecurityPolicy** enforced via **CompileDriver** — policy.yaml → native permissions
- **Manifest** defines **UserSpace** layout — paths mapping → directory creation

### Glossary

| Термин | Определение |
|--------|------------|
| Kernel Space | `.agentos/` — source of truth, не видим агенту напрямую |
| Native Runtime | `.claude/`, `.omc/`, `.cursor/` — нативные конфиги агента |
| Compile | Трансляция из kernel space в native runtime формат |
| Driver | Компилятор для конкретного агента (compile.d/claude/) |
| Boot Sequence | Порядок загрузки контекста при старте сессии (init.d/) |
| Progressive Disclosure | Загрузка только semantic memory при boot, rest — lazy |
| Consolidation | End-of-session memory snapshot (fast pass) |
| Distillation | Periodic deep analysis эпизодической памяти (каждые 2 дня) |
| AppArmor Profile | Security policy скомпилированная в native enforcement |

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **Cognitive Memory Model (Tulving's Taxonomy):** Впервые применяется для AI-агентов — semantic/episodic/procedural с confidence scoring и decay. Не ad-hoc key-value, а когнитивная наука.

2. **AppArmor for AI Agents:** Перенос концепции Mandatory Access Control из Linux security в мир AI-агентов. Реальный enforcement через native runtime permissions (не advisory text).

3. **Linux FHS Mapping:** Vault-как-OS — знакомая метафора для инженеров. `/tmp` → Inbox/, `/var/log` → Daily/, `/etc` → .agentos/.

4. **Compile Pipeline (Kernel → Drivers):** Архитектурная аналогия с Linux kernel + device drivers. Один source of truth → N нативных форматов.

### Конкурентный ландшафт

| Решение | Подход | Чем отличается AgentFS |
|---------|--------|----------------------|
| obsidian-copilot | Plugin внутри Obsidian, привязан к одному агенту | Agent-agnostic, работает без Obsidian |
| agent-os (buildermethods) | Standards injection | Нет compile pipeline, нет памяти |
| agnix | Linter для CLAUDE.md | Lint-only, не scaffold/compile |
| codex-vault | npx scaffold | Нет memory, security, multi-agent |

### Validation Approach

- MVP (Phase 2): validate compile pipeline с одним агентом (Claude)
- Phase 3: validate memory persistence и confidence scoring
- Phase 5: validate security enforcement через real deny rules

## Functional Requirements

### FR-1: CLI Scaffolding (`create-agentfs`)

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-1.1 | Interactive setup: имя vault, профиль, primary agent, supported agents | Must |
| FR-1.2 | Scaffold `.agentos/` kernel space (manifest, init.d, memory, cron.d, compile.d, security) | Must |
| FR-1.3 | Scaffold FHS-mapped user space directories | Must |
| FR-1.4 | Generate initial CLAUDE.md через compile pipeline | Must |
| FR-1.5 | Generate AGENT-MAP.md из manifest | Must |
| FR-1.6 | Idempotent: безопасно на существующем vault, не перезаписывает user files | Must |
| FR-1.7 | Profile selection: personal / company / shared | Must (personal MVP) |
| FR-1.8 | Module selection: career, content, engineering, bmad, clients | Should |
| FR-1.9 | `.gitignore` generation для runtime state | Must |
| FR-1.10 | `.agentignore` generation для soft deny | Should |

### FR-2: Compile Pipeline (`agentfs compile`)

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-2.1 | `agentfs compile` — all supported agents | Must |
| FR-2.2 | `agentfs compile claude` — only Claude outputs | Must |
| FR-2.3 | `agentfs compile --dry-run` — preview changes | Must |
| FR-2.4 | Compile: manifest + init.d + memory → CLAUDE.md | Must |
| FR-2.5 | Compile: policy.yaml → .claude/settings.json permissions | Should (Phase 5) |
| FR-2.6 | Compile: manifest → AGENT-MAP.md | Must |
| FR-2.7 | Never overwrite user-owned files (.claude/settings.json native sections) | Must |
| FR-2.8 | Handlebars templates for compiled outputs | Must |
| FR-2.9 | compile.d/openclaw — manifest → .omc/ | Could (Phase 8) |
| FR-2.10 | compile.d/cursor — manifest → .cursorrules | Could (Phase 8) |

### FR-3: Memory System

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-3.1 | Tulving taxonomy: semantic.md, episodic/, procedural/ | Must (Phase 3) |
| FR-3.2 | Semantic memory: PREF, FACT, PATTERN, AVOID format | Must (Phase 3) |
| FR-3.3 | Confidence scoring: new=0.3, confirmed +=0.2, denied -=0.3 | Should (Phase 3) |
| FR-3.4 | Decay: inactive 30 days → confidence -=0.1, <0.1 → superseded | Should (Phase 3) |
| FR-3.5 | Progressive disclosure: only semantic at boot, rest lazy | Must (Phase 3) |
| FR-3.6 | Immutable append: facts never deleted, only [superseded:{date}] | Must (Phase 3) |
| FR-3.7 | `agentfs memory show` — display semantic memory | Should (Phase 3) |
| FR-3.8 | `agentfs memory consolidate` — manual consolidation | Should (Phase 3) |

### FR-4: Cron Jobs

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-4.1 | memory-consolidation: on-session-end fast pass | Must (Phase 4) |
| FR-4.2 | distillation: batch analysis каждые 2 дня | Should (Phase 4) |
| FR-4.3 | inbox-triage: classify Inbox/ files | Could (Phase 4) |
| FR-4.4 | heartbeat: status update каждые 30 мин | Could (Phase 4) |

### FR-5: Security

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-5.1 | policy.yaml — unified security policy | Must (Phase 5) |
| FR-5.2 | File access control: allow_write, ask_write, deny_read, deny_write | Must (Phase 5) |
| FR-5.3 | Compile policy → .claude/settings.json permissions.deny[] | Must (Phase 5) |
| FR-5.4 | Input validation: prompt injection pattern scanning | Should (Phase 5) |
| FR-5.5 | Composable security modules (crypto, web, infra, cloud, ci-cd) | Should (Phase 5) |
| FR-5.6 | `agentfs security mode enforce\|complain\|disabled` | Must (Phase 5) |
| FR-5.7 | Exfiltration guard: regex patterns for API keys, tokens | Should (Phase 5) |

### FR-6: Secrets Management

| ID | Требование | Пр��оритет |
|----|-----------|-----------|
| FR-6.1 | SOPS/age encryption для secrets vault | Must (Phase 6) |
| FR-6.2 | Reference-only access: agent sees `${{secret:name}}`, not raw value | Must (Phase 6) |
| FR-6.3 | `agentfs exec --with-secrets` — runtime inject | Should (Phase 6) |
| FR-6.4 | `agentfs secret add\|remove\|list\|rotate` | Should (Phase 6) |

### FR-7: Sync & Import

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-7.1 | `agentfs import memory` — native → canonical memory sync | Must (Phase 7) |
| FR-7.2 | `agentfs sync` — bidirectional manifest ↔ compiled drift detection | Should (Phase 7) |
| FR-7.3 | Bidirectional memory sync for OpenClaw | Could (Phase 8) |

### FR-8: Onboarding

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-8.1 | `agentfs onboard` — agent-led interview → identity + memory | Must (Phase 2.5) |
| FR-8.2 | Interview → populate init.d/00-identity.md | Must (Phase 2.5) |
| FR-8.3 | Interview → populate memory/semantic.md | Must (Phase 2.5) |

### FR-9: Migration

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-9.1 | `agentfs migrate --source <path>` — analyze existing vault | Could (Phase 10) |
| FR-9.2 | Generate migration plan with wikilink analysis | Could (Phase 10) |
| FR-9.3 | Atomic git commits per migration group | Could (Phase 10) |

### FR-10: Doctor / Health Check

| ID | Требование | Приоритет |
|----|-----------|-----------|
| FR-10.1 | `agentfs doctor` — vault structure checks | Could (Phase 10) |
| FR-10.2 | agnix integration (385 lint rules) | Could (Phase 10) |
| FR-10.3 | Security scan: prompt injection patterns | Could (Phase 10) |

## Non-Functional Requirements

### NFR-1: Performance

| ID | Требование | Цель |
|----|-----------|------|
| NFR-1.1 | `create-agentfs` execution time | < 10 секунд |
| NFR-1.2 | `agentfs compile` (all agents) | < 2 секунды |
| NFR-1.3 | Boot context size (progressive disclosure) | ~10x reduction vs full load |

### NFR-2: Portability

| ID | Требование |
|----|-----------|
| NFR-2.1 | Vault readable без AgentFS (plain markdown + YAML) |
| NFR-2.2 | Vault usable без Obsidian (cat, grep достаточно) |
| NFR-2.3 | Cross-platform: macOS, Linux, Windows |
| NFR-2.4 | No runtime dependencies beyond Node.js 18+ |

### NFR-3: Safety

| ID | Требование |
|----|-----------|
| NFR-3.1 | Idempotent init: never overwrite user files |
| NFR-3.2 | Compile never modifies user-owned agent configs |
| NFR-3.3 | Migration via git branch — always rollback-safe |
| NFR-3.4 | No vendor lock-in: markdown + YAML only |

### NFR-4: Extensibility

| ID | Требование |
|----|-----------|
| NFR-4.1 | New agent support via compile.d/{agent}/ driver |
| NFR-4.2 | New modules via modules/ (career, content, etc.) |
| NFR-4.3 | Composable security modules |
| NFR-4.4 | Handlebars templates for all compiled outputs |

### NFR-5: Security

| ID | Требование |
|----|-----------|
| NFR-5.1 | Secrets never in plaintext in compiled outputs |
| NFR-5.2 | No secrets in git history |
| NFR-5.3 | Input validation against prompt injection |
| NFR-5.4 | Exfiltration pattern detection |

### NFR-6: Code Quality

| ID | Требование |
|----|-----------|
| NFR-6.1 | TypeScript strict mode |
| NFR-6.2 | Test coverage > 80% |
| NFR-6.3 | Naming: kebab-case files, camelCase vars, PascalCase classes |
| NFR-6.4 | Config: YAML (manifest, policy) + Markdown (init.d, memory) |

## Scope & Phasing

### Phase 2 (MVP) — В scope:
- `npx create-agentfs` с personal profile
- `.agentos/` kernel: manifest.yaml, init.d/, memory/ (semantic.md placeholder)
- `compile.d/claude` → CLAUDE.md + AGENT-MAP.md
- FHS directory scaffolding
- `.gitignore`, `.agentignore` generation
- Idempotent re-run

### Phase 2.5 — Onboard:
- `agentfs onboard` — agent-led interview

### Phase 3 — Memory:
- Tulving taxonomy (semantic/episodic/procedural)
- Confidence scoring + decay
- Progressive disclosure

### Phase 4 — Cron:
- memory-consolidation, distillation, inbox-triage

### Phase 5 — Security:
- policy.yaml + AppArmor profiles
- Input validation + composable modules

### Phase 6 — Secrets:
- SOPS/age + exec --with-secrets + regex guard

### Phase 7 — Sync:
- Bidirectional manifest ↔ compiled outputs

### Phase 8 — Multi-agent:
- compile.d/openclaw + compile.d/cursor
- Bidirectional memory sync

### Phase 9 — Profiles:
- Company + Shared profiles

### Phase 10 — Full CLI:
- doctor + agnix, triage, migrate, security audit

### Phase 11 — Community:
- npm publish, contributing guide, security module marketplace

## Open Questions

1. Нужен ли companion plugin для Obsidian (рендеринг `.agentos/proc/status.md`)?
2. Multi-agent mutex/lock mechanism или convention "один агент в один момент"?
3. Автоматический compile trigger (git hook, file watcher, manual only)?
4. Plugin system для community modules (`agentfs-module-{name}`)?
5. Нужен ли web UI для визуализации memory graph?
