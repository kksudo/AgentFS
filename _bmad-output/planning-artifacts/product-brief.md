---
title: "Product Brief: AgentFS"
type: product-brief
status: draft
created: 2026-04-04
project: AgentFS
---

# Product Brief: AgentFS

## Executive Summary

AgentFS — CLI-инструмент (`npx create-agentfs`), который разворачивает Obsidian vault как файловую операционную систему для AI-агентов. Скрытая директория `.agentos/` действует как ядро — единый source of truth для идентичности агента, памяти, политики безопасности и структуры vault. Compile pipeline транслирует этот canonical state в нативные форматы каждого агента (CLAUDE.md, .cursorrules, .omc/).

Проблема, которую мы решаем: каждый AI-агент (Claude Code, Cursor, OpenClaw) хранит конфиги в своём формате. При работе с несколькими агентами на одном vault — идентичность, правила и память дублируются в трёх местах. При смене агента — всё с нуля. Нет персистентной памяти между сессиями. Нет политики безопасности. Агент стартует каждую сессию как чужой в собственном vault.

AgentFS решает это через три слоя (как в Linux): User Space (vault/) → Native Runtimes (.claude/, .omc/) → Kernel Space (.agentos/). Пять правил Unix адаптированы под агентов: всё есть файл, делай одно и хорошо, программы работают вместе, текст — универсальный интерфейс, нет captive UI.

## Проблема

**Кто страдает:** инженеры, builders, content creators, использующие AI-агентов для работы с Obsidian vault или рабочими проектами.

**Конкретные боли:**

1. **Дублирование конфигов.** Claude читает CLAUDE.md + .claude/settings.json. OpenClaw — .omc/project-memory.json. Cursor — .cursorrules. Одна и та же идентичность, правила, предпочтения — поддерживаются в 3+ местах.

2. **Нет памяти между сессиями.** Агент каждую сессию начинает с нуля. Выученные паттерны, предпочтения, факты о проекте — теряются. Пользователь повторяет одно и то же.

3. **Нет безопасности.** Агент имеет доступ ко всему в vault. API-ключи, приватные заметки, credentials — всё в открытом контексте. Три вектора утечки: READ (прочитал секрет), LEAK (отправил в LLM cloud), EXFIL (вставил в ответ/запрос).

4. **Vendor lock-in.** Смена агента = начало с нуля. Нет способа перенести identity, память и правила между Claude и Cursor.

**Как справляются сейчас:** вручную копируют правила между конфигами, теряют контекст между сессиями, держат секреты "на доверии". Конкурентные решения (obsidian-copilot, agent-os) либо завязаны на конкретный агент, либо требуют базу данных/облако.

## Решение

AgentFS добавляет kernel layer к vault: `.agentos/` — source of truth в plain markdown + YAML. Compile pipeline (`agentfs compile`) транслирует canonical state в нативный формат каждого агента.

**Ключевые компоненты:**

- **Kernel Space (.agentos/):** manifest.yaml, init.d/ (boot sequence), memory/ (Tulving's taxonomy: semantic/episodic/procedural), security/ (AppArmor-style policy), cron.d/ (scheduled jobs), compile.d/ (per-agent drivers)
- **Boot Sequence:** SysVinit runlevels 0-6 с progressive disclosure (~10x экономия токенов — только semantic memory при загрузке)
- **Memory System:** три типа по Tulving — semantic (факты, всегда загружается), episodic (события, lazy), procedural (навыки, lazy). Confidence scoring с decay.
- **Security Model:** 5 уровней защиты — от git hygiene до encryption at rest. AppArmor profiles компилируются в реальные deny-правила Claude Code.
- **Compile Pipeline:** write once → compile to all. Один source of truth → CLAUDE.md, .cursorrules, .omc/ автоматически.

**Три профиля vault:** personal (solo engineer), company (team с RBAC), shared (multi-user).

## Что делает нас другими

1. **Файловая система, а не фреймворк.** Никаких баз данных, API, облака. Markdown + YAML + файлы. `cat` и `grep` достаточно.
2. **Agent-agnostic.** Один source of truth компилируется в любой нативный формат. Поменял агента — перекомпилировал, vault тот же.
3. **Реальный security enforcement.** Не advisory текст, а реальные deny-правила в .claude/settings.json. AppArmor-style profiles с compile в нативные механизмы.
4. **Когнитивная модель памяти.** Tulving's taxonomy (не ad-hoc key-value), confidence scoring, decay, progressive disclosure.
5. **Linux FHS mapping.** Vault директории маппятся на Linux filesystem hierarchy — знакомая метафора для инженеров.
6. **Idempotent.** `create-agentfs` на существующий vault — безопасно. Никогда не перезаписывает пользовательские файлы.

**Unfair advantage:** прямой аналог с Linux (ядро + драйверы + user space) — архитектура проверена десятилетиями. Конкуренты либо agent-specific (obsidian-copilot), либо требуют runtime/cloud (agent-os), либо lint-only (agnix).

## Кто наши пользователи

**Primary:** технические пользователи (инженеры, builders), которые:
- Используют 2+ AI-агента на одном workspace/vault
- Ведут knowledge base в Obsidian или plain markdown
- Ценят control и ownership над своими данными
- Знакомы с CLI workflow

**Secondary:**
- Команды с shared knowledge base (company profile)
- Content creators с multi-platform pipeline
- Security-conscious пользователи AI-агентов

**Что означает успех для пользователя:** один source of truth для всех агентов. Память сохраняется между сессиями. Секреты защищены. Смена агента — одна команда.

## Критерии успеха

| Метрика | Цель |
|---------|------|
| Время от `npx create-agentfs` до работающего vault | < 5 минут |
| Количество поддерживаемых агентов (compile drivers) | 3+ (Claude, Cursor, OpenClaw) |
| Токен-экономия при boot (progressive disclosure) | ~10x vs loading everything |
| Vault работает без AgentFS | 100% (plain markdown, cat/grep) |
| Идемпотентность на существующем vault | 100% (никогда не перезаписывает user files) |
| npm weekly downloads (Phase 11) | 500+ |

## Scope

### V1 (MVP — Phase 2):
- `npx create-agentfs` — interactive setup, personal profile
- `.agentos/` kernel space: manifest.yaml, init.d/, memory/ (semantic only)
- `compile.d/claude` — manifest → CLAUDE.md + AGENT-MAP.md
- FHS-mapped directory structure

### V1.5 (Phase 2.5):
- `agentfs onboard` — agent-led interview → identity + memory bootstrap

### Explicitly OUT of V1:
- Company и Shared profiles (Phase 9)
- Security model / AppArmor (Phase 5)
- Secrets vault / SOPS (Phase 6)
- compile.d/openclaw, compile.d/cursor (Phase 8)
- Community publishing (Phase 11)

## Vision

Если AgentFS успешен, через 2-3 года:

- **Стандарт де-факто** для agent-agnostic vault configuration. Как .editorconfig, но для AI-агентов.
- **Security module marketplace** — community-contributed AppArmor profiles для разных доменов (crypto, web, infra, ci-cd).
- **Plugin ecosystem** — npm-пакеты `agentfs-module-{name}` для кастомных модулей vault.
- **Multi-vault sync** — агент переносит learned patterns между проектами.
- **Enterprise adoption** — company/shared profiles с RBAC, audit trail, compliance.

Ключевой принцип остаётся: **всё есть файл, vault работает без AgentFS, агент заменяем.**
