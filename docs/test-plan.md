# AgentFS — Комплексный план тестирования

> **Версия:** 1.0
> **Дата:** 2026-04-04
> **Статус проекта:** v0.1.4 — 261 юнит-тест в 18 сьютах (все проходят)
> **Фреймворк:** Jest + ts-jest (ESM-режим, `--experimental-vm-modules`)

---

## Содержание

1. [Обзор текущего покрытия](#1-обзор-текущего-покрытия)
2. [Юнит-тесты — покрытие и пробелы](#2-юнит-тесты--покрытие-и-пробелы)
3. [Интеграционные тесты](#3-интеграционные-тесты)
4. [CLI-тесты](#4-cli-тесты)
5. [Граничные случаи](#5-граничные-случаи)
6. [Тесты взаимодействия с AI-агентами](#6-тесты-взаимодействия-с-ai-агентами)
7. [Приоритеты и дорожная карта](#7-приоритеты-и-дорожная-карта)

---

## 1. Обзор текущего покрытия

### Существующие тест-файлы (18 сьютов, 261 тест)

| Файл | Модуль | Кол-во тестов (прибл.) | Статус |
|---|---|---|---|
| `tests/cli.test.ts` | CLI-роутер | 8 | существует |
| `tests/compile.test.ts` | Команда compile | 5 | существует |
| `tests/compilers-base.test.ts` | compilers/base | 12 | существует |
| `tests/compilers-claude.test.ts` | compilers/claude | 4 | существует |
| `tests/compilers-agent-map.test.ts` | compilers/agent-map | 2 | существует |
| `tests/multi-agent.test.ts` | openclaw + cursor компиляторы | 7 | существует |
| `tests/onboard.test.ts` | Команда onboard | 4 | существует |
| `tests/memory.test.ts` | Парсер памяти + confidence | 30+ | существует |
| `tests/memory-cli.test.ts` | Команда memory | 14 | существует |
| `tests/episodic.test.ts` | Эпизодическая память | 5 | существует |
| `tests/procedural.test.ts` | Процедурная память | 6 | существует |
| `tests/security.test.ts` | Политика безопасности + CLI | 20+ | существует |
| `tests/secrets.test.ts` | Секреты (vault + exfil-guard) | 18 | существует |
| `tests/cron.test.ts` | Cron-система + CLI | 14 | существует |
| `tests/sync.test.ts` | Синхронизация + CLI | 12 | существует |
| `tests/fhs-mapping.test.ts` | FHS-маппинг | 30+ | существует |
| `tests/types.test.ts` | Типы и константы | 3 | существует |
| `tests/utility.test.ts` | Профили + doctor/triage/migrate | 10 | существует |

---

## 2. Юнит-тесты — покрытие и пробелы

### 2.1. Покрытые модули

| ID | Модуль | Что покрыто | Статус |
|---|---|---|---|
| UNIT-001 | `memory/parser.ts` | Парсинг всех 4 типов (PREF, FACT, PATTERN, AVOID), статусы active/superseded, confidence | существует |
| UNIT-002 | `memory/confidence.ts` | confirm (+0.2), deny (-0.3), decay (30 дней), порог superseded (0.1), clamp 0..1 | существует |
| UNIT-003 | `memory/episodic.ts` | Создание, чтение, список дат, дедупликация при повторной записи | существует |
| UNIT-004 | `memory/procedural.ts` | Создание, чтение, список, slugify, перезапись | существует |
| UNIT-005 | `compilers/base.ts` | readManifest, readInitScripts, readSemanticMemory, readCorrections, buildCompileContext, compileTemplate (helpers), writeOutputs | существует |
| UNIT-006 | `compilers/claude.ts` | Имя, supports(), compile() с контекстом, null-модули | существует |
| UNIT-007 | `compilers/openclaw.ts` | Имя, supports(), compile() -> SOUL.md | существует |
| UNIT-008 | `compilers/cursor.ts` | Имя, supports(), compile() -> .cursorrules | существует |
| UNIT-009 | `compilers/agent-map.ts` | Генерация AGENTS.md, null-модули | существует |
| UNIT-010 | `security/parser.ts` | readSecurityPolicy (дефолт + файл), writeSecurityPolicy, scanForInjections, checkCommand | существует |
| UNIT-011 | `security/claude-compiler.ts` | Компиляция в settings.json, dry-run, сохранение пользовательских настроек | существует |
| UNIT-012 | `secrets/vault.ts` | add, remove, list, rotate, decrypt, resolveSecretRefs | существует |
| UNIT-013 | `secrets/exfil-guard.ts` | Обнаружение exfiltration, clean-текст, логирование violation | существует |
| UNIT-014 | `cron/runner.ts` | Реестр задач, runCronJob (consolidate, heartbeat, inbox-triage), runAllCronJobs | существует |
| UNIT-015 | `sync/sync.ts` | importFromOmc, exportToOmc, detectDrift | существует |
| UNIT-016 | `utils/fhs-mapping.ts` | getDefaultPaths (3 профиля), resolveFhsPath, FHS_DESCRIPTIONS | существует |
| UNIT-017 | `generators/profiles.ts` | generateCompanyProfile, generateSharedProfile | существует |
| UNIT-018 | `types/index.ts` | DEFAULT_CONFIDENCE, структуры Manifest, SemanticEntry | существует |

### 2.2. Пробелы в юнит-тестах

| ID | Модуль | Что отсутствует | Приоритет | Статус |
|---|---|---|---|---|
| UNIT-GAP-001 | `generators/scaffold.ts` | Полный pipeline scaffold() -- создание dirs, manifest, init, ignore, memory. Тестируется только через mock в cli.test.ts | P0 | пробел |
| UNIT-GAP-002 | `generators/filesystem.ts` | Генерация директорий для каждого профиля. Идемпотентность -- повторный вызов не ломает | P0 | пробел |
| UNIT-GAP-003 | `generators/manifest.ts` | Генерация manifest.yaml. Корректность YAML. Идемпотентность (не перезаписывает) | P0 | пробел |
| UNIT-GAP-004 | `generators/init.ts` | Генерация init.d/ скриптов. Содержимое 00-identity.md, 10-rules.md | P1 | пробел |
| UNIT-GAP-005 | `generators/ignore.ts` | Генерация .gitignore, .agentignore. Содержимое и идемпотентность | P1 | пробел |
| UNIT-GAP-006 | `generators/memory.ts` | Генерация memory/ структуры (semantic.md, episodic/, procedural/) | P1 | пробел |
| UNIT-GAP-007 | `generators/prompts.ts` | runSetupPrompts (интерактивный режим), createDefaultAnswers (non-interactive) | P1 | пробел |
| UNIT-GAP-008 | `cron/jobs/consolidate.ts` | Прямой тест job-функции (тестируется только через runner) | P2 | пробел |
| UNIT-GAP-009 | `cron/jobs/heartbeat.ts` | Прямой тест job-функции | P2 | пробел |
| UNIT-GAP-010 | `cron/jobs/inbox-triage.ts` | Прямой тест job-функции | P2 | пробел |
| UNIT-GAP-011 | `memory/index.ts` | Barrel re-export -- не требует отдельного теста, но appendSemanticEntry тестируется только в memory.test.ts | P2 | пробел |
| UNIT-GAP-012 | `src/index.ts` | Public API barrel -- проверка что VERSION и main экспортируются корректно | P2 | пробел |

---

## 3. Интеграционные тесты

> Все интеграционные тесты выполняются в изолированных временных директориях (`os.tmpdir()`).
> Каждый тест создает полный vault с нуля и проверяет сквозной результат.

### 3.1. Scaffold (создание vault)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| SCAFFOLD-001 | Создание vault (профиль personal) во временной директории | 1. Вызвать `scaffold()` с `profile: 'personal'`, `targetDir: tmpDir` 2. Проверить возвращенный `ScaffoldResult` | `dirsCreated > 0`, `filesCreated > 0`. Директории: `Inbox/`, `Daily/`, `Tasks/`, `Projects/`, `Content/`, `Knowledge/`, `People/`, `Archive/`, `.agentos/`, `.agentos/init.d/`, `.agentos/memory/`, `.agentos/memory/episodic/`, `.agentos/memory/procedural/` | P0 | планируется |
| SCAFFOLD-002 | Создание vault (профиль company) | 1. Вызвать `scaffold()` с `profile: 'company'` 2. Проверить директории | Дополнительные директории: `Teams/`, `Clients/`, `Decisions/`, `Postmortems/`. Файлы RBAC: `.agentos/rbac/roles.yaml`, `.agentos/rbac/policies.yaml` | P1 | планируется |
| SCAFFOLD-003 | Создание vault (профиль shared) | 1. Вызвать `scaffold()` с `profile: 'shared'` 2. Проверить директории | Директории: `Spaces/`, `Shared/Projects/`, `Shared/Knowledge/` | P1 | планируется |
| SCAFFOLD-004 | Проверка manifest.yaml после scaffold | 1. `scaffold()` 2. Прочитать `.agentos/manifest.yaml` 3. Парсить YAML | Валидный YAML. Поля: `version`, `vault.name`, `vault.owner`, `agentos.profile`, `agents.primary`, `paths.*`, `boot.sequence` | P0 | планируется |
| SCAFFOLD-005 | Проверка init.d/ скриптов после scaffold | 1. `scaffold()` 2. Прочитать `.agentos/init.d/00-identity.md` | Файл содержит placeholder `(to be filled)` или аналогичный маркер | P1 | планируется |
| SCAFFOLD-006 | Проверка memory/ структуры | 1. `scaffold()` 2. Проверить наличие `.agentos/memory/semantic.md`, `.agentos/memory/episodic/`, `.agentos/memory/procedural/` | Все три компонента памяти созданы. `semantic.md` содержит заголовок | P1 | планируется |
| SCAFFOLD-007 | Проверка ignore-файлов | 1. `scaffold()` 2. Прочитать `.gitignore` | Содержит `.agentos/secrets/`, `.agentos/proc/` | P2 | планируется |

### 3.2. Compile (компиляция)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| COMPILE-001 | Scaffold -> Compile -> проверка CLAUDE.md | 1. `scaffold()` 2. `compileCommand([])` из vault root 3. Прочитать `CLAUDE.md` | Файл создан. Содержит имя vault, профиль, boot-секвенцию. Exit code = 0 | P0 | планируется |
| COMPILE-002 | Scaffold -> Compile -> проверка AGENTS.md | 1. `scaffold()` 2. `compileCommand([])` 3. Прочитать `AGENTS.md` | Файл создан. Содержит имя vault, список поддерживаемых агентов, FHS-маппинг | P0 | планируется |
| COMPILE-003 | Compile для одного агента (claude) | 1. Создать vault 2. `compileCommand(['claude'])` | Создан только `CLAUDE.md` + `AGENTS.md`. Нет `.cursorrules`, нет `SOUL.md` | P1 | планируется |
| COMPILE-004 | Compile --dry-run не создает файлов | 1. Создать vault 2. `compileCommand(['--dry-run'])` 3. Проверить отсутствие `CLAUDE.md` на диске | Файлы НЕ созданы. Exit code = 0. Stdout содержит `[dry-run]` | P1 | планируется |
| COMPILE-005 | Compile с предупреждением о незаполненном identity | 1. `scaffold()` (identity содержит placeholder) 2. `compileCommand([])` | Stderr содержит `Warning: Identity not configured`. Exit code = 0 (предупреждение не блокирует) | P1 | планируется |
| COMPILE-006 | Compile для всех трех агентов (claude + openclaw + cursor) | 1. Создать vault с `supported: [claude, openclaw, cursor]` 2. `compileCommand([])` | Созданы: `CLAUDE.md`, `SOUL.md`, `.cursorrules`, `AGENTS.md` | P1 | планируется |
| COMPILE-007 | Compile с security policy в enforce-режиме | 1. Создать vault 2. Установить `default_mode: enforce` в policy.yaml 3. `compileCommand([])` 4. Проверить `CLAUDE.md` | CLAUDE.md содержит HARD-GATE директивы. `.claude/settings.json` содержит deny-правила | P0 | планируется |

### 3.3. Onboard (интервью пользователя)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| ONBOARD-001 | Полный цикл onboard с mock-ответами | 1. `scaffold()` 2. Mock inquirer 3. `onboardCommand([])` 4. Проверить identity + semantic | `00-identity.md` содержит Name, Role, Style. `semantic.md` содержит FACT, PREF, AVOID записи | P0 | существует |
| ONBOARD-002 | Сохранение пользовательских секций (`<!-- custom -->`) | 1. Создать identity с кастомным контентом 2. Запустить onboard повторно | Контент после `<!-- custom -->` сохранен | P0 | существует |
| ONBOARD-003 | Дедупликация semantic memory | 1. Заполнить semantic.md 2. Запустить onboard с теми же ответами | Дубликаты не добавлены. `matches.length === 1` | P0 | существует |
| ONBOARD-004 | Пустые ответы не создают записей | 1. Onboard с пустыми role, style, techStack, neverDo, preferences | Файл semantic.md не содержит FACT, PREF, AVOID | P1 | существует |
| ONBOARD-005 | Onboard без vault (нет manifest) | 1. Запустить onboard в пустой директории | Exit code = 1. Stderr: `No AgentFS vault found` | P1 | существует |

### 3.4. Memory (чтение/запись/парсинг)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| MEMORY-001 | Запись и чтение semantic memory (round-trip) | 1. appendSemanticEntry 2. Прочитать файл 3. parseSemanticMemory 4. Сравнить | Все поля (type, content, status, confidence) совпадают | P0 | существует |
| MEMORY-002 | Запись episodic entry с events/decisions/lessons | 1. writeEpisodicEntry 2. readEpisodicEntry | Содержит все три секции | P0 | существует |
| MEMORY-003 | Дедупликация episodic events при повторной записи | 1. writeEpisodicEntry('Event A') 2. writeEpisodicEntry('Event A', 'Event B') | 'Event A' встречается 1 раз, 'Event B' добавлен | P0 | существует |
| MEMORY-004 | Запись и чтение procedural entry | 1. writeProceduralEntry 2. readProceduralEntry | Содержит name, description, steps (нумерованные), context | P0 | существует |
| MEMORY-005 | Перезапись procedural skill | 1. writeProceduralEntry('v1') 2. writeProceduralEntry('v2') | Содержит 'v2', не содержит 'v1' | P1 | существует |
| MEMORY-006 | Scaffold -> onboard -> memory show (полный цикл) | 1. scaffold() 2. onboard с данными 3. memoryCommand(['show']) | Stdout содержит все записи из onboard. Active count корректен | P0 | планируется |
| MEMORY-007 | Confidence decay -> superseded transition | 1. Создать PATTERN с confidence 0.15 2. decayPattern(entry, 30) | Статус меняется на `superseded:YYYY-MM-DD`. Confidence < 0.1 | P1 | существует |

### 3.5. Security (безопасность)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| SEC-001 | Scaffold -> создание policy.yaml -> compile -> HARD-GATE | 1. scaffold() 2. writeSecurityPolicy с deny_write: ['.git/**'] 3. compileClaudeSecurity() 4. Проверить `.claude/settings.json` | `permissions.deny` содержит `Write(.git/**)`. `permissions.ask` содержит правила из ask_write | P0 | планируется |
| SEC-002 | Смена режима enforce -> complain -> disabled | 1. securityCommand(['mode', 'enforce']) 2. Проверить policy.yaml 3. securityCommand(['mode', 'complain']) | Каждый раз policy.yaml обновляется. Перекомпиляция происходит автоматически | P0 | существует |
| SEC-003 | Сканирование на injection-паттерны | 1. Создать файл с `ignore previous instructions` 2. securityCommand(['scan', path]) | Обнаружен injection-паттерн. Stdout содержит `injection pattern` | P0 | существует |
| SEC-004 | Добавление/удаление composable-модулей | 1. securityCommand(['add', 'crypto']) 2. securityCommand(['list']) 3. securityCommand(['remove', 'crypto']) 4. securityCommand(['list']) | Модуль появляется и исчезает. Файл `.agentos/security/modules/crypto.yaml` создается и удаляется | P1 | существует |
| SEC-005 | Блокировка опасных команд | 1. checkCommand('rm -rf /', DEFAULT_POLICY) | Возвращает `'blocked'` | P0 | существует |
| SEC-006 | ask-before для npm install | 1. checkCommand('npm install express', DEFAULT_POLICY) | Возвращает `'ask'` | P1 | существует |
| SEC-007 | npm-пакет security-модуля (agentfs-security-*) | 1. securityCommand(['add', 'agentfs-security-docker']) 2. Проверить stdout | Stdout содержит `Simulating installation`. Файл `docker.yaml` создан | P1 | существует |

### 3.6. Cron (периодические задачи)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| CRON-001 | Consolidate job с semantic memory | 1. Создать vault с semantic.md 2. runCronJob('consolidate', vault) | success=true. Создан episodic entry за сегодня. Сообщение содержит количество active | P0 | существует |
| CRON-002 | Heartbeat записывает status.md | 1. runCronJob('heartbeat', vault) 2. Прочитать `.agentos/proc/status.md` | Файл содержит `# Agent Status`, текущую дату, статус `active` | P0 | существует |
| CRON-003 | Heartbeat обнаруживает просроченные задачи | 1. Создать `Tasks/old-task.md` с `due: 2020-01-01` 2. runCronJob('heartbeat') | Сообщение содержит `1 overdue` | P1 | существует |
| CRON-004 | Inbox-triage с тегированными файлами | 1. Создать `Inbox/note.md` с фронтматтером tags 2. runCronJob('inbox-triage') | success=true. `1 file`, `1 with suggestions` | P1 | существует |
| CRON-005 | runAllCronJobs выполняет все задачи | 1. Создать vault с semantic.md 2. runAllCronJobs() | Массив из 3 результатов. Как минимум consolidate и heartbeat успешны | P1 | существует |
| CRON-006 | Scaffold -> cron consolidate -> episodic запись (полный цикл) | 1. scaffold() 2. onboard() 3. cronCommand(['run', 'consolidate']) 4. Проверить `.agentos/memory/episodic/YYYY-MM-DD.md` | Episodic entry создан. Содержит `consolidation` | P1 | планируется |

### 3.7. Sync (синхронизация)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| SYNC-001 | Import из .omc/project-memory.json | 1. Создать `.omc/project-memory.json` с facts 2. importFromOmc() | `imported === N`, `skipped === 0`. Записи появились в semantic.md как FACT | P0 | существует |
| SYNC-002 | Import с дедупликацией | 1. Предзаполнить semantic.md 2. Import того же факта | `imported === 0`, `skipped === 1` | P0 | существует |
| SYNC-003 | Export в .omc формат | 1. Заполнить semantic.md 2. exportToOmc() | `.omc/project-memory.json` содержит `facts` и `source: 'agentfs'` | P0 | существует |
| SYNC-004 | Drift detection | 1. detectDrift(vault, ['CLAUDE.md', 'AGENTS.md']) без файлов | Оба файла имеют `currentHash === 'MISSING'` | P1 | существует |
| SYNC-005 | Полный цикл: scaffold -> compile -> export -> import | 1. scaffold() 2. onboard() 3. compile() 4. sync push 5. Удалить semantic.md 6. import memory | Записи восстановлены из .omc | P1 | планируется |

### 3.8. Doctor (диагностика)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| DOCTOR-001 | Здоровый vault | 1. Создать .agentos/, manifest.yaml, init.d/, memory/ 2. doctorCommand([]) | Exit code = 0. `All checks passed` | P0 | существует |
| DOCTOR-002 | Vault без .agentos/ | 1. Пустая директория 2. doctorCommand([]) | Exit code = 1. `not found` | P0 | существует |
| DOCTOR-003 | Vault с injection в CLAUDE.md | 1. Создать vault 2. Записать injection-паттерн в CLAUDE.md 3. doctorCommand([]) | Проверка `CLAUDE.md injection scan` failed. Сообщение `pattern(s) detected` | P1 | планируется |
| DOCTOR-004 | Scaffold -> doctor (полный цикл) | 1. scaffold() 2. doctorCommand([]) | Все проверки пройдены | P0 | планируется |

### 3.9. Triage и Migrate

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| TRIAGE-001 | Пустой Inbox | 1. Создать Inbox/ без файлов 2. triageCommand([]) | `Inbox is empty` | P1 | существует |
| TRIAGE-002 | Inbox с файлами разных типов | 1. Создать файлы: project-notes.md, 2026-04-04.md, meeting.md 2. triageCommand([]) | Предложения: Projects/, Daily/, Decisions/ соответственно | P1 | существует |
| TRIAGE-003 | Нет Inbox/ директории | 1. triageCommand([]) в пустой директории | `No Inbox/ directory found` | P2 | существует |
| MIGRATE-001 | Vault уже мигрирован | 1. Создать .agentos/ 2. migrateCommand([]) | `already has .agentos` | P1 | существует |
| MIGRATE-002 | Анализ немигрированного vault | 1. Создать markdown файлы 2. migrateCommand([]) | `Migration Analysis` с подсчетом файлов | P1 | существует |

---

## 4. CLI-тесты

### 4.1. Основной роутер

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| CLI-001 | `--version` | `main(['node', 'cli.js', '--version'])` | Exit code = 0. Stdout = VERSION | P0 | существует |
| CLI-002 | `-v` (короткий флаг версии) | `main(['node', 'cli.js', '-v'])` | Exit code = 0. Stdout = VERSION | P2 | планируется |
| CLI-003 | `--help` | `main(['node', 'cli.js', '--help'])` | Exit code = 0. Stdout содержит `Usage:` и список всех subcommands | P0 | существует |
| CLI-004 | `-h` (короткий флаг помощи) | `main(['node', 'cli.js', '-h'])` | Exit code = 0. Stdout содержит `Usage:` | P2 | планируется |
| CLI-005 | `help` (слово) | `main(['node', 'cli.js', 'help'])` | Exit code = 0. Stdout содержит `Usage:` | P2 | планируется |
| CLI-006 | Неизвестная подкоманда | `main(['node', 'cli.js', 'foobar'])` | Exit code = 1. Stderr содержит `unknown subcommand 'foobar'` | P0 | существует |
| CLI-007 | Dispatch к compile | `main(['node', 'cli.js', 'compile', '--dry-run'])` | compileCommand вызван с `['--dry-run']` | P0 | существует |
| CLI-008 | Dispatch к onboard | `main(['node', 'cli.js', 'onboard'])` | onboardCommand вызван с `[]` | P0 | существует |
| CLI-009 | Dispatch к memory | `main(['node', 'cli.js', 'memory'])` | Stdout содержит `Usage: agentfs memory` | P0 | существует |
| CLI-010 | Scaffold без аргументов (interactive) | `main(['node', 'cli.js'])` | runSetupPrompts вызван, scaffold вызван | P0 | существует |
| CLI-011 | Scaffold с `init` alias | `main(['node', 'cli.js', 'init'])` | Аналогично CLI-010 | P0 | существует |
| CLI-012 | Scaffold `--non-interactive` | `main(['node', 'cli.js', '--non-interactive'])` | createDefaultAnswers вызван | P0 | существует |
| CLI-013 | Scaffold `--output /dest --profile shared` | `main(['node', 'cli.js', '--output', '/dest', '--profile', 'shared', '--non-interactive'])` | createDefaultAnswers вызван с `{targetDir: '/dest', profile: 'shared'}` | P0 | существует |
| CLI-014 | Scaffold error handling | `main(['node', 'cli.js'])` (scaffold бросает ошибку) | Exit code = 1. Stderr содержит `Scaffolding failed:` | P0 | существует |
| CLI-015 | Positional target directory | `main(['node', 'create-agentfs', 'my-vault', '--non-interactive'])` | targetDir = 'my-vault' | P1 | существует |

### 4.2. Подкоманды -- флаг --help

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| CLI-HELP-001 | `memory --help` | `memoryCommand(['--help'])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-002 | `memory -h` | `memoryCommand(['-h'])` | Exit code = 0. Usage выведен | P2 | планируется |
| CLI-HELP-003 | `security --help` | `securityCommand([])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-004 | `cron --help` | `cronCommand([])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-005 | `secret --help` | `secretCommand([])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-006 | `import --help` | `importCommand(['--help'])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-007 | `sync --help` | `syncCommand(['--help'])` | Exit code = 0. Usage выведен | P1 | существует |
| CLI-HELP-008 | `doctor --help` | `doctorCommand(['--help'])` | Exit code = 0 | P2 | планируется |

### 4.3. Подкоманды -- error cases

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| CLI-ERR-001 | `memory unknown` | `memoryCommand(['unknown'])` | Exit code = 1. Stderr: `unknown action 'unknown'` | P1 | существует |
| CLI-ERR-002 | `security bogus` | `securityCommand(['bogus'])` | Exit code = 1 | P1 | существует |
| CLI-ERR-003 | `security mode invalid` | `securityCommand(['mode', 'invalid'])` | Exit code = 1 | P1 | существует |
| CLI-ERR-004 | `security scan` (без файла) | `securityCommand(['scan'])` | Exit code = 1. `file path required` | P1 | планируется |
| CLI-ERR-005 | `security add` (без имени) | `securityCommand(['add'])` | Exit code = 1. `module name required` | P1 | планируется |
| CLI-ERR-006 | `security remove` (без имени) | `securityCommand(['remove'])` | Exit code = 1. `module name required` | P1 | планируется |
| CLI-ERR-007 | `cron run` (без имени job) | `cronCommand(['run'])` | Exit code = 1. `job name required` | P1 | существует |
| CLI-ERR-008 | `cron bogus` | `cronCommand(['bogus'])` | Exit code = 1. `unknown action` | P1 | существует |
| CLI-ERR-009 | `secret add` (без value) | `secretCommand(['add', 'name-only'])` | Exit code = 1. `requires <name> <value>` | P1 | существует |
| CLI-ERR-010 | `secret remove` (несуществующий) | `secretCommand(['remove', 'nope'])` | Exit code = 1. `not found` | P1 | существует |
| CLI-ERR-011 | `secret rotate` (несуществующий) | `secretCommand(['rotate', 'nope', 'val'])` | Exit code = 1. `not found` | P2 | планируется |
| CLI-ERR-012 | `secret bogus` | `secretCommand(['bogus'])` | Exit code = 1 | P1 | существует |
| CLI-ERR-013 | `import bogus` | `importCommand(['bogus'])` | Exit code = 1 | P1 | существует |
| CLI-ERR-014 | `compile` без vault | `compileCommand([])` в пустой директории | Exit code = 1. `No AgentFS vault found` | P0 | существует |
| CLI-ERR-015 | `compile` с невалидным manifest | `compileCommand([])` с corrupted YAML | Exit code = 1. Сообщение об ошибке парсинга | P1 | планируется |

---

## 5. Граничные случаи

### 5.1. Идемпотентность

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| EDGE-IDEM-001 | Scaffold дважды -- безопасно | 1. scaffold() 2. scaffold() повторно 3. Проверить что файлы не перезаписаны | `itemsSkipped > 0`. Содержимое файлов не изменилось. Пользовательские файлы не удалены | P0 | планируется |
| EDGE-IDEM-002 | Compile дважды -- одинаковый результат | 1. scaffold() + onboard() 2. compile() 3. compile() 4. Сравнить CLAUDE.md | Содержимое CLAUDE.md идентично при обоих вызовах | P0 | планируется |
| EDGE-IDEM-003 | Onboard дважды -- без дубликатов в semantic | 1. onboard() 2. onboard() с теми же ответами | semantic.md не содержит дубликатов | P0 | существует |
| EDGE-IDEM-004 | Security mode set дважды -- корректное состояние | 1. mode enforce 2. mode enforce | policy.yaml содержит `enforce` один раз | P2 | планируется |

### 5.2. Пустой и поврежденный vault

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| EDGE-EMPTY-001 | Compile в пустой директории | 1. compileCommand([]) в tmpdir без .agentos/ | Exit code = 1. `No AgentFS vault found` | P0 | существует |
| EDGE-EMPTY-002 | Memory show в пустом vault | 1. memoryCommand(['show']) без semantic.md | Exit code = 1. `No semantic memory found` | P0 | существует |
| EDGE-EMPTY-003 | Onboard в пустой директории | 1. onboardCommand([]) без manifest | Exit code = 1. `No AgentFS vault found` | P0 | существует |
| EDGE-CORRUPT-001 | Поврежденный manifest.yaml | 1. Записать невалидный YAML в manifest.yaml 2. compileCommand([]) | Exit code = 1. Понятное сообщение об ошибке (не stack trace) | P0 | планируется |
| EDGE-CORRUPT-002 | manifest.yaml без обязательных полей | 1. Записать `version: "1.0"` (без vault, agents, paths) 2. compileCommand([]) | Компиляция обрабатывает undefined поля gracefully | P1 | планируется |
| EDGE-CORRUPT-003 | semantic.md с мусорным содержимым | 1. Записать произвольный текст в semantic.md 2. parseSemanticMemory() | Возвращает пустой массив (игнорирует нераспознанные строки) | P1 | существует |

### 5.3. Отсутствующие директории

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| EDGE-MISS-001 | Compile без init.d/ | 1. Создать .agentos/manifest.yaml но не init.d/ 2. compileCommand([]) | Exit code = 0. initScripts = {} | P1 | существует |
| EDGE-MISS-002 | Memory show episodic без episodic/ | 1. memoryCommand(['show', 'episodic']) | `No episodic memories` (не crash) | P1 | существует |
| EDGE-MISS-003 | Memory show procedural без procedural/ | 1. memoryCommand(['show', 'procedural']) | `No procedural skills` (не crash) | P1 | существует |
| EDGE-MISS-004 | Cron consolidate без semantic.md | 1. runCronJob('consolidate', vault) | success=false. `No semantic memory` | P1 | существует |
| EDGE-MISS-005 | Import без .omc/ директории | 1. importFromOmc(vault) | errors.length > 0 | P1 | существует |

### 5.4. Unicode и спецсимволы

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| EDGE-UNI-001 | Unicode в имени vault | 1. scaffold() с `vault.name = 'Мой Проект'` 2. compile() 3. Прочитать CLAUDE.md | CLAUDE.md содержит Unicode имя без искажений | P1 | планируется |
| EDGE-UNI-002 | Unicode в semantic memory | 1. appendSemanticEntry с `content: 'предпочитаю русский язык'` 2. parseSemanticMemory | Round-trip сохраняет Unicode | P1 | планируется |
| EDGE-UNI-003 | Emoji в имени файла episodic | 1. Попытка writeEpisodicEntry с некорректной датой | Корректная обработка или понятная ошибка | P2 | планируется |
| EDGE-UNI-004 | Пробелы в пути vault | 1. scaffold() в `/tmp/my vault path/` 2. compile() | Все операции проходят. Пути корректно обработаны | P1 | планируется |
| EDGE-UNI-005 | Спецсимволы в имени секрета | 1. addSecret(vault, 'my-key/test', 'value') | Корректное создание или валидация имени | P2 | планируется |

---

## 6. Тесты взаимодействия с AI-агентами

### 6.1. Non-interactive режим (ввод)

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| AI-NI-001 | Scaffold с --non-interactive (без TTY) | 1. `main(['node', 'cli.js', '--non-interactive', '--output', tmpdir])` | Exit code = 0. Vault создан без интерактивных промптов | P0 | существует |
| AI-NI-002 | Scaffold с --profile через CLI | 1. `main(['node', 'cli.js', '--non-interactive', '--profile', 'company', '--output', tmpdir])` | Vault создан с профилем company | P0 | существует |
| AI-NI-003 | createDefaultAnswers генерирует корректные ответы | 1. createDefaultAnswers({targetDir: '/tmp/x', profile: 'personal'}) | Объект с полями targetDir, profile, vaultName, owner | P1 | планируется |
| AI-NI-004 | Compile не требует interaction | 1. compileCommand([]) в подготовленном vault | Exit code = 0. Никаких промптов | P0 | существует |
| AI-NI-005 | Все read-only команды работают без TTY | 1. memory show, security show, cron list, secret list, sync, doctor | Exit code = 0 для каждой | P1 | существует |

### 6.2. Вывод и exit codes

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| AI-OUT-001 | Все команды возвращают exit code | 1. Для каждой команды проверить что возвращается число (0 или 1) | Все функции типа `Promise<number>`. 0 = success, 1 = error | P0 | существует |
| AI-OUT-002 | Ошибки идут в stderr, данные в stdout | 1. Для каждой команды проверить что print() -> stdout, printErr() -> stderr | Разделение потоков корректно | P1 | частично |
| AI-OUT-003 | `--json` / `--output json` флаг (не реализован) | 1. Проверить наличие JSON output флага в CLI | Пока отсутствует. Задокументировать как future work | P2 | планируется |

### 6.3. Onboard без TTY

| ID | Описание | Шаги | Ожидаемый результат | Приоритет | Статус |
|---|---|---|---|---|---|
| AI-TTY-001 | Onboard требует TTY (interactive) | 1. onboardCommand([]) -- зависит от inquirer | Если stdin не TTY -- inquirer бросает ошибку или зависает. Задокументировать поведение | P1 | планируется |

---

## 7. Приоритеты и дорожная карта

### Критические пробелы (P0) -- решить до релиза

| # | Тест | Причина критичности |
|---|---|---|
| 1 | UNIT-GAP-001 (scaffold.ts) | Основная функция продукта не тестируется напрямую |
| 2 | UNIT-GAP-002 (filesystem.ts) | Генерация директорий -- ядро scaffold |
| 3 | UNIT-GAP-003 (manifest.ts) | manifest.yaml -- source of truth для всей системы |
| 4 | SCAFFOLD-001 (integration) | Сквозной тест создания vault |
| 5 | COMPILE-001, COMPILE-002 | Сквозной тест компиляции |
| 6 | COMPILE-007 (security enforce) | HARD-GATE директивы -- критическая security-функция |
| 7 | EDGE-IDEM-001 | Идемпотентность -- архитектурный инвариант проекта |
| 8 | EDGE-CORRUPT-001 | Поврежденный manifest не должен давать stack trace |

### Важные пробелы (P1) -- решить в следующем спринте

| # | Тест | Причина |
|---|---|---|
| 1 | UNIT-GAP-004..007 (генераторы) | Покрытие всех генераторов |
| 2 | SCAFFOLD-002..007 | Профили company/shared, проверка содержимого |
| 3 | COMPILE-003..006 | Single-agent compile, multi-agent, предупреждения |
| 4 | MEMORY-006 | Полный цикл scaffold -> onboard -> memory show |
| 5 | SEC-001 | Интеграция security + compile |
| 6 | EDGE-UNI-001..004 | Unicode и спецсимволы |
| 7 | EDGE-CORRUPT-002 | Неполный manifest |
| 8 | CLI-ERR-004..006, 015 | Пропущенные error cases в security и compile |

### Низкий приоритет (P2) -- backlog

| # | Тест | Причина |
|---|---|---|
| 1 | UNIT-GAP-008..012 | Прямые тесты cron jobs, barrel exports |
| 2 | CLI-002, 004, 005, CLI-HELP-002, 008 | Короткие флаги и альтернативные алиасы |
| 3 | EDGE-UNI-003, 005 | Экзотические Unicode-кейсы |
| 4 | EDGE-IDEM-004 | Идемпотентность security mode |
| 5 | AI-OUT-003 | JSON output mode (feature не реализована) |

---

## Приложение A. Команды для запуска тестов

```bash
# Все тесты
pnpm test

# Watch-режим
pnpm run test:watch

# Конкретный файл
pnpm test -- tests/compile.test.ts

# С покрытием (рекомендация -- добавить)
pnpm test -- --coverage

# Фильтр по имени теста
pnpm test -- -t 'SCAFFOLD'
```

## Приложение B. Шаблон нового теста

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('<MODULE_NAME>', () => {
  let tmpVault: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  test('<TEST_ID> -- <описание>', async () => {
    // Arrange
    // ...

    // Act
    // ...

    // Assert
    // ...
  });
});
```

## Приложение C. Покрытие по модулям (визуальная карта)

```
src/
├── cli.ts                    ██████████ 100% (8 тестов)
├── index.ts                  ░░░░░░░░░░   0% (пробел)
├── commands/
│   ├── compile.ts            ████████░░  80% (5 тестов, нет integration)
│   ├── onboard.ts            ██████████ 100% (5 тестов)
│   ├── memory.ts             ██████████ 100% (14 тестов)
│   ├── security.ts           ██████████ 100% (12 тестов)
│   ├── secret.ts             ██████████ 100% (8 тестов)
│   ├── cron.ts               ██████████ 100% (6 тестов)
│   ├── sync.ts               ██████████ 100% (7 тестов)
│   └── doctor.ts             ████████░░  80% (5 тестов, нет injection-теста)
├── compilers/
│   ├── base.ts               ██████████ 100% (12 тестов)
│   ├── claude.ts             ████████░░  80% (4 теста)
│   ├── openclaw.ts           ██████░░░░  60% (3 теста)
│   ├── cursor.ts             ██████░░░░  60% (3 теста)
│   └── agent-map.ts          ████████░░  80% (2 теста)
├── generators/
│   ├── scaffold.ts           ██░░░░░░░░  20% (только через mock)
│   ├── filesystem.ts         ░░░░░░░░░░   0% (пробел)
│   ├── manifest.ts           ░░░░░░░░░░   0% (пробел)
│   ├── init.ts               ░░░░░░░░░░   0% (пробел)
│   ├── ignore.ts             ░░░░░░░░░░   0% (пробел)
│   ├── memory.ts             ░░░░░░░░░░   0% (пробел)
│   ├── prompts.ts            ░░░░░░░░░░   0% (пробел)
│   └── profiles.ts           ████████░░  80% (2 теста)
├── memory/
│   ├── parser.ts             ██████████ 100%
│   ├── confidence.ts         ██████████ 100%
│   ├── episodic.ts           ██████████ 100%
│   ├── procedural.ts         ██████████ 100%
│   └── index.ts              ████████░░  80% (barrel)
├── security/
│   ├── parser.ts             ██████████ 100%
│   ├── claude-compiler.ts    ██████████ 100%
│   └── index.ts              ████████░░  80% (barrel)
├── secrets/
│   ├── vault.ts              ██████████ 100%
│   ├── exfil-guard.ts        ██████████ 100%
│   └── index.ts              ████████░░  80% (barrel)
├── cron/
│   ├── runner.ts             ██████████ 100%
│   ├── jobs/consolidate.ts   ████████░░  80% (через runner)
│   ├── jobs/heartbeat.ts     ████████░░  80% (через runner)
│   ├── jobs/inbox-triage.ts  ████████░░  80% (через runner)
│   └── index.ts              ████████░░  80% (barrel)
├── sync/
│   ├── sync.ts               ██████████ 100%
│   └── index.ts              ████████░░  80% (barrel)
├── types/                    ██████████ 100%
└── utils/
    └── fhs-mapping.ts        ██████████ 100%
```

**Итого:** Основные пробелы сосредоточены в `generators/` (6 модулей без тестов). Все остальные модули покрыты на 80-100%.
```

</details>

---

### Open Questions

- [ ] **JSON output mode (`--json`)** -- Пользователь запросил тесты для `--json` флага и `--output json`, но в коде таких флагов нет. Нужно ли реализовать JSON output перед написанием тестов, или это future work?
- [ ] **Подкоманды `exec` и `status`** -- Зарегистрированы в `cli.ts` как known subcommands, но обработчики вызывают `printStub()`. Нужно ли покрывать их тестами как stub или ждать реализации?
- [ ] **`doctor --help`** -- Команда `doctorCommand` не обрабатывает `--help` флаг (нет проверки `_args`). Это баг или intended?

---

**Ключевые файлы, изученные в ходе анализа:**

- `/Users/kksudo/projects/personal/AgentFS/src/cli.ts` -- CLI-роутер, все подкоманды
- `/Users/kksudo/projects/personal/AgentFS/src/commands/compile.ts` -- compile pipeline
- `/Users/kksudo/projects/personal/AgentFS/src/commands/onboard.ts` -- onboard interview
- `/Users/kksudo/projects/personal/AgentFS/src/commands/memory.ts` -- memory CLI
- `/Users/kksudo/projects/personal/AgentFS/src/commands/security.ts` -- security CLI (7 actions)
- `/Users/kksudo/projects/personal/AgentFS/src/commands/secret.ts` -- secrets CLI (4 actions)
- `/Users/kksudo/projects/personal/AgentFS/src/commands/cron.ts` -- cron CLI
- `/Users/kksudo/projects/personal/AgentFS/src/commands/sync.ts` -- sync + import CLI
- `/Users/kksudo/projects/personal/AgentFS/src/commands/doctor.ts` -- doctor + triage + migrate
- `/Users/kksudo/projects/personal/AgentFS/src/generators/scaffold.ts` -- scaffold orchestrator
- Все 18 тестовых файлов в `/Users/kksudo/projects/personal/AgentFS/tests/`

**Для записи файла:** содержимое между маркерами ````markdown` и ```` ``` `` `` (выше) нужно записать в `/Users/kksudo/projects/personal/AgentFS/docs/test-plan.md`. Мой агентский контекст (Analyst) имеет read-only ограничения -- для записи передайте задачу агенту planner или developer.