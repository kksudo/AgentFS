
# AgentOS: Competitive Research & Stolen Ideas

> Исследование 12 репозиториев. Что забрать, что не повторять, где наша ниша.

---

## Ландшафт по звёздам

| Repo | Stars | Что делает | Релевантность для AgentOS |
|------|------:|-----------|--------------------------|
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 36.1k | Каталог skills, hooks, plugins, orchestrators | Каталог экосистемы — карта рынка |
| [obsidian-copilot](https://github.com/logancyang/obsidian-copilot) | 6.6k | AI agent внутри Obsidian с memory и vault search | Memory как callable tool |
| [Trail of Bits skills](https://github.com/trailofbits/skills) | 4.3k | 40+ security skills для Claude Code | Security skill marketplace model |
| [Agent OS (buildermethods)](https://github.com/buildermethods/agent-os) | 4.2k | Inject codebase standards, shape specs | Standards extraction + injection |
| [claude-code-ultimate-guide](https://github.com/FlorianBruniaux/claude-code-ultimate-guide) | 2.8k | Гайд от junior до power user, security hardening | 24 CVE, 655 malicious skills, 3-layer defense |
| [awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) | 1.0k | 135 agents, 35 skills, 42 commands, hooks | claude-scaffold, VibeGuard |
| [everything-claude-code](https://github.com/affaan-m/everything-claude-code) | ~500 | 38 agents, 156 skills, instincts, memory | Instincts system (auto-learned patterns) |
| [agnix](https://github.com/agent-sh/agnix) | 143 | Linter для CLAUDE.md, AGENTS.md, SKILL.md, hooks | 385 validation rules |
| [Agent-Scaffolding](https://github.com/DOWingard/Agent-Scaffolding) | 1 | AGENT-MAP.md router, context-as-code, bug learning | AGENT-MAP.md pattern |
| [ai-agent-workflow](https://github.com/Jason-Cyr/ai-agent-workflow) | small | PARA + OpenClaw + Linear + Slack | AGENTS.md standing instructions |
| [codex-vault](https://github.com/mateo-bolanos/codex-vault) | small | npx init, subagent prompts, task backlog | npx scaffold UX |
| [Claude-Agent-Workspace-Model](https://github.com/danielrosehill/Claude-Agent-Workspace-Model) | small | SCAFFOLD → PERSONALIZE → SUCCESS stages | Onboarding interview pattern |

Плюс два ключевых gist-а:
- [Memory architecture for agentic systems](https://gist.github.com/spikelab/7551c6368e23caa06a4056350f6b2db3) — Tulving's 3-prong taxonomy, decay functions, progressive disclosure
- [OpenClaw + Obsidian + CouchDB](https://gist.github.com/jimmytherobot-ai/e905e5e2667868ca47d11309d193b648) — SkillRL feedback loop, distillation cron, 3-layer memory

---

## Что забрать в AgentOS

### 1. AGENT-MAP.md router (от Agent-Scaffolding)

**Что:** вместо того чтобы агент сканировал весь vault, создать один файл-маршрутизатор, который описывает "что где лежит".

**Почему полезно:** наш `manifest.yaml → paths` уже делает это, но в YAML. Agent-Scaffolding показал, что markdown-версия (AGENT-MAP.md) работает как fallback для агентов, которые не умеют парсить YAML.

**Действие для AgentOS:**
- `agentos compile` должен генерировать `AGENT-MAP.md` из manifest.yaml — человекочитаемый index vault-а
- Это дополнение к CLAUDE.md, не замена

---

### 2. Distillation Cron + SkillRL (от OpenClaw + Obsidian gist)

**Что:** каждые 2 дня cron проходит по JSONL логам сессий, извлекает паттерны (corrections, successes), инжектит правила обратно в конфиг агента. "Агент буквально улучшает себя на своих ошибках."

**Почему полезно:** наш `cron.d/memory-consolidation.md` задуман как on-session-end. Но distillation cron — это другое: это scheduled batch processing, как `logrotate` + анализ.

**Действие для AgentOS:**
- Добавить `cron.d/distillation.md` — periodic batch processing (каждые 2 дня)
- Формат лога: JSONL с полями `{timestamp, type, category, description, fix, lesson}`
- Distillation → извлечь PREF/FACT/PATTERN/AVOID → merge в `memory/long-term.md`
- Это дополняет on-session-end consolidation (которая быстрая), а distillation — глубокая

---

### 3. Tulving's 3-prong memory taxonomy (от spikelab gist)

**Что:** три типа памяти (Semantic, Episodic, Procedural) с разными механизмами retrieval:
- Semantic: факты, без контекста ("users prefer async/await")
- Episodic: timestamped события ("last time we tried X, it failed because Y")
- Procedural: behavioral patterns, tool sequences, skills

**Почему полезно:** наша текущая `memory/long-term.md` смешивает все три типа в один файл. Это работает на малом объёме, но не масштабируется.

**Действие для AgentOS:**
```
.agentos/memory/
├── semantic.md              ← факты: PREF, FACT (context-free)
├── episodic/                ← события: что когда случилось
│   └── YYYY-MM-DD.md
├── procedural/              ← как делать: runbooks, patterns
│   └── {skill-name}.md
└── corrections.md           ← ошибки (feeds back into all three)
```
Три файла вместо одного. Semantic — unbounded append. Episodic — time-indexed. Procedural — skill-indexed.

**Бонус из gist:** progressive disclosure (~10x token savings). При boot загружать ТОЛЬКО semantic. Episodic и procedural — lazy load по запросу.

---

### 4. Instincts system (от everything-claude-code)

**Что:** "learned patterns automatically extracted from sessions with confidence scoring and evolution." Instincts — это не skills (явные инструкции), а выученные привычки с confidence score.

**Почему полезно:** наши PATTERN записи в memory — плоский текст без веса. Instinct с confidence score и decay позволяет отличить "один раз помогло" от "помогает всегда".

**Действие для AgentOS:**
- В `memory/semantic.md` добавить формат:
  ```
  PATTERN: [confidence:0.9] утром продуктивнее — сложные задачи до обеда
  PATTERN: [confidence:0.3] prefer pnpm over npm (based on 1 session)
  ```
- Distillation cron повышает confidence при повторном подтверждении, понижает при опровержении
- Decay: если pattern не подтверждён 30 дней → confidence -= 0.1

---

### 5. 3-layer defense model (от claude-code-ultimate-guide)

**Что:** 24 CVE-mapped vulnerabilities, 655 malicious skills catalogued, 3-layer defense:
1. Input validation (prompt injection defense)
2. Execution sandboxing (command blocking)
3. Output scanning (exfiltration prevention)

**Почему полезно:** наш Level 3 (AppArmor profiles) покрывает execution + output. Но input validation (prompt injection в файлах vault) — НЕ покрыт.

**Действие для AgentOS:**
- Добавить в `policy.yaml` секцию `input_validation`:
  ```yaml
  input_validation:
    scan_on_read:              # при чтении файла — сканировать на injection
      - pattern: "ignore previous instructions"
      - pattern: "system prompt"
      - pattern: "you are now"
      - pattern: "<script>"
    quarantine_path: ".agentos/proc/quarantine/"
  ```
- `agentos doctor` должен сканировать vault на injection patterns в файлах

---

### 6. agnix — linter для agent файлов (от agent-sh/agnix)

**Что:** 385 правил валидации для CLAUDE.md, AGENTS.md, SKILL.md, hooks, MCP. Ловит: generic instructions ("Be helpful"), wrong naming, missing fields.

**Почему полезно:** наш `agentos doctor` задуман, но правил ещё нет. agnix — готовый набор.

**Действие для AgentOS:**
- НЕ форкать agnix — интегрировать как dependency
- `agentos doctor` = наши vault-specific проверки + `agnix` для agent config validation
- Добавить в CI: `agentos doctor && agnix lint` на каждый commit

---

### 7. SCAFFOLD → PERSONALIZE → SUCCESS (от Claude-Agent-Workspace-Model)

**Что:** три фазы инициализации:
1. SCAFFOLD: clone template, создать структуру
2. PERSONALIZE: agent-led interview — агент спрашивает про роль, стек, предпочтения
3. SUCCESS: vault полностью настроен

**Почему полезно:** наш `npx create-agentos` — это SCAFFOLD. Но PERSONALIZE (агентское интервью) — нет. А это критически важно для init.d/00-identity.md — вместо заполнения вручную, агент спрашивает.

**Действие для AgentOS:**
- После `npx create-agentos` — опциональная команда `agentos onboard`
- Агент запускает интервью: "Какой твой основной стек? Какие проекты активны? Как ты предпочитаешь общаться?"
- Ответы → init.d/00-identity.md + memory/semantic.md
- Это Phase 2.5 в roadmap, перед compile

---

### 8. claude-scaffold deployment (от awesome-claude-code-toolkit)

**Что:** "deploys CLAUDE.md, hooks, and 18 domain skills to any repository in one command" + cross-repo sync через update function.

**Почему полезно:** наш compile — one-way (manifest → CLAUDE.md). Sync обратно (CLAUDE.md изменён вручную → обновить manifest) — НЕ предусмотрен.

**Действие для AgentOS:**
- `agentos sync` — bidirectional: если CLAUDE.md отредактирован вручную, diff → предложить обновить manifest
- Cross-vault sync: если несколько vault-ов (personal + work) — shared standards

---

### 9. Security skill marketplace (от Trail of Bits)

**Что:** 40+ security skills как plugin marketplace. `install` через `/plugin marketplace add trailofbits/skills`. Каждый skill — изолированный пакет с описанием и правилами.

**Почему полезно:** наш `policy.yaml` — монолитный. А security skills как модули — более гибко. Можно подключить "crypto audit" skill для проекта с HashiCorp Vault, не грузя его для контент-проекта.

**Действие для AgentOS:**
- Security policies как composable modules:
  ```bash
  agentos security add crypto      # добавить crypto-specific patterns
  agentos security add web         # добавить web-specific patterns (XSS, CSRF)
  agentos security add infra       # добавить infra patterns (SSH keys, .env)
  ```
- Base policy (встроенная) + domain policies (модули)

---

### 10. Immutable append + superseded (от OpenClaw + Obsidian gist)

**Что:** факты никогда не удаляются — superseded facts помечаются `"status": "superseded"`. Полная history.

**Почему полезно:** наша текущая модель — overwrite при противоречии. Потеря истории. Git diff помогает, но не достаточно — нужен explicit status.

**Действие для AgentOS:**
- В `memory/semantic.md`:
  ```
  FACT: [active] CKA сертификация получена 2024
  FACT: [superseded:2026-04-01] Основной стек — AWS (заменён на: мультиклауд AWS+GCP)
  FACT: [active] Основной стек — мультиклауд AWS+GCP
  ```
- Memory consolidation: при противоречии — mark old as superseded, append new
- `agentos memory history "стек"` — показать эволюцию факта

---

## Что НЕ брать

| Подход | Почему НЕ брать |
|--------|----------------|
| Векторный поиск (obsidian-copilot) | Overengineering для файловой системы. FHS + AGENT-MAP.md достаточно. Зиновьев прав: "карта, а не библиотека" |
| CouchDB для sync (OpenClaw gist) | Нарушает принцип "всё есть файл". Git + Obsidian LiveSync достаточно |
| 135 agents (toolkit) | Bloat. AgentOS — infrastructure, не skill marketplace. Skills — ортогональны |
| Knowledge graph (Tulving gist) | На старте — overkill. Markdown semantic/episodic/procedural файлы достаточно. Graph — Phase N |
| VibeGuard 88 rules (toolkit) | Слишком aggressive. Наш AppArmor profile + policy.yaml — более хирургический подход |
| Plugin marketplace (Trail of Bits model) | Для security — да. Для всего остального — преждевременная абстракция |

---

## Обновлённая карта уникальности AgentOS

После исследования — что реально уникально:

| Фича | Кто-то делает? | AgentOS уникальность |
|-------|:-:|---|
| Compile pipeline (manifest → multi-agent native) | **Никто** | Единственный source-of-truth → multi-target compile |
| AppArmor profiles с real enforcement | **Никто** | Все делают advisory-only. Мы компилируем в `.claude/settings.json permissions.deny` |
| Secrets vault с reference-only access | **Никто** | Нет ни одного решения для agent secrets через SOPS/age |
| Linux FHS mapping для vault | Частично (gist, наш v3) | Формализованный mapping с manifest.yaml |
| 3-phase onboard (scaffold → interview → compile) | Claude-Agent-Workspace-Model | Мы добавляем compile и security поверх |
| Distillation cron + confidence scoring | OpenClaw gist + everything-cc | Мы формализуем в cron.d/ с YAML spec |
| Multi-profile (personal/company/shared) | **Никто** | Все делают single-user |
| agnix integration (385 lint rules) | agnix standalone | Мы интегрируем в `agentos doctor` |

---

## Итого: обновления для архитектуры

```
Добавить в v3 документа:
1. AGENT-MAP.md — compiled markdown router из manifest
2. memory/ — split на semantic/episodic/procedural
3. cron.d/distillation.md — batch pattern extraction (каждые 2 дня)
4. Confidence scoring для PATTERN записей + decay
5. Immutable append + superseded status для фактов
6. input_validation в policy.yaml (prompt injection scan)
7. agentos onboard — agent-led interview (Phase PERSONALIZE)
8. agentos sync — bidirectional manifest ↔ CLAUDE.md
9. Composable security modules (base + domain policies)
10. agnix как dependency для agentos doctor
```
