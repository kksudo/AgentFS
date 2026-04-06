
# AgentFS: Architectural Design Document

> **Note:** This is the original design spec (in Russian). Some paths and command names may reference early prototypes (e.g. `.cursorrules` instead of `.cursor/rules/*.mdc`). For current implementation details, see [internals.md](internals.md).

> "Плохие программисты думают о коде. Хорошие программисты думают о структурах данных и их связях." — Linus Torvalds

> Задача: спроектировать CLI-инструмент `npx create-agentfs`, который разворачивает Obsidian vault как операционную систему для AI-агента. Файловая система — единственный интерфейс. Никаких баз данных. Никаких фреймворков.

---

## 0. Манифест

Пять правил, украденных у Unix и адаптированных под агентов:

1. **Всё есть файл.** Память, задачи, навыки, конфиги — markdown. Агент не ходит в базу данных. Он читает файлы. Точка.
2. **Делай одно и делай хорошо.** Каждый файл отвечает за одну вещь. `stack.md` — стек. `brief.md` — видение. Не мешай.
3. **Пиши программы так, чтобы они работали вместе.** Frontmatter — это API-контракт между человеком, агентом и Obsidian. Wikilinks — это pipes.
4. **Текст — универсальный интерфейс.** Markdown читается человеком, парсится агентом, рендерится Obsidian. Тройная совместимость.
5. **Избегай captive UI.** Vault работает без Obsidian, без конкретного агента, без облака. `cat` и `grep` достаточно.

---

## 1. Три слоя архитектуры

### Проблема: у каждого агента свои конфиги

В реальном vault уже живут нативные директории агентов:

| Директория | Владелец | Формат | Что хранит |
|-----------|----------|--------|------------|
| `.claude/` | Claude Code / Claudian | JSON + MD | settings, sessions, skills, commands |
| `.omc/` | OMC / OpenClaw | JSON | project-memory, sessions, state |
| `.cursor/` | Cursor | JSON | settings, rules |
| `.obsidian/` | Obsidian | JSON | plugins, themes, workspace |

Плюс файлы в корне: `CLAUDE.md` (Claude Code), `.cursorrules` (Cursor).

**Каждый агент читает ТОЛЬКО свой нативный формат.** Claude Code не знает про `.agentos/`. OpenClaw не будет парсить `manifest.yaml`. Это реальность, и архитектура обязана её уважать.

### Решение: три слоя как в реальном Linux

```
┌─────────────────────────────────────────────────┐
│               USER SPACE (vault/)               │
│   Человекочитаемые папки, заметки, контент      │
│   Obsidian видит и рендерит всё                 │
├─────────────────────────────────────────────────┤
│          NATIVE RUNTIMES (per-agent)            │
│   .claude/  .omc/  .cursor/  .obsidian/         │
│   Нативные конфиги — каждый агент читает своё   │
├─────────────────────────────────────────────────┤
│         KERNEL SPACE (.agentos/)                │
│   Source of truth → компилирует в native formats │
│   manifest.yaml, init.d/, memory/, cron.d/      │
└─────────────────────────────────────────────────┘
```

**Ключевая метафора: `.agentos/` — это не `/etc`, это ядро Linux.**
Ядро не заменяет драйверы (`.claude/`, `.omc/`) — оно предоставляет единый API, а драйверы транслируют его в формат конкретного устройства (агента).

### Почему три слоя, а не два:
- **User space** — человек работает здесь: красивые папки, Obsidian UI, graph view
- **Native runtimes** — каждый агент читает своё: Claude → `CLAUDE.md` + `.claude/`, OpenClaw → `.omc/`, Cursor → `.cursorrules`. Мы их **не трогаем** напрямую
- **Kernel space** — единый source of truth. Компилирует конфиги в нативные форматы через `agentfs compile`
- Obsidian не захламлён системными файлами (`.agentos/` в `.gitignore` по желанию)
- Можно поменять агента (Claude → OpenClaw → Cursor) — перекомпилировал, vault тот же

---

## 2. Kernel Space: `.agentos/`

Source of truth для всего vault. Аналог ядра Linux: хранит canonical state и компилирует его в нативные форматы агентов.

```
.agentos/
├── manifest.yaml              ← /etc/os-release — что это за vault
│
├── init.d/                    ← /etc/init.d — boot sequence (agent-agnostic)
│   ├── 00-identity.md         ← кто я, чей vault, роли
│   ├── 10-memory.md           ← загрузить memory (semantic on boot, rest lazy)
│   ├── 20-today.md            ← загрузить daily note + tasks
│   └── 30-projects.md         ← загрузить активные проекты
│
├── compile.d/                 ← /etc/alternatives — компиляторы per-agent
│   ├── claude/                ← драйвер для Claude Code / Cowork
│   │   ├── compiler.ts        ← manifest + init.d → CLAUDE.md
│   │   ├── template.md.hbs    ← Handlebars шаблон CLAUDE.md
│   │   ├── security.ts        ← policy.yaml → .claude/settings.json permissions
│   │   └── hooks.ts           ← синхронизация .claude/settings.json
│   ├── openclaw/              ← драйвер для OpenClaw / OMC
│   │   ├── compiler.ts        ← manifest + init.d → SOUL.md + .omc/
│   │   ├── soul.md.hbs        ← шаблон SOUL.md
│   │   └── memory-sync.ts     ← memory/ ↔ .omc/project-memory.json
│   └── cursor/                ← драйвер для Cursor
│       ├── compiler.ts        ← manifest → .cursorrules
│       └── template.hbs
│
├── security/                  ← AppArmor profiles + secrets vault
│   ├── policy.yaml            ← Mandatory Access Control rules
│   ├── profiles/              ← compiled per-agent profiles
│   │   ├── claude.apparmor
│   │   ├── openclaw.apparmor
│   │   └── cursor.apparmor
│   ├── audit/
│   │   └── violations.log
│   └── secrets/               ← encrypted secrets store
│       ├── vault.yaml         ← SOPS/age encrypted values (agent CANNOT read)
│       ├── refs.yaml          ← secret references (agent CAN read)
│       └── README.md
│
├── cron.d/                    ← /etc/cron.d — scheduled jobs
│   ├── heartbeat.md           ← каждые N минут — обновить status
│   ├── memory-consolidation.md ← в конце сессии — быстрый snapshot
│   ├── distillation.md        ← каждые 2 дня — глубокий batch analysis эпизодов
│   └── inbox-triage.md        ← при новых файлах в Inbox/ — классифицировать
│
├── proc/                      ← /proc — runtime state (ephemeral, gitignored)
│   ├── status.md              ← текущее состояние агента
│   ├── session.md             ← текущая сессия (что делаю, контекст)
│   ├── signals/               ← IPC через файлы (SIGHUP, SIGTERM, etc.)
│   └── locks/                 ← /var/lock — файловые блокировки
│
├── memory/                    ← /var/lib — persistent agent state (Tulving's taxonomy)
│   ├── semantic.md            ← декларативная: факты, предпочтения (context-free)
│   ├── episodic/              ← эпизодическая: timestamped события
│   │   └── YYYY-MM-DD.md      ← что случилось, что выучил, решения
│   ├── procedural/            ← процедурная: навыки, behavioral patterns
│   │   └── {skill-name}.md    ← как делать конкретную задачу
│   └── corrections.md         ← ошибки и исправления (feeds back into all three)
│
├── bin/                       ← /usr/local/bin — пользовательские скрипты агента
│   └── (агент кладёт сюда свои утилиты)
│
└── hooks/                     ← /etc/git/hooks аналог — lifecycle events
    ├── pre-commit.md          ← что проверить перед коммитом заметки
    ├── post-create.md         ← что сделать после создания файла
    └── on-boot.md             ← что выполнить при старте сессии
```

### Compile flow: как kernel space транслируется в native runtimes

```
                    ┌──────────────────┐
                    │  .agentos/       │
                    │  manifest.yaml   │
                    │  init.d/         │
                    │  memory/         │
                    │  security/       │
                    └────────┬─────────┘
                             │
                    agentfs compile
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
  compile.d/claude    compile.d/openclaw   compile.d/cursor
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌──────────────┐ ┌────────────────┐
│ CLAUDE.md       │ │ SOUL.md      │ │ .cursorrules   │
│ .claude/        │ │ MEMORY.md →  │ │ .cursor/       │
│   settings.json │ │   symlink    │ │   settings     │
│   skills/       │ │ .omc/        │ └────────────────┘
│     (generated) │ │   project-   │
└─────────────────┘ │   memory.json│
                    │   (synced)   │
                    └──────────────┘
         + AGENTS.md (vault router, generated from manifest)
```

**Правила compile:**

1. **`agentfs compile`** — читает `manifest.yaml` + `init.d/` + `memory/`, генерирует нативные конфиги
2. **Никогда не перезаписывает** пользовательские настройки агента (напр. `.claude/claudian-settings.json` — это пользовательское, не трогаем)
3. **Разделение ownership:**

| Файл/директория | Owner | Кто пишет | Кто читает |
|-----------------|-------|-----------|------------|
| `.agentos/manifest.yaml` | AgentFS | `agentfs init`, пользователь | `agentfs compile` |
| `.agentos/init.d/*.md` | AgentFS | `agentfs init`, пользователь | `agentfs compile` |
| `.agentos/memory/` | AgentFS | агенты (через consolidation) | `agentfs compile`, агенты |
| `CLAUDE.md` | AgentFS (compiled) | `agentfs compile` | Claude Code |
| `.claude/settings.json` | Claude Code | Claude Code, Claudian | Claude Code |
| `.claude/claudian-settings.json` | Пользователь | Claudian UI | Claudian |
| `.claude/skills/` | AgentFS (compiled) | `agentfs compile` | Claude Code |
| `.omc/project-memory.json` | AgentFS (synced) | `agentfs compile` | OMC / OpenClaw |
| `.omc/sessions/` | OMC | OMC runtime | OMC |
| `.omc/state/` | OMC | OMC runtime | OMC |
| `.cursorrules` | AgentFS (compiled) | `agentfs compile` | Cursor |
| `.cursor/` | Cursor | Cursor | Cursor |
| `AGENTS.md` | AgentFS (compiled) | `agentfs compile` | Любой агент (router) |

4. **Bidirectional sync для memory:** `.agentos/memory/semantic.md` — canonical source. При compile → пишет в `.omc/project-memory.json`. При import → читает из `.omc/project-memory.json` новые факты обратно в canonical. `agentfs sync` также отслеживает drift между compiled outputs (CLAUDE.md) и manifest — если CLAUDE.md отредактирован вручную, предлагает обновить manifest.

```bash
agentfs compile              # manifest → все нативные форматы
agentfs compile claude       # только Claude конфиги
agentfs compile openclaw     # только OpenClaw конфиги
agentfs compile --dry-run    # показать что изменится, не писать
agentfs import memory        # импорт памяти из нативных форматов в canonical
```

### `manifest.yaml` — сердце системы

```yaml
# .agentos/manifest.yaml
agentfs:
  version: "1.0.0"
  profile: personal              # personal | company | shared

vault:
  name: "{vault-name}"
  owner: "{your-name}"
  created: "2026-04-03"

agents:
  primary: claude                 # какой агент основной
  supported:
    - claude
    - openclaw

paths:                            # FHS → vault mapping (единый source of truth)
  tmp: "Inbox"                    # /tmp
  log: "Daily"                    # /var/log
  spool: "Tasks"                  # /var/spool
  home: "Projects"                # /home
  srv: "Content"                  # /srv (served content)
  usr_share: "Knowledge"          # /usr/share
  proc_people: "People"           # /proc (живые процессы = живые контакты)
  etc: ".agentos"                 # /etc
  archive: "Archive"              # /var/archive

boot:
  sequence:                       # порядок загрузки контекста (= init.d/ runlevels)
    - ".agentos/init.d/00-identity.md"    # runlevel 1: кто я
    - ".agentos/init.d/10-memory.md"      # runlevel 2: что помню
    - ".agentos/init.d/20-today.md"       # runlevel 3: сегодняшний день + задачи
    - ".agentos/init.d/30-projects.md"    # runlevel 4: активные проекты
  variables:
    today: "$(date +%F)"                  # подстановка текущей даты

frontmatter:
  required:                       # минимальные обязательные поля
    - date
    - tags
  standard:                       # рекомендуемые
    - status
    - stream
    - origin
```

---

## 3. User Space: Filesystem Layout

### 3.1. Personal Profile

Для одного человека: инженер, builder, content creator, job seeker.

```
vault/
├── Inbox/                       ← /tmp — единственная точка входа
│   └── {date}-{slug}.md
│
├── Daily/                       ← /var/log — ежедневный журнал
│   └── YYYY-MM-DD.md
│
├── Tasks/                       ← /var/spool — очереди задач
│   ├── priorities.md            ← Eisenhower matrix / текущий фокус
│   ├── backlog.md               ← всё остальное
│   └── content-pipeline.md      ← Dataview: статус публикаций
│
├── Projects/                    ← /home — активные проекты
│   ├── {project-name}/
│   │   ├── README.md            ← статус, цели, ссылки
│   │   ├── brief.md             ← BMAD Stage 0
│   │   ├── prd.md               ← BMAD Stage 1
│   │   ├── stack.md             ← технологии
│   │   ├── runbooks/            ← процедурная память
│   │   └── research/            ← материалы исследований
│   └── _template/               ← /etc/skel для проектов
│
├── Work/                        ← /home/contracts — клиентские проекты
│   └── {client-project}/
│
├── Career/                      ← /usr/local/career — job search pipeline
│   ├── cv/                      ← версии резюме
│   ├── companies/               ← research по компаниям
│   │   └── {company}.md
│   ├── vacancies/               ← активный pipeline
│   │   └── {company}-{role}/
│   │       ├── vacancy.md
│   │       ├── fit-analysis.md
│   │       └── prep-plan.md
│   └── interviews/              ← подготовка
│
├── Engineering/                 ← /home/{user} — профессиональная база
│   ├── Kubernetes/
│   ├── Platform/
│   ├── Cloud/
│   ├── DevOps/
│   └── AI-Ops/
│
├── Content/                     ← /srv — контент для публикации
│   ├── LinkedIn/
│   ├── Threads/
│   ├── Habr/
│   ├── Medium/
│   └── _ideas/                  ← backlog идей без платформы
│
├── Knowledge/                   ← /usr/share — знания вне проектов
│   ├── AI/
│   ├── Tools/
│   ├── Business/
│   └── Research/
│
├── People/                      ← /proc — живые контакты
│   └── {person}.md
│
├── Archive/                     ← /var/archive — завершённое
│   └── YYYY/
│
├── assets/                      ← /usr/share/media — медиафайлы
│   ├── brand/
│   ├── content/
│   ├── projects/
│   └── tmp/
│
├── .agentos/                    ← kernel space (source of truth)
├── .claude/                     ← native runtime: Claude Code (managed by Claude + AgentOS)
├── .omc/                        ← native runtime: OpenClaw OMC (managed by OMC + AgentOS)
├── .cursor/                     ← native runtime: Cursor (managed by Cursor + AgentOS)
├── .obsidian/                   ← Obsidian config (не трогаем)
├── CLAUDE.md                    ← compiled output ← agentfs compile claude
├── MEMORY.md                    ← compiled output ← agentfs compile openclaw (or symlink)
├── AGENT-MAP.md                 ← compiled output ← agentfs compile (vault router)
└── .cursorrules                 ← compiled output ← agentfs compile cursor
```

### 3.2. Company Profile

Для команды: shared knowledge base, RBAC через папки, onboarding path.

```
vault/
├── Inbox/                       ← общая точка входа
├── Daily/                       ← team standup log
├── Tasks/
│   ├── sprint.md                ← текущий спринт
│   └── backlog.md
│
├── Teams/                       ← /home — по командам
│   ├── {team-name}/
│   │   ├── README.md
│   │   ├── runbooks/
│   │   └── projects/
│   └── _onboarding/             ← /etc/skel для новых людей
│
├── Projects/                    ← активные проекты компании
│   └── {project}/               ← BMAD structure
│
├── Knowledge/                   ← shared knowledge base
│   ├── Architecture/
│   ├── Processes/
│   ├── Decisions/               ← ADR (Architecture Decision Records)
│   └── Postmortems/
│
├── People/                      ← org chart, контакты
├── Clients/                     ← /srv/clients
├── Archive/
├── assets/
└── .agentos/
    ├── manifest.yaml            ← profile: company
    ├── profile.d/
    ├── rbac/                    ← кто к чему имеет доступ
    │   ├── roles.yaml
    │   └── policies.yaml
    └── init.d/
```

### 3.3. Shared Profile

Для совместного использования: несколько людей + агенты.

```
vault/
├── Inbox/
├── Spaces/                      ← /home — per-user пространства
│   ├── {user-1}/
│   │   ├── Daily/
│   │   ├── Tasks/
│   │   └── Notes/
│   └── {user-2}/
│
├── Shared/                      ← /usr/share — общее
│   ├── Projects/
│   ├── Knowledge/
│   └── Templates/
│
├── .agentos/
│   ├── manifest.yaml            ← profile: shared
│   ├── users/                   ← /etc/passwd аналог
│   │   ├── {user-1}.yaml
│   │   └── {user-2}.yaml
│   └── profile.d/               ← per-user agent configs
│       ├── {user-1}/
│       │   └── claude.md
│       └── {user-2}/
│           └── openclaw.md
└── assets/
```

---

## 4. Boot Sequence — Init System

Агент при старте сессии проходит boot sequence. Аналог SysVinit runlevels:

```
Runlevel 0: HALT (агент выключен)
Runlevel 1: IDENTITY — загрузить кто я, чей vault
Runlevel 2: MEMORY — загрузить semantic memory (episodic + procedural lazy)
Runlevel 3: CONTEXT — загрузить сегодняшний день + задачи
Runlevel 4: PROJECTS — загрузить активные проекты (опционально)
Runlevel 5: FULL — интерактивная работа (все системы в строю)
Runlevel 6: SHUTDOWN — memory consolidation, save state
```

### Конкретная реализация:

**`init.d/00-identity.md`** — Runlevel 1
```markdown
# Agent Identity

## Owner
- Name: {your-name}
- Role: {your-role}
- Style: прямой, без воды, технический русский с английскими терминами

## Agent Rules
- Не повторяй очевидное
- Challenge мои решения если видишь слабые места
- Следуй vault conventions (frontmatter, naming, paths)

## Vault Paths (загрузить в контекст)
{автогенерация из manifest.yaml → paths}
```

**`init.d/10-memory.md`** — Runlevel 2
```markdown
# Memory Bootstrap (Tulving's taxonomy)

## Read on boot (progressive disclosure — ~10x token savings):
### Always load:
- .agentos/memory/semantic.md      ← факты + предпочтения (compact, context-free)
- .agentos/memory/corrections.md   ← мои прошлые ошибки

### Lazy load (по запросу):
- .agentos/memory/episodic/        ← загружать конкретный день при необходимости
- .agentos/memory/procedural/      ← загружать конкретный навык при необходимости

## Memory format (semantic.md):
Каждый факт — одна строка. Immutable append, superseded — не удаляются:
- PREF: предпочтения ("PREF: не использовать emoji в заголовках")
- FACT: [active] факты ("FACT: [active] CKA сертификация получена 2024")
- FACT: [superseded:2026-04-01] старые факты ("FACT: [superseded:2026-04-01] основной стек — AWS")
- PATTERN: [confidence:0.9] паттерны ("PATTERN: [confidence:0.9] утром продуктивнее")
- AVOID: что не делать ("AVOID: не предлагать LangChain")

## Confidence scoring:
- Новый PATTERN → confidence: 0.3
- Повторно подтверждён → confidence += 0.2 (max 1.0)
- Опровергнут → confidence -= 0.3
- Не подтверждён 30 дней → confidence -= 0.1 (decay)
- confidence < 0.1 → mark as superseded
```

**Runlevel 6 (shutdown)** — Memory Consolidation (быстрый)

На завершении сессии — fast pass:

```
1. Сканировать сессию на новые факты
2. Новый факт → append в semantic.md (PREF/FACT/PATTERN/AVOID)
3. Противоречие → mark old as [superseded:{date}], append new as [active]
4. Новый навык → создать/обновить procedural/{skill}.md
5. Записать эпизод → episodic/{date}.md
6. Ошибка агента → append в corrections.md
7. Обновить .agentos/proc/status.md
```

**Distillation (глубокий, каждые 2 дня)**

Batch processing по всем эпизодам с момента последней distillation:

```
1. Прочитать episodic/*.md за последние N дней
2. Кросс-сессионный анализ: повторяющиеся паттерны → повысить confidence
3. Противоречивые решения → создать AVOID или пометить PATTERN как superseded
4. Новые процедуры (>2 раза одинаковый workflow) → создать procedural/{name}.md
5. Deduplicate semantic.md
6. Записать лог distillation → episodic/{date}-distillation.md
```

---

## 5. Cron — Scheduled Jobs

### `cron.d/heartbeat.md`

```markdown
# Heartbeat
schedule: "*/30 * * * *"         # каждые 30 минут
agent: any
action:
  - Обновить .agentos/proc/status.md (uptime, текущая задача)
  - Проверить Inbox/ на новые файлы → уведомить если есть
  - Проверить overdue tasks в Tasks/
```

### `cron.d/memory-consolidation.md`

```markdown
# Memory Consolidation (Memory Agent) — fast pass
schedule: on-session-end
agent: any
action:
  - Сканировать сессию на новые факты
  - Извлечь PREF/FACT/PATTERN/AVOID → append в .agentos/memory/semantic.md
  - Противоречие → mark old as [superseded:{date}], append new as [active]
  - Новый навык → создать/обновить .agentos/memory/procedural/{skill}.md
  - Записать эпизод → .agentos/memory/episodic/{date}.md
  - Ошибка агента → append в .agentos/memory/corrections.md
  - Обновить .agentos/proc/status.md
```

### `cron.d/distillation.md`

```markdown
# Distillation — deep batch analysis
schedule: "0 3 */2 * *"         # каждые 2 дня, 3:00 AM
agent: any
trigger: manual | cron
input:
  - .agentos/memory/episodic/*.md (с момента последней distillation)
  - .agentos/memory/semantic.md (текущее состояние)
action:
  - Кросс-сессионный анализ: повторяющиеся паттерны → повысить confidence
  - Противоречивые решения → создать AVOID или пометить PATTERN как superseded
  - Новые процедуры (>2 раза одинаковый workflow) → создать procedural/{name}.md
  - Deduplicate semantic.md
  - Decay: PATTERN не подтверждён 30 дней → confidence -= 0.1
  - confidence < 0.1 → mark as superseded
output:
  - Обновлённые semantic.md, procedural/*.md
  - Лог distillation → episodic/{date}-distillation.md
format: JSONL лог с полями {timestamp, type, category, description, fix, lesson}
```

### `cron.d/inbox-triage.md`

```markdown
# Inbox Triage
schedule: on-demand | "0 9 * * *"  # утром или по запросу
agent: any
action:
  - Прочитать все файлы в Inbox/
  - Классифицировать по stream (из frontmatter)
  - Предложить целевую папку (НЕ перемещать автоматически)
  - Вывести список предложений пользователю
```

---

## 6. Signals — Agent Communication

Аналог Unix signals для управления агентом через файлы:

| Файл в `.agentos/proc/` | Аналог | Действие |
|--------------------------|--------|----------|
| `SIGHUP` | SIGHUP | Перечитать конфиги (manifest.yaml, profile.d/) |
| `SIGTERM` | SIGTERM | Graceful shutdown: consolidate memory, save state |
| `SIGUSR1` | SIGUSR1 | Dump текущего контекста в proc/session.md |
| `SIGPIPE` | SIGPIPE | Передать контекст другому агенту (handoff) |

Механика: создание файла `.agentos/proc/signals/SIGHUP` триггерит поведение. Агент проверяет signals/ при каждом цикле.

---

## 7. Frontmatter — Системный API

Frontmatter — это syscall interface между файлом и агентом. Стандартизация per-profile:

### Базовый (все профили)

```yaml
---
date: YYYY-MM-DD                  # обязательно
tags: []                          # обязательно
status: draft | active | done | archived
---
```

### Расширенный (personal profile)

```yaml
---
date: YYYY-MM-DD
tags: []
status: draft
stream: manual | automation | brainstorm | agent-session
origin: telegram | github | manual | agent/{name}
---
```

### Публикация (Digital Garden)

```yaml
---
dg-publish: true
dg-enable-search: true
dg-show-tags: true
dg-permalink: {area}/{slug}/
url: https://{domain}/{area}/{slug}/
title: ""
date: YYYY-MM-DD
status: published
tags: [public]
---
```

### Content (черновики)

```yaml
---
title: ""
date: YYYY-MM-DD
platform: linkedin | threads | habr | medium
status: draft | ready | posted
origin: "[[Knowledge/{area}/{slug}]]"
posted_url:
---
```

### BMAD (проектные документы)

```yaml
---
bmad_stage: brief | prd | spec | done
bmad_type: project | vacancy | content | research
status: draft | review | approved | done
owner: {user}
---
```

---

## 8. CLI: `npx create-agentfs`

### User Flow

```
$ npx create-agentfs

  ╔═══════════════════════════════════╗
  ║          AgentOS v1.0.0           ║
  ║   Your vault. Your agent. Your OS ║
  ╚═══════════════════════════════════╝

? Vault name: {vault-name}
? Profile: (Use arrow keys)
  ❯ Personal — solo engineer/creator/builder
    Company — team with shared knowledge
    Shared — multi-user collaborative vault

? Primary agent:
  ❯ Claude (Claude Code / Cowork)
    OpenClaw
    Both (recommended)
    Other (manual config)

? Your name: {your-name}
? Your role (short): {your-role}

? Enable modules: (check all that apply)
  ◉ Career — job search pipeline
  ◉ Content — publishing pipeline (LinkedIn, Habr, etc.)
  ◉ Engineering — professional knowledge base
  ◉ BMAD — project management framework
  ◯ Clients — client/contract management

? Digital Garden domain (optional): {your-domain}

Creating vault structure (profile: personal)...
  ✓ Created directories: Inbox/ Daily/ Tasks/ Projects/ Work/ Career/ Engineering/
                         Content/ Knowledge/ People/ Archive/ assets/
  ✓ Created modules: Career (cv/, companies/, vacancies/, interviews/)
                     Content (LinkedIn/, Threads/, Habr/, Medium/, _ideas/)
                     Engineering (Kubernetes/, Platform/, Cloud/, DevOps/, AI-Ops/)
  ✓ Generated .agentos/manifest.yaml
  ✓ Compiled .agentos/ → CLAUDE.md (artifact, see: agentfs compile claude)
  ✓ Compiled .agentos/ → MEMORY.md (artifact, see: agentfs compile openclaw)
  ✓ Generated .agentos/init.d/ (4 boot scripts: 00→10→20→30)
  ✓ Generated .agentos/cron.d/ (4 jobs: heartbeat, consolidation, distillation, triage)
  ✓ Generated .agentos/memory/ (semantic.md, episodic/, procedural/, corrections.md)
  ✓ Generated AGENTS.md (vault router — human & agent readable)
  ✓ Created project template in Projects/_template/
  ✓ Initialized git repository (.agentos/proc/ in .gitignore)

  Your AgentFS vault is ready.

  Next steps:
    cd {vault-name} && open -a Obsidian .
    Start your agent — it reads CLAUDE.md → boot sequence runs automatically

  Boot: 00-identity → 10-memory → 20-today → 30-projects
```

### CLI Commands (post-init)

```bash
# Управление vault
agentfs status                    # показать текущее состояние
agentfs doctor                    # проверить целостность vault
agentfs migrate                   # миграция из старой структуры

# Профили агентов
agentfs profile generate claude   # перегенерировать CLAUDE.md
agentfs profile generate openclaw # перегенерировать SOUL.md
agentfs profile list              # показать все agent profiles

# Memory
agentfs memory show               # показать semantic memory (facts, prefs, patterns)
agentfs memory consolidate        # ручной запуск consolidation
agentfs memory search "kubernetes" # поиск по памяти

# Inbox
agentfs triage                    # запустить inbox triage
agentfs triage --auto             # автоматическая классификация

# Modules
agentfs module add career         # добавить модуль
agentfs module remove clients     # убрать модуль
agentfs module list               # список активных модулей

# Onboard (agent-led interview → identity + memory)
agentfs onboard                   # запустить интервью: стек, роли, предпочтения
                                  # ответы → init.d/00-identity.md + memory/semantic.md
                                  # Phases: SCAFFOLD (create-agentfs) → PERSONALIZE (onboard) → COMPILE

# Sync (bidirectional manifest ↔ compiled outputs)
agentfs sync                      # если CLAUDE.md отредактирован вручную → diff → обновить manifest
agentfs sync --check              # показать drift (что разошлось) без изменений
agentfs sync --cross-vault ~/work-notes  # синхронизировать shared standards между vault-ами

# Security (AppArmor profiles)
agentfs security mode enforce     # enforce | complain | disabled
agentfs security audit            # показать violations.log
agentfs security test             # dry-run: проверить policy на конфликты
agentfs security add crypto       # добавить domain-specific security module
agentfs security add web          # модули: crypto, web, infra, cloud, ci-cd
agentfs security list             # показать активные security modules

# Secrets (reference-only vault)
agentfs secret add <name>         # добавить секрет
agentfs secret list               # показать refs (без значений)
agentfs secret rotate <name>      # обновить значение
agentfs exec --with-secrets "cmd" # выполнить команду с подстановкой секретов
```

---

## 9. Compile Pipeline — Как kernel транслируется в native

### Принцип: compile, don't symlink

Первая версия архитектуры использовала symlinks (`CLAUDE.md → .agentos/profile.d/claude.md`). Это было наивно. Проблемы:
- Claude Code ожидает конкретный формат CLAUDE.md, не произвольный markdown
- OpenClaw OMC хранит memory в JSON, не в markdown
- Symlinks ломаются при git clone на другой машине

**Правильный подход:** компиляция. `.agentos/` — source, нативные файлы — compiled artifacts.

### AGENTS.md — compiled markdown router

Помимо per-agent конфигов, `agentfs compile` генерирует `AGENTS.md` — человекочитаемый индекс всего vault.
Идея из [Agent-Scaffolding](https://github.com/DOWingard/Agent-Scaffolding): вместо того чтобы агент сканировал весь vault, дать ему один файл-маршрутизатор.

**Input:** `manifest.yaml` (paths, modules, boot sequence)
**Output:** `AGENTS.md` (корень vault)

```markdown
# Agent Map — Auto-generated by agentfs compile
# Не редактировать вручную. Source: .agentos/manifest.yaml

## Vault Structure
| Path | FHS | Purpose |
|------|-----|---------|
| Inbox/ | /tmp | Единственная точка входа для новых заметок |
| Daily/ | /var/log | Ежедневные журналы |
| Tasks/ | /var/spool | Очереди задач, приоритеты |
| Projects/ | /home | Активные проекты (BMAD) |
| Work/ | /home/contracts | Клиентские проекты |
| Career/ | /usr/local/career | Job search pipeline |
| Engineering/ | /home/{user} | Профессиональная база знаний |
| Content/ | /srv | Контент для публикации |
| Knowledge/ | /usr/share | Знания вне проектов |
| People/ | /proc | Активные контакты |
| Archive/ | /var/archive | Завершённое |

## Boot Sequence
1. `.agentos/init.d/00-identity.md` → кто я
2. `.agentos/init.d/10-memory.md` → что помню (lazy load)
3. `.agentos/init.d/20-today.md` → сегодня + задачи
4. `.agentos/init.d/30-projects.md` → активные проекты

## Active Modules
career, content, engineering, bmad

## Memory
- Semantic: `.agentos/memory/semantic.md` (always loaded)
- Episodic: `.agentos/memory/episodic/` (lazy, by date)
- Procedural: `.agentos/memory/procedural/` (lazy, by skill)
```

Это дополнение к CLAUDE.md, не замена. AGENT-MAP.md полезен как fallback для агентов, которые не умеют парсить YAML (или вообще не поддерживают нативную конфигурацию).

---

### Claude Code: `compile.d/claude/`

**Input:** `manifest.yaml` + `init.d/*.md` + `memory/semantic.md` + `memory/corrections.md` + active modules
**Output:** `CLAUDE.md` (корень vault) + `.claude/skills/` (generated skills)

Компилятор собирает CLAUDE.md из кусков:
```
init.d/00-identity.md     → "# Vault Rules" секция
manifest.yaml → paths     → "## Структура папок" секция
frontmatter standards     → "## Frontmatter" секция
module: career            → "## Career Pipeline" секция
module: content           → "## Content Pipeline" секция
memory/corrections.md     → "## Known Issues" секция (чего не делать)
```

**Что НЕ трогаем:** `.claude/settings.json`, `.claude/claudian-settings.json`, `.claude/sessions/` — это ownership Claude Code и пользователя.

### OpenClaw: `compile.d/openclaw/`

**Input:** `manifest.yaml` + `init.d/00-identity.md` + `memory/`
**Output:** обновлённый `.omc/project-memory.json` (merge, не overwrite)

Особенности:
- `.omc/project-memory.json` — JSON, не markdown. Компилятор транслирует формат.
- Memory sync двунаправленный: `agentfs compile openclaw` пишет canonical → `.omc/`, а `agentfs import memory` читает `.omc/` → canonical.
- `.omc/sessions/` и `.omc/state/` — runtime данные OMC, не трогаем.

### Cursor: `compile.d/cursor/`

**Input:** `manifest.yaml` + `init.d/00-identity.md`
**Output:** `.cursorrules` (корень vault)

Самый простой компилятор — генерирует текстовый файл с правилами из identity + paths.

---

## 10. Package Architecture

```
create-agentfs/
├── package.json
├── src/
│   ├── cli.ts                    ← main entry (prompts + orchestration)
│   ├── profiles/
│   │   ├── personal.ts           ← personal profile generator
│   │   ├── company.ts            ← company profile generator
│   │   └── shared.ts             ← shared profile generator
│   ├── generators/
│   │   ├── filesystem.ts         ← create directory structure
│   │   ├── manifest.ts           ← generate manifest.yaml
│   │   ├── init.ts               ← generate init.d/ scripts
│   │   ├── cron.ts               ← generate cron.d/ jobs
│   │   ├── memory.ts             ← initialize memory system
│   │   ├── secrets.ts            ← .gitignore, .agentignore, git-crypt setup
│   │   └── templates.ts          ← generate project/note templates
│   ├── compilers/                ← compile.d/ implementations
│   │   ├── base.ts               ← abstract compiler interface
│   │   ├── claude.ts             ← manifest → CLAUDE.md + .claude/skills/
│   │   ├── openclaw.ts           ← manifest → .omc/ + MEMORY.md
│   │   ├── cursor.ts             ← manifest → .cursorrules
│   │   ├── memory-sync.ts        ← bidirectional memory sync
│   │   └── security.ts           ← policy.yaml → native permissions + regex guard
│   ├── security/                 ← security subsystem
│   │   ├── policy-parser.ts      ← parse policy.yaml
│   │   ├── apparmor.ts           ← generate per-agent AppArmor profiles
│   │   ├── secrets-manager.ts    ← SOPS/age integration
│   │   ├── exec-proxy.ts         ← agentfs exec --with-secrets runtime
│   │   ├── regex-guard.ts        ← exfiltration pattern scanner
│   │   └── audit.ts              ← violation logging
│   ├── modules/                  ← optional modules
│   │   ├── career.ts
│   │   ├── content.ts
│   │   ├── engineering.ts
│   │   ├── bmad.ts
│   │   └── clients.ts
│   ├── commands/                 ← post-init CLI commands
│   │   ├── compile.ts            ← agentfs compile [agent] [--dry-run]
│   │   ├── import.ts             ← agentfs import memory
│   │   ├── status.ts
│   │   ├── doctor.ts             ← vault checks + agnix integration (385 lint rules)
│   │   ├── triage.ts
│   │   ├── migrate.ts
│   │   ├── memory.ts
│   │   ├── onboard.ts            ← agentfs onboard (agent-led interview)
│   │   ├── sync.ts               ← agentfs sync (bidirectional manifest ↔ compiled)
│   │   ├── secrets.ts            ← agentfs secret add|remove|list|rotate|inject
│   │   ├── security.ts           ← agentfs security mode|audit|test|add|remove|list
│   │   └── exec.ts               ← agentfs exec --with-secrets (proxy)
│   └── utils/
│       ├── frontmatter.ts
│       ├── naming.ts             ← kebab-case enforcement
│       └── fhs-mapping.ts        ← Linux FHS → vault path resolver
├── templates/                    ← Handlebars/EJS templates
│   ├── compilers/
│   │   ├── claude.md.hbs         ← шаблон CLAUDE.md
│   │   ├── soul.md.hbs           ← шаблон SOUL.md (OpenClaw)
│   │   ├── cursorrules.hbs       ← шаблон .cursorrules
│   │   └── agent-map.md.hbs      ← шаблон AGENT-MAP.md
│   ├── manifest.yaml.hbs
│   ├── init.d/
│   ├── cron.d/
│   ├── security-modules/         ← встроенные domain-specific security modules
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
```

### Dependencies — ключевые

| Dependency | Зачем | Как используется |
|-----------|-------|-----------------|
| `agnix` | 385 правил валидации для CLAUDE.md, AGENTS.md, SKILL.md, hooks | `agentfs doctor` = наши vault-проверки + `agnix lint` |
| `js-yaml` | Парсинг manifest.yaml, policy.yaml | Все компиляторы |
| `handlebars` | Шаблонизация compiled outputs | compile.d/ |
| `sops` (system) | Шифрование secrets vault | Level 4-5 security |
| `age` (system) | Ключи для SOPS | Level 4-5 security |

**agnix интеграция** (от [agent-sh/agnix](https://github.com/agent-sh/agnix)):
- НЕ форкаем — используем как npm dependency
- `agentfs doctor` запускает три набора проверок:
  1. **vault:** structure, frontmatter compliance, memory consistency, FHS mapping
  2. **agnix:** agent config validation (CLAUDE.md format, hooks syntax, skills structure) — 385 правил
  3. **security:** input_validation patterns по всему vault (prompt injection scan)
- В CI: `agentfs doctor` на каждый commit (включает все три набора)

---

## 11. FHS Mapping — Полная таблица

| Linux FHS | AgentOS Path | Семантика | Содержимое |
|-----------|-------------|-----------|------------|
| `/tmp` | `Inbox/` | Временное хранилище, единственная точка входа | Новые заметки, captures |
| `/var/log` | `Daily/` | Хронологические журналы | Daily notes |
| `/var/spool` | `Tasks/` | Очереди задач | Приоритеты, backlog, pipeline |
| `/home` | `Projects/` | Пользовательские рабочие пространства | Активные проекты (BMAD) |
| `/home/contracts` | `Work/` | Контрактная работа | Клиентские проекты |
| `/usr/local/career` | `Career/` | Специализированные утилиты пользователя | Job search pipeline |
| `/home/{user}` | `Engineering/` | Домашняя директория — экспертиза | Профессиональная база знаний (Kubernetes/, Platform/, Cloud/, DevOps/, AI-Ops/) |
| `/srv` | `Content/` | Контент для раздачи (serving) | Черновики, опубликованное |
| `/usr/share` | `Knowledge/` | Разделяемые ресурсы | Знания вне проектов |
| `/proc` | `People/` | Живые процессы | Активные контакты |
| `/var/archive` | `Archive/` | Архивные данные | Завершённые проекты, старые заметки |
| `/etc` | `.agentos/` | Системная конфигурация | Конфиги, boot, cron, memory |
| `/usr/share/media` | `assets/` | Медиаресурсы | Изображения, файлы |
| `/etc/init.d` | `.agentos/init.d/` | Boot scripts | Скрипты инициализации |
| `/etc/cron.d` | `.agentos/cron.d/` | Scheduled jobs | Heartbeat, consolidation, distillation, triage |
| `/proc` | `.agentos/proc/` | Runtime state | Статус, сессии, locks |
| `/var/lib` | `.agentos/memory/` | Persistent state | Semantic, episodic, procedural memory |

---

## 12. Naming Conventions

Единые правила для всех профилей:

```
Файлы:     kebab-case.md           ← всегда lowercase, дефисы
Daily:     YYYY-MM-DD.md           ← единственное исключение
Папки:     PascalCase/             ← для user space (Obsidian convention)
           lowercase/              ← для kernel space (.agentos/)
Assets:    kebab-case.ext          ← описательные имена, без пробелов
Templates: {type}.md.hbs           ← Handlebars templates для генерации
```

**Запрещено:** пробелы в именах, суффиксы платформ (`-linkedin`), даты в именах файлов (кроме daily), `image1.png`, `Screenshot...`, `IMG_`.

---

## 13. Принципы, которые НЕ нарушаем

1. **Vault работает без агента.** Человек может открыть его в любом текстовом редакторе и понять структуру.
2. **Vault работает без Obsidian.** Это просто папка с markdown. `find`, `grep`, `cat` — достаточно.
3. **Агент заменяем.** Поменял Claude на OpenClaw — перегенерировал profile, vault тот же.
4. **Нет vendor lock-in.** Никаких проприетарных форматов. Markdown + YAML + symlinks.
5. **Идемпотентность.** `npx create-agentfs` на существующий vault — безопасно. Не перезаписывает пользовательские файлы, только обновляет `.agentos/`.
6. **Progressive disclosure.** Минимальная структура работает из коробки. Модули добавляют сложность по мере необходимости.

---

## 14. Migration Strategy

### Реальный анализ текущего vault (~/notes/)

**Масштаб:** 209 md-файлов, всё в git (автобэкап каждые 10 мин).

**Obsidian wikilinks:** дефолт (shortest path = `[[filename]]`), НО 155 ссылок с путями (`[[Path/file]]`) в 43 файлах. Из них ~76 сломаются при перемещениях.

#### Маппинг перемещений

| Откуда | Куда | Файлов | Wikilinks ломается | Файлов затронуто |
|--------|------|--------|-------------------|-----------------|
| `Drafts/LinkedIn/` | `Content/LinkedIn/` | 15 | 27 | 9 |
| `Drafts/Threads/` | `Content/Threads/` | 7 | (в составе 27) | (в составе 9) |
| `Drafts/Habr/` | `Content/Habr/` | 4 | (в составе 27) | (в составе 9) |
| `Drafts/Medium/` | `Content/Medium/` | 3 | (в составе 27) | (в составе 9) |
| `Projects/Jobs/` | `Career/` | 5 | ~20 | ~8 |
| `Projects/Work/` | `Work/` | 5 | ~8 | ~4 |
| `Projects/RnD/` | `Knowledge/Research/` | 5 | ~16 | ~6 |
| `Projects/Freelance/` | `Work/Freelance/` | 2 | ~5 | ~3 |
| **Не двигаем** | | | | |
| `Knowledge/` | остаётся | 30 | 0 | 0 |
| `Daily/` | остаётся | 12 | 0 | 0 |
| `Inbox/` | остаётся | 22 | 0 | 0 |
| `Tasks/` | остаётся | 5 | 0 | 0 |
| `People/` | остаётся | 1 | 0 | 0 |

**Hotspot-файлы** (больше всего ссылок на починку):
- `Tasks/EisenhowerTasks.md` — 50 wikilinks с путями (крупнейший)
- `index.md` — 17 ссылок
- `Tasks/sprint-week-13.md` — 17 ссылок
- `Daily/2026-03-22.md` — 14 ссылок

#### Что создаём с нуля

```
Career/                 ← новая директория (+ cv/, companies/, vacancies/, interviews/)
Content/_ideas/         ← backlog идей без платформы
Engineering/            ← Kubernetes/, Platform/, Cloud/, DevOps/, AI-Ops/
Archive/                ← для завершённых проектов
Work/                   ← top-level (вместо Projects/Work/)
.agentos/               ← полный kernel space
```

#### Что НЕ трогаем

```
Knowledge/              ← остаётся как есть (47 ссылок сюда — не ломаем)
_templates/             ← остаётся (Obsidian Templater зависит от пути)
copilot/                ← Obsidian Copilot data
.obsidian/              ← Obsidian config
assets/                 ← медиафайлы
scripts/                ← automation scripts (не vault content)
```

### Стратегия: git branch + atomic migration

**Почему git — это суперсила:**
- Rollback за секунду (`git checkout main`)
- Review diff перед merge
- `git mv` сохраняет историю файлов
- Можно мигрировать по шагам с коммитом на каждый шаг

**Подход A: git mv + sed (рекомендуемый)**

```bash
# 0. Snapshot
git checkout -b agentos/migration

# 1. Создать новые директории
mkdir -p Career/{cv,companies,vacancies,interviews}
mkdir -p Content/_ideas Engineering/{Kubernetes,Platform,Cloud,DevOps,AI-Ops}
mkdir -p Archive Work .agentos/{init.d,compile.d,security,cron.d,proc,memory/{episodic,procedural},hooks,bin}

# 2. Перемещения (по одному коммиту на группу)
git mv Drafts/LinkedIn Content/LinkedIn
git mv Drafts/Threads Content/Threads
git mv Drafts/Habr Content/Habr
git mv Drafts/Medium Content/Medium
git commit -m "migrate: Drafts/ → Content/"

git mv Projects/Jobs/* Career/
git commit -m "migrate: Projects/Jobs/ → Career/"

git mv Projects/Work/* Work/
git commit -m "migrate: Projects/Work/ → Work/"

git mv Projects/RnD Knowledge/Research
git commit -m "migrate: Projects/RnD/ → Knowledge/Research/"

git mv Projects/Freelance Work/Freelance
git commit -m "migrate: Projects/Freelance/ → Work/Freelance/"

# 3. Fix wikilinks (sed per mapping)
# Drafts/ → Content/
find . -name "*.md" -exec sed -i '' 's|\[\[Drafts/|\[\[Content/|g' {} +
git commit -m "fix: relink wikilinks Drafts/ → Content/"

# Projects/Jobs/ → Career/
find . -name "*.md" -exec sed -i '' 's|\[\[Projects/Jobs/|\[\[Career/|g' {} +
git commit -m "fix: relink wikilinks Projects/Jobs/ → Career/"

# Projects/Work/ → Work/
find . -name "*.md" -exec sed -i '' 's|\[\[Projects/Work/|\[\[Work/|g' {} +
git commit -m "fix: relink wikilinks Projects/Work/ → Work/"

# Projects/RnD/ → Knowledge/Research/
find . -name "*.md" -exec sed -i '' 's|\[\[Projects/RnD/|\[\[Knowledge/Research/|g' {} +
git commit -m "fix: relink wikilinks Projects/RnD/ → Knowledge/Research/"

# Projects/Freelance/ → Work/Freelance/
find . -name "*.md" -exec sed -i '' 's|\[\[Projects/Freelance/|\[\[Work/Freelance/|g' {} +
git commit -m "fix: relink wikilinks Projects/Freelance/ → Work/Freelance/"

# 4. Frontmatter origin field fix (Drafts → Content references)
find . -name "*.md" -exec sed -i '' 's|origin: "Drafts/|origin: "Content/|g' {} +
git commit -m "fix: frontmatter origin Drafts/ → Content/"

# 5. Verify
grep -r '\[\[Drafts/' --include="*.md" .       # should be 0
grep -r '\[\[Projects/Jobs/' --include="*.md" . # should be 0
grep -r '\[\[Projects/Work/' --include="*.md" . # should be 0
grep -r '\[\[Projects/RnD/' --include="*.md" .  # should be 0

# 6. Open Obsidian, verify graph view, check broken links
# 7. If ok → git checkout main && git merge agentos/migration
```

**Подход B: Obsidian UI (альтернатива)**

Drag-and-drop папок в Obsidian — он автоматически обновляет wikilinks. Подходит если хочется zero-script подход, но нет атомарного коммита и нельзя review diff.

### Порядок миграции (приоритет)

```
Phase 1: git branch + mkdir (новые директории)       ← 5 минут
Phase 2: git mv Drafts → Content                     ← самый простой, 0 конфликтов
Phase 3: git mv Projects/Jobs → Career               ← атомарно
Phase 4: git mv Projects/Work → Work                 ← атомарно
Phase 5: git mv Projects/RnD → Knowledge/Research    ← обсудить: move или оставить?
Phase 6: sed fix wikilinks                           ← batch, один проход
Phase 7: verify в Obsidian                           ← ручная проверка graph view
Phase 8: .agentos/ skeleton (manifest.yaml, init.d/) ← после structure migration
Phase 9: merge в main                                ← только после полной проверки
```

### Правила миграции

1. **Никогда не удалять файлы.** Только перемещать и создавать.
2. **Один коммит на одну группу перемещений.** Для чистого rollback.
3. **Отдельный коммит на sed fix.** Чтобы можно было review diff.
4. **Verify перед merge.** Открыть Obsidian, проверить graph view и broken links.
5. **`_templates/` не трогаем.** Templater зависит от пути к шаблонам в .obsidian config.

### agentfs migrate (CLI — будущая автоматизация)

```bash
$ agentfs migrate --source ~/notes --profile personal

Analyzing current structure...
  Found: 209 files in Inbox/, Daily/, Tasks/, Projects/, Knowledge/, People/, Drafts/
  Found: 155 wikilinks with paths in 43 files
  Found: git repository (clean state: yes)

Migration plan:
  [move]   Drafts/         → Content/          (29 files, 27 wikilinks to fix)
  [move]   Projects/Jobs/  → Career/           (5 files, ~20 wikilinks to fix)
  [move]   Projects/Work/  → Work/             (5 files, ~8 wikilinks to fix)
  [move]   Projects/RnD/   → Knowledge/Research/ (5 files, ~16 wikilinks to fix)
  [move]   Projects/Freelance/ → Work/Freelance/ (2 files, ~5 wikilinks to fix)
  [create] Career/{cv,companies,vacancies,interviews}/
  [create] Content/_ideas/
  [create] Engineering/{Kubernetes,Platform,Cloud,DevOps,AI-Ops}/
  [create] Archive/
  [create] .agentos/ (full kernel space)
  [skip]   _templates/ (Obsidian dependency)
  [skip]   copilot/ (plugin data)
  [skip]   scripts/ (not vault content)
  [skip]   tmp/ (duplicate of Inbox/)

Strategy: git branch "agentos/migration" → atomic commits → verify → merge
  Total wikilinks to fix: ~76 in ~21 files

Proceed? [y/N]
```

---

## 15. Security Model — AppArmor для агентов

### Проблема: три вектора утечки

Агент может слить данные тремя способами:

```
1. READ    — прочитать файл с секретом (токен, пароль, ключ)
2. LEAK    — отправить прочитанное в LLM cloud (контекст → API → логи провайдера)
3. EXFIL   — вставить секрет в HTTP-запрос, email, публичный файл
```

Текущая реальность: агент имеет доступ ко ВСЕМУ в vault. Если в `Projects/{project-a}/runbooks/deploy.md` лежит API-ключ — Claude Code прочитает его, отправит в Anthropic API как часть контекста, и потенциально вставит в ответ. Три вектора за одну операцию.

### Реальные enforcement механизмы (что уже есть)

Исследование нативных runtime показало:

| Runtime | Механизм | Что делает | Статус в vault |
|---------|----------|-----------|----------------|
| Claude Code | `permissions.deny[]` в `.claude/settings.json` | Блокирует чтение файлов по path-pattern | **Пустой** (не настроен) |
| Claude Code | `permissions.ask[]` | Спрашивает пользователя перед доступом | **Пустой** |
| Claudian | `blockedCommands` | Блокирует shell-команды по паттерну | Настроен (rm -rf, chmod 777) |
| Claudian | `allowedExportPaths` | Whitelist путей для экспорта файлов | `~/Desktop`, `~/Downloads` |
| Claudian | `allowExternalAccess` | Блокирует внешний доступ | `false` |
| Claudian | `permissionMode` | Уровень строгости | `"yolo"` (максимально открыт) |
| OMC | — | Никаких механизмов | N/A |
| Cursor | — | Не сконфигурирован | N/A |

**Вывод:** Claude Code имеет path-based deny — прямой аналог AppArmor. Но сейчас он не используется. `compile.d/claude` должен генерировать реальные deny-правила.

### Архитектура: 5 уровней защиты (Defense in Depth)

```
┌───────────────────────────────────────────────┐
│  Level 5: ENCRYPTION AT REST                  │
│  git-crypt / age — файлы зашифрованы на диске │
├───────────────────────────────────────────────┤
│  Level 4: SECRETS VAULT (reference-only)      │
│  Агент НИКОГДА не видит raw values            │
│  Только ${{secret:name}} → runtime resolve    │
├───────────────────────────────────────────────┤
│  Level 3: APPARMOR PROFILES (real enforcement)│
│  .claude/settings.json → permissions.deny     │
│  Claudian → blockedCommands, permissionMode   │
├───────────────────────────────────────────────┤
│  Level 2: AGENT POLICY (advisory + compiled)  │
│  CLAUDE.md → "## Security Policy" section     │
│  .agentignore → soft deny list                │
├───────────────────────────────────────────────┤
│  Level 1: GIT HYGIENE                         │
│  .gitignore → не коммитить runtime state      │
└───────────────────────────────────────────────┘
```

---

### Level 1: Git Hygiene

```gitignore
# .gitignore (генерируется agentos init)

# Runtime state — никогда не коммитить
.agentos/proc/
.agentos/secrets/decrypted/
.claude/sessions/
.omc/sessions/
.omc/state/
```

---

### Level 2: Agent Policy (.agentignore + compiled rules)

`.agentignore` — аналог `.dockerignore`. Soft deny: convention, не enforcement. Но `agentfs compile` вставляет его в CLAUDE.md как жёсткие инструкции.

```gitignore
# .agentignore

# Секреты — НИКОГДА не читать напрямую
.agentos/secrets/
Projects/**/.env
Projects/**/secrets/
Projects/**/*.key
Projects/**/*.pem
**/*credentials*
**/*token*

# PII
People/**/private-notes.md
Career/cv/*-full.md

# Чужие runtime
.claude/sessions/
.omc/sessions/
```

При compile → вставляется в CLAUDE.md как:

```markdown
## Security Policy — ОБЯЗАТЕЛЬНО
ЗАПРЕЩЕНО читать файлы, совпадающие с паттернами:
- .agentos/secrets/**, Projects/**/.env, **/*credentials*, **/*token*
Если нужен секрет — используй `agentfs secret get <name>`, НЕ читай файл напрямую.
ЗАПРЕЩЕНО включать секреты (токены, ключи, пароли) в:
- ответы пользователю
- HTTP-запросы
- файлы в Content/, Knowledge/ (публичные)
- git commit messages
```

---

### Level 3: AppArmor Profiles (реальный enforcement)

Ключевая новая абстракция. Каждый агент получает security profile в `.agentos/security/`:

```
.agentos/security/
├── policy.yaml              ← единая security policy (source of truth)
├── profiles/
│   ├── claude.apparmor      ← компилируется → .claude/settings.json permissions
│   ├── openclaw.apparmor    ← компилируется → advisory (OMC не поддерживает enforce)
│   └── cursor.apparmor      ← компилируется → .cursorrules security section
└── audit/
    └── violations.log       ← лог нарушений политики
```

#### `policy.yaml` — единая политика

```yaml
# .agentos/security/policy.yaml
#
# AppArmor-style Mandatory Access Control для AI-агентов
# Формат вдохновлён AppArmor profile syntax

version: "1.0"
default_mode: enforce            # enforce | complain | disabled

# === FILE ACCESS CONTROL ===
# Аналог AppArmor file rules: path permissions
#   r = read, w = write, x = execute (run as script)
#   deny = explicit deny (overrides allow)

file_access:
  # Всё в vault — по умолчанию read-only для агента
  default: r

  # Агент может писать в эти папки
  allow_write:
    - "Inbox/**"                 # точка входа — всегда writeable
    - "Daily/**"                 # daily notes
    - "Tasks/**"                 # задачи
    - "Content/**"               # черновики
    - "Projects/**/research/**"  # research notes в проектах
    - ".agentos/proc/**"         # runtime state
    - ".agentos/memory/**"       # memory updates

  # Агент может писать ТОЛЬКО с подтверждением пользователя (ask)
  ask_write:
    - "Knowledge/**"             # знания — важные, подтверди
    - "People/**"                # контакты — чувствительно
    - "Projects/**/runbooks/**"  # процедуры — могут сломать workflow
    - "Career/**"                # карьерные данные
    - "CLAUDE.md"                # не перезаписывай свой конфиг сам

  # Агент НЕ МОЖЕТ читать (deny)
  deny_read:
    - ".agentos/secrets/**"      # секреты — только через vault API
    - "**/.env"                  # environment files
    - "**/*.key"                 # private keys
    - "**/*.pem"                 # certificates
    - "**/*credentials*"         # credentials files
    - "**/*token*"               # token files
    - ".claude/sessions/**"      # чужие session logs
    - ".omc/sessions/**"         # чужие session logs

  # Агент НЕ МОЖЕТ писать (deny)
  deny_write:
    - ".claude/settings.json"    # не модифицируй свои permissions
    - ".claude/claudian-settings.json"
    - ".agentos/security/**"     # не модифицируй свою security policy
    - ".agentos/manifest.yaml"   # не модифицируй manifest
    - ".obsidian/**"             # не трогай Obsidian config

# === INPUT VALIDATION (prompt injection defense) ===
# Сканирование файлов при чтении на injection patterns
# Идея из claude-code-ultimate-guide: 24 CVE, 655 malicious skills
input_validation:
  enabled: true
  scan_on_read:                      # при чтении файла — сканировать на injection
    - pattern: "ignore previous instructions"
    - pattern: "system prompt"
    - pattern: "you are now"
    - pattern: "<script>"
    - pattern: "ADMIN OVERRIDE"
    - pattern: "ignore all rules"
  action: warn                       # warn | quarantine | block
  quarantine_path: ".agentos/proc/quarantine/"
  # agentfs doctor включает scan всего vault на эти паттерны

# === NETWORK / EXFILTRATION CONTROL ===
network:
  # Запрет отправки определённых данных наружу
  deny_exfil_patterns:
    - regex: "(sk-[a-zA-Z0-9]{20,})"         # OpenAI API keys
    - regex: "(AKIA[0-9A-Z]{16})"             # AWS Access Keys
    - regex: "(ghp_[a-zA-Z0-9]{36})"          # GitHub PAT
    - regex: "(xoxb-[0-9]{11}-[0-9]{11}-)"    # Slack Bot tokens
    - regex: "-----BEGIN (RSA |EC )?PRIVATE KEY-----"  # Private keys
    - regex: "(eyJ[a-zA-Z0-9]{10,}\\.eyJ)"    # JWT tokens

  # Домены, куда агент может делать запросы (whitelist)
  allowed_domains:
    - "*.anthropic.com"           # Claude API (если нужно)
    - "github.com"
    - "api.github.com"
    - "{your-domain}"         # Digital Garden

# === COMMAND CONTROL ===
commands:
  blocked:
    - "rm -rf"
    - "chmod 777"
    - "curl * | sh"              # pipe from internet to shell
    - "wget * -O - | sh"
    - "eval $(curl *)"

  ask_before:                    # требует подтверждения
    - "git push"
    - "npm publish"
    - "docker push"
    - "ssh *"
```

#### Compile: policy → native enforcement

```bash
agentfs compile security
```

Что происходит:

**1. Claude Code** (реальный enforcement):

```json
// .claude/settings.json — GENERATED by agentfs compile security
{
  "permissions": {
    "allow": [],
    "deny": [
      "Read(.agentos/secrets/**)",
      "Read(**/.env)",
      "Read(**/*.key)",
      "Read(**/*.pem)",
      "Read(**/*credentials*)",
      "Read(**/*token*)",
      "Read(.claude/sessions/**)",
      "Write(.claude/settings.json)",
      "Write(.agentos/security/**)",
      "Write(.agentos/manifest.yaml)",
      "Write(.obsidian/**)"
    ],
    "ask": [
      "Write(Knowledge/**)",
      "Write(People/**)",
      "Write(Projects/**/runbooks/**)",
      "Write(Career/**)",
      "Write(CLAUDE.md)"
    ]
  }
}
```

**2. Claudian** (реальный enforcement):

```json
// Merge в .claude/claudian-settings.json — поля, управляемые AgentOS
{
  "permissionMode": "ask",          // понижаем с "yolo" до "ask"
  "blockedCommands": {
    "unix": ["rm -rf", "chmod 777", "chmod -R 777", "curl * | sh", "eval $(curl *)"]
  },
  "allowExternalAccess": false,
  "allowedExportPaths": ["~/Desktop", "~/Downloads"]
}
```

**3. CLAUDE.md** (advisory enforcement):

Секция `## Security Policy` компилируется в CLAUDE.md из policy.yaml. Для Claude Code это дополнительный advisory слой поверх реального deny.

**4. OMC / OpenClaw** (advisory only):

OMC не имеет enforcement API. Единственный вариант — advisory text в SOUL.md. Это слабое место архитектуры, но честное: мы не можем обеспечить то, что runtime не поддерживает.

#### Enforce vs Complain mode

Аналог AppArmor:

| Mode | Поведение | Когда использовать |
|------|----------|-------------------|
| `enforce` | Deny-правила реально блокируют доступ через native runtime | Production — vault с секретами |
| `complain` | Нарушения логируются в `audit/violations.log`, но не блокируются | Onboarding — понять что агент реально читает |
| `disabled` | Никаких ограничений | Development — полное доверие |

```bash
agentfs security mode enforce     # включить enforce
agentfs security mode complain    # включить complain (логирование)
agentfs security audit            # показать violations.log
agentfs security test             # dry-run: проверить policy на конфликты
```

---

### Level 4: Secrets Vault (reference-only access)

**Ключевой принцип:** агент НИКОГДА не видит raw secret value. Он оперирует только ссылками. Значение подставляется в runtime, вне контекста LLM.

Аналогия:

| Система | Как работает |
|---------|-------------|
| HashiCorp Vault | App запрашивает секрет по path, Vault отдаёт value с TTL |
| K8s Secrets | Pod монтирует secret как volume, не хранит в spec |
| GitHub Actions | `${{ secrets.API_KEY }}` — runner подставляет, workflow не видит |
| **AgentOS** | `${{secret:name}}` — `agentfs exec` подставляет, агент не видит |

#### Структура

```
.agentos/secrets/
├── vault.yaml               ← зашифрованный SOPS/age файл с секретами
├── refs.yaml                ← расшифрованные ССЫЛКИ (без значений) — агент видит только это
└── README.md                ← инструкция для агента: "используй agentfs secret get"
```

#### `refs.yaml` — что видит агент

```yaml
# .agentos/secrets/refs.yaml
# Агент видит ТОЛЬКО этот файл. Значения — НЕТ.
# Для использования: agentfs secret get <name>

secrets:
  - name: aws-access-key
    description: "AWS IAM access key для S3 доступа"
    scope: Projects/{project-a}/
    type: api-key

  - name: github-pat
    description: "GitHub Personal Access Token ({project-b} repo)"
    scope: Projects/{project-b}/
    type: token

  - name: anthropic-api-key
    description: "Anthropic API key для Claude"
    scope: global
    type: api-key

  - name: smtp-password
    description: "Email SMTP password"
    scope: global
    type: password
```

#### `vault.yaml` — зашифрованные значения (агент НЕ читает)

```yaml
# .agentos/secrets/vault.yaml
# Зашифровано через SOPS + age
# Агент НЕ ИМЕЕТ доступа к этому файлу (deny в policy.yaml)
# Расшифровывается только через agentfs secret get

sops:
  age:
    - recipient: age1ql3z7hjy54pw3hyww5ay...
  encrypted_suffix: _encrypted

secrets:
  aws-access-key_encrypted: ENC[AES256_GCM,data:...,type:str]
  github-pat_encrypted: ENC[AES256_GCM,data:...,type:str]
  anthropic-api-key_encrypted: ENC[AES256_GCM,data:...,type:str]
  smtp-password_encrypted: ENC[AES256_GCM,data:...,type:str]
```

#### Workflow: как агент использует секреты

```
Агент хочет сделать: curl -H "Authorization: Bearer <github-token>" https://api.github.com/...

Неправильно (утечка):
  1. Агент читает .env → видит raw token → вставляет в curl → token в LLM context

Правильно (AgentOS way):
  1. Агент читает refs.yaml → видит "github-pat exists, scope: Projects/{project-b}/"
  2. Агент вызывает: agentfs exec --with-secrets "curl -H 'Authorization: Bearer ${{secret:github-pat}}' https://api.github.com/..."
  3. CLI `agentfs exec`:
     a. Расшифровывает vault.yaml (локально, через age key)
     b. Подставляет ${{secret:github-pat}} → реальный токен
     c. Выполняет curl
     d. Возвращает агенту ТОЛЬКО stdout/stderr (без raw token)
  4. Агент получает результат, raw token НИКОГДА не попал в LLM context
```

```
┌─────────────────────┐
│ Agent (LLM context)  │
│                      │
│ "I need github-pat"  │
│         │            │
│         ▼            │
│ agentfs exec         │
│  --with-secrets      │
│  "curl ... ${{..}}"  │
└────────┬────────────┘
         │ (template, no raw value)
         ▼
┌─────────────────────┐
│ agentos CLI (local)  │
│                      │
│ 1. Decrypt vault.yaml│
│ 2. Resolve ${{..}}   │  ← raw value EXISTS HERE ONLY
│ 3. Execute command   │
│ 4. Return stdout     │
└────────┬────────────┘
         │ (stdout only, no secrets)
         ▼
┌─────────────────────┐
│ Agent (LLM context)  │
│                      │
│ "Got response: ..."  │  ← NO raw secrets in context
└─────────────────────┘
```

#### CLI для secrets

```bash
# Управление
agentfs secret add aws-access-key --type api-key --scope "Projects/{project-a}/"
agentfs secret remove smtp-password
agentfs secret list                    # показать refs (без значений)
agentfs secret rotate github-pat       # перегенерировать/обновить

# Использование (агент вызывает эти команды)
agentfs exec --with-secrets "command with ${{secret:name}}"
agentfs secret inject .env.template .env   # подставить секреты в шаблон → файл

# Аудит
agentfs secret audit                   # кто когда обращался к каким секретам
```

#### Manifest: секция secrets

```yaml
# .agentos/manifest.yaml (дополнение)
secrets:
  engine: sops+age                  # sops+age | git-crypt | none
  key_file: "~/.config/agentos/age.key"  # НЕ в vault!
  refs_file: ".agentos/secrets/refs.yaml"
  vault_file: ".agentos/secrets/vault.yaml"
```

---

### Level 5: Encryption at Rest

Для vault-ов с git remote — шифрование чувствительных папок целиком.

**Два варианта:**

**A. SOPS + age** (рекомендуемый) — шифрует YAML/JSON файлы поле-по-поле:
```bash
# Для secrets vault
sops --encrypt --age $(cat ~/.config/agentos/age.pub) vault.yaml
```

**B. git-crypt** — шифрует файлы целиком в git:
```gitattributes
# .gitattributes
Career/cv/**           filter=git-crypt diff=git-crypt
People/**              filter=git-crypt diff=git-crypt
.agentos/secrets/**    filter=git-crypt diff=git-crypt
.agentos/memory/**     filter=git-crypt diff=git-crypt
```

```bash
agentos init --encrypt              # настроить encryption при создании
agentos encrypt add Career/cv/     # добавить путь в шифрование
agentos encrypt status             # показать что зашифровано
```

---

### Exfiltration Prevention — Regex Guard

Отдельный compile-time guard. При `agentfs compile` сканируются ВСЕ compiled outputs (CLAUDE.md, SOUL.md, .cursorrules) на наличие паттернов секретов:

```yaml
# Из policy.yaml → network.deny_exfil_patterns
patterns:
  - name: "OpenAI API Key"
    regex: "sk-[a-zA-Z0-9]{20,}"
  - name: "AWS Access Key"
    regex: "AKIA[0-9A-Z]{16}"
  - name: "GitHub PAT"
    regex: "ghp_[a-zA-Z0-9]{36}"
  - name: "Private Key"
    regex: "-----BEGIN (RSA |EC )?PRIVATE KEY-----"
  - name: "JWT Token"
    regex: "eyJ[a-zA-Z0-9]{10,}\\.eyJ"
  - name: "Generic Secret Pattern"
    regex: "(password|secret|token|apikey|api_key)\\s*[:=]\\s*['\"][^'\"]{8,}"
```

```bash
$ agentfs compile
  ✓ Compiled CLAUDE.md
  ✓ Compiled .claude/settings.json
  ✗ SECURITY ALERT: CLAUDE.md contains pattern matching "AWS Access Key" at line 47
    → Aborting compile. Fix source in .agentos/init.d/ and retry.
```

Это аналог `git-secrets` pre-commit hook, но встроенный в compile pipeline.

---

### Composable Security Modules

Вместо монолитного policy.yaml для всех случаев — модульная система. Идея вдохновлена [Trail of Bits skills](https://github.com/trailofbits/skills): 40+ security skills как plugin marketplace.

**Принцип:** base policy (встроенная, всегда активна) + domain modules (подключаются per-project).

```
.agentos/security/
├── policy.yaml              ← base policy (всегда)
├── modules/                 ← domain-specific расширения
│   ├── crypto.yaml          ← crypto audit: seed phrases, private keys, wallet addrs
│   ├── web.yaml             ← web security: XSS, CSRF, CORS patterns
│   ├── infra.yaml           ← infra patterns: SSH keys, .env, kubeconfig
│   ├── cloud.yaml           ← cloud-specific: AWS/GCP credentials, IAM
│   └── ci-cd.yaml           ← CI/CD: pipeline tokens, registry creds
├── profiles/
└── audit/
```

**Пример: `modules/crypto.yaml`**

```yaml
# Domain-specific security patterns for crypto/web3 projects
name: crypto
version: "1.0"
description: "Patterns for cryptocurrency and blockchain projects"

deny_exfil_patterns:
  - name: "Ethereum Private Key"
    regex: "0x[a-fA-F0-9]{64}"
  - name: "Mnemonic Seed Phrase"
    regex: "(\\b\\w+\\b\\s+){11,23}\\b\\w+\\b"    # 12 or 24 words
  - name: "Solana Private Key"
    regex: "[1-9A-HJ-NP-Za-km-z]{87,88}"

deny_read:
  - "**/*.keystore"
  - "**/wallet.json"
  - "**/.secret"
```

**CLI:**

```bash
agentfs security add crypto       # активировать модуль для этого vault
agentfs security add web infra    # несколько сразу
agentfs security remove crypto    # деактивировать
agentfs security list             # показать base + активные модули
```

При `agentfs compile security` — base policy мержится с активными модулями → единый enforcement profile. Порядок: base → modules (modules расширяют, не перезаписывают).

---

### Полная модель: все 5 уровней

```
┌─ Level 5: ENCRYPTION AT REST ─────────────────────────────────┐
│  SOPS/age для secrets, git-crypt для PII папок                │
│  → файлы зашифрованы на диске и в git remote                  │
├─ Level 4: SECRETS VAULT ──────────────────────────────────────┤
│  Агент видит ТОЛЬКО refs.yaml (имена секретов)                │
│  Raw values → только через agentfs exec --with-secrets        │
│  → секрет НИКОГДА не попадает в LLM context                   │
├─ Level 3: APPARMOR PROFILES ──────────────────────────────────┤
│  policy.yaml → compile → .claude/settings.json permissions    │
│  deny_read: secrets, .env, *.key, *.pem                      │
│  deny_write: security policy, manifest, obsidian config       │
│  Regex guard: блокировка compile если leaked pattern          │
│  → реальный enforcement через нативные механизмы агента       │
├─ Level 2: AGENT POLICY ──────────────────────────────────────┤
│  .agentignore + compiled Security Policy в CLAUDE.md          │
│  → advisory для агентов без native enforcement (OMC)          │
├─ Level 1: GIT HYGIENE ───────────────────────────────────────┤
│  .gitignore: proc/, sessions/, decrypted/                     │
│  → runtime state не попадает в git remote                     │
└───────────────────────────────────────────────────────────────┘
```

### Ограничения (честно)

1. **OMC/OpenClaw не имеет enforcement API.** Level 3 для него — только advisory. Если OpenClaw решит прочитать `.agentos/secrets/vault.yaml` — мы не можем это технически заблокировать. Только Level 5 (encryption) защищает.

2. **LLM context — слабое звено.** Даже с deny rules, если секрет каким-то образом попал в файл, который агент прочитал — он уже в LLM context и потенциально в логах провайдера. Level 4 (reference-only) — единственная настоящая защита от этого.

3. **`agentfs exec --with-secrets` требует local runtime.** Если агент работает в cloud (Cowork VM) — age key должен быть доступен в environment. Это отдельная задача для deployment.

4. **Complain mode не перехватывает реальные обращения.** В отличие от настоящего AppArmor, мы не можем логировать каждый file read агента в реальном времени. Audit работает на уровне compile (что скомпилировано) и post-session analysis (что было в сессии).

---

## 16. Open Questions

1. **Obsidian community plugins.** Нужен ли companion plugin для Obsidian, который рендерит `.agentos/proc/status.md` как виджет? Или это overengineering на старте?

2. **Multi-agent.** Если в vault работают Claude и OpenClaw одновременно — нужен ли mutex/lock mechanism в `.agentos/proc/locks/`? Или достаточно convention "один агент в один момент"?

3. **Git integration.** Должен ли `create-agentfs` инициализировать git? `.gitignore` для `.agentos/proc/` (ephemeral state)? Или это решение пользователя?

4. **Plugin system.** Модули (career, content, engineering) — это встроенные generators. Но стоит ли предусмотреть community plugins для кастомных модулей? npm-пакеты вида `agentos-module-{name}`?

5. **Compile triggers.** Когда запускать `agentfs compile` автоматически? При каждом `git commit`? При изменении `manifest.yaml`? Через file watcher? Или только вручную?

---

## 17. Что дальше

```
Phase 1:   Spec (этот документ) → review → approve
Phase 2:   MVP — npx create-agentfs: personal profile + compile.d/claude + AGENT-MAP.md
Phase 2.5: Onboard — agentfs onboard (agent-led interview → identity + memory)
Phase 3:   Memory — Tulving taxonomy (semantic/episodic/procedural) + confidence scoring
Phase 4:   Cron — memory-consolidation + distillation (batch every 2 days) + inbox-triage
Phase 5:   Security — policy.yaml + AppArmor profiles + input_validation + composable modules
Phase 6:   Secrets vault — SOPS/age + agentfs exec --with-secrets + regex guard
Phase 7:   Sync — agentfs sync (bidirectional manifest ↔ CLAUDE.md) + cross-vault
Phase 8:   compile.d/openclaw + bidirectional memory sync
Phase 9:   Company + Shared profiles
Phase 10:  agentos CLI full (status, doctor + agnix, triage, migrate, security audit)
Phase 11:  Community — npm publish, README, contributing guide, security module marketplace
```

---

*Этот документ — проектная спецификация. Не код. Не применять без явного ОК.*
