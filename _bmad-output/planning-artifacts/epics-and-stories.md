---
stepsCompleted: [validate-prerequisites, design-epics, create-stories, final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - docs/architecture.md
title: "Epics & Stories: AgentFS"
status: draft
created: 2026-04-04
project: AgentFS
---

# AgentFS — Epic Breakdown

## Overview

Декомпозиция требований AgentFS PRD и Architecture в реализуемые epics и stories. Epics соответствуют фазам roadmap, stories следуют порядку зависимостей.

## Requirements Inventory

### Functional Requirements

- FR-1: CLI Scaffolding (create-agentfs) — 10 requirements
- FR-2: Compile Pipeline (agentfs compile) — 10 requirements
- FR-3: Memory System — 8 requirements
- FR-4: Cron Jobs — 4 requirements
- FR-5: Security — 7 requirements
- FR-6: Secrets Management — 4 requirements
- FR-7: Sync & Import — 3 requirements
- FR-8: Onboarding — 3 requirements
- FR-9: Migration — 3 requirements
- FR-10: Doctor / Health Check — 3 requirements

### Non-Functional Requirements

- NFR-1: Performance (compile < 2s, init < 10s)
- NFR-2: Portability (cross-platform, no runtime deps beyond Node.js)
- NFR-3: Safety (idempotent, no data loss)
- NFR-4: Extensibility (driver pattern, composable modules)
- NFR-5: Security (no secrets in plaintext)
- NFR-6: Code Quality (TypeScript strict, >80% coverage)

### FR Coverage Map

| Epic | FRs Covered |
|------|------------|
| Epic 1: Project Bootstrap | NFR-6, setup |
| Epic 2: CLI Scaffolding | FR-1.1–FR-1.10 |
| Epic 3: Compile Pipeline | FR-2.1–FR-2.8 |
| Epic 4: Onboarding | FR-8.1–FR-8.3 |
| Epic 5: Memory System | FR-3.1–FR-3.8 |
| Epic 6: Cron Jobs | FR-4.1–FR-4.4 |
| Epic 7: Security | FR-5.1–FR-5.7 |
| Epic 8: Secrets | FR-6.1–FR-6.4 |
| Epic 9: Sync | FR-7.1–FR-7.3 |
| Epic 10: Multi-Agent | FR-2.9–FR-2.10 |
| Epic 11: Profiles | FR-1.7 (company, shared) |
| Epic 12: Full CLI | FR-9, FR-10 |
| Epic 13: Community | npm publish, docs |

## Epic List

| # | Epic | Phase | Priority | Stories |
|---|------|-------|----------|---------|
| 1 | Project Bootstrap | Pre-2 | Must | 4 |
| 2 | CLI Scaffolding (create-agentfs) | 2 | Must | 7 |
| 3 | Compile Pipeline | 2 | Must | 6 |
| 4 | Onboarding | 2.5 | Must | 3 |
| 5 | Memory System | 3 | Must | 5 |
| 6 | Cron Jobs | 4 | Should | 4 |
| 7 | Security Model | 5 | Should | 5 |
| 8 | Secrets Vault | 6 | Should | 4 |
| 9 | Sync & Import | 7 | Should | 3 |
| 10 | Multi-Agent Drivers | 8 | Could | 3 |
| 11 | Company & Shared Profiles | 9 | Could | 3 |
| 12 | Full CLI (Doctor, Migrate, Triage) | 10 | Could | 4 |
| 13 | Community & Publish | 11 | Could | 3 |

---

## Epic 1: Project Bootstrap

**Цель:** Инициализировать TypeScript проект с базовой инфраструктурой для разработки.

### Story 1.1: Initialize TypeScript project

As a developer,
I want a properly configured TypeScript project,
So that I can start implementing AgentFS with type safety and tests.

**Acceptance Criteria:**

**Given** empty project directory
**When** I run `npm init` and configure TypeScript
**Then** `package.json` создан с name `create-agentfs`, bin entry, и dependencies
**And** `tsconfig.json` настроен в strict mode, target ES2022, module NodeNext
**And** Jest настроен для TypeScript tests
**And** eslint настроен

### Story 1.2: Create CLI entry point

As a developer,
I want a working CLI entry point,
So that `npx create-agentfs` launches the tool.

**Acceptance Criteria:**

**Given** configured TypeScript project
**When** I run `npx create-agentfs`
**Then** CLI запускается и показывает welcome message
**And** `src/cli.ts` содержит main entry с arg parsing
**And** bin field в package.json указывает на compiled entry

### Story 1.3: Define core types and interfaces

As a developer,
I want TypeScript interfaces for Manifest, CompileContext, CompileResult,
So that all modules use consistent type contracts.

**Acceptance Criteria:**

**Given** CLI entry point exists
**When** I import types from `src/types/`
**Then** Manifest interface matches manifest.yaml schema
**And** AgentCompiler interface определяет compile contract
**And** Profile type = 'personal' | 'company' | 'shared'

### Story 1.4: Create FHS mapping utility

As a developer,
I want a utility that maps Linux FHS paths to vault directories,
So that generators can create correct directory structures.

**Acceptance Criteria:**

**Given** a profile type and manifest paths config
**When** I call `fhsMapping.resolve(profile, paths)`
**Then** returns correct vault directory mapping (Inbox→/tmp, Daily→/var/log, etc.)
**And** all 16 FHS mappings from architecture doc are supported

### Story 1.5: Project Agent Instructions (Dogfooding)

As a maintainer,
I want explicit instructions for AI agents working on this project (CLAUDE.md, .cursorrules),
So that any agent developing AgentFS understands the architecture and how to test/deploy it.

**Acceptance Criteria:**

**Given** the AgentFS codebase
**When** an AI agent reads the project instructions
**Then** the agent knows how to run `npm run dev`, how to test the CLI locally, and how to compile the TS code
**And** `CLAUDE.md` and `.cursorrules` are updated from Phase 1 (Specification) to Phase 2 (Implementation)

### Story 1.6: BMAD Developer Skills

As a BMAD agent,
I want dedicated BMAD skills in `_bmad/skills/`,
So that I can automate the AgentFS testing, compilation, and scaffold validation workflows.

**Acceptance Criteria:**

**Given** the BMAD framework in the repository
**When** I need to test scaffolding or compiling
**Then** `_bmad/skills/scaffold-vault.md` exists to test `create-agentfs` in a tmp folder
**And** `_bmad/skills/run-compile.md` exists to validate the pipeline output

---


## Epic 2: CLI Scaffolding (create-agentfs)

**Цель:** Реализовать интерактивный scaffold, создающий полную структуру vault с kernel space.

### Story 2.1: Interactive setup prompts

As a user,
I want interactive prompts during `npx create-agentfs`,
So that I can configure my vault name, profile, and agents.

**Acceptance Criteria:**

**Given** I run `npx create-agentfs`
**When** prompts appear
**Then** I can set vault name, owner name, profile (personal/company/shared), primary agent, supported agents
**And** defaults are sensible (profile=personal, agent=claude)
**And** answers are validated (non-empty name, valid profile)

### Story 2.2: Generate filesystem structure

As a user,
I want `create-agentfs` to create all vault directories,
So that my vault has correct FHS-mapped structure.

**Acceptance Criteria:**

**Given** completed interactive setup with personal profile
**When** scaffold runs
**Then** all FHS directories created (Inbox/, Daily/, Tasks/, Projects/, Content/, Knowledge/, People/, Archive/, assets/)
**And** `.agentos/` kernel space created (init.d/, compile.d/, security/, cron.d/, proc/, memory/, hooks/, bin/)
**And** no existing files overwritten (idempotent)

### Story 2.3: Generate manifest.yaml

As a user,
I want a manifest.yaml generated from my setup answers,
So that the kernel has its source of truth.

**Acceptance Criteria:**

**Given** user answered setup prompts
**When** scaffold generates manifest
**Then** `.agentos/manifest.yaml` created with version, profile, vault info, agents config, paths mapping, boot sequence, frontmatter standards
**And** paths match FHS mapping for chosen profile

### Story 2.4: Generate init.d/ boot scripts

As a user,
I want boot scripts generated in init.d/,
So that agents know how to initialize context.

**Acceptance Criteria:**

**Given** manifest.yaml exists
**When** scaffold generates init scripts
**Then** `init.d/00-identity.md` created with owner, role, agent rules
**And** `init.d/10-memory.md` created with memory bootstrap instructions
**And** `init.d/20-today.md` created with daily note loading
**And** `init.d/30-projects.md` created with project loading
**And** each script references correct vault paths from manifest

### Story 2.5: Generate .gitignore and .agentignore

As a user,
I want proper ignore files generated,
So that runtime state and secrets are protected.

**Acceptance Criteria:**

**Given** scaffold runs
**When** ignore files generated
**Then** `.gitignore` includes `.agentos/proc/`, `.agentos/secrets/decrypted/`, `.claude/sessions/`, `.omc/sessions/`, `.omc/state/`
**And** `.agentignore` includes `.agentos/secrets/`, `**/.env`, `**/*.key`, `**/*credentials*`, `**/*token*`
**And** existing entries in `.gitignore` are preserved (not duplicated)

### Story 2.6: Initialize memory system

As a user,
I want initial memory files created,
So that the memory system is ready for use.

**Acceptance Criteria:**

**Given** scaffold runs
**When** memory initialized
**Then** `.agentos/memory/semantic.md` created with header and empty sections (PREF, FACT, PATTERN, AVOID)
**And** `.agentos/memory/episodic/` directory created
**And** `.agentos/memory/procedural/` directory created
**And** `.agentos/memory/corrections.md` created with header

### Story 2.7: Idempotent re-run safety

As a user,
I want to safely re-run `create-agentfs` on an existing vault,
So that my files are never overwritten.

**Acceptance Criteria:**

**Given** vault already has `.agentos/` and user content
**When** I run `npx create-agentfs` again
**Then** missing directories created, existing skipped
**And** user-modified files NOT overwritten (manifest.yaml, init.d/ scripts, memory/)
**And** summary shows what was created vs skipped

---

## Epic 3: Compile Pipeline

**Цель:** Реализовать трансляцию kernel space в нативные форматы агентов.

### Story 3.1: Abstract compiler interface

As a developer,
I want a base compiler interface,
So that all agent drivers follow the same contract.

**Acceptance Criteria:**

**Given** compiler module
**When** I create a new agent driver
**Then** I implement AgentCompiler interface (name, compile, supports)
**And** base.ts provides shared utilities (read manifest, load templates, write output)

### Story 3.2: Claude compiler driver

As a user,
I want `agentfs compile claude` to generate CLAUDE.md,
So that Claude Code gets my identity, rules, and memory.

**Acceptance Criteria:**

**Given** `.agentos/` with manifest, init.d, memory
**When** I run `agentfs compile claude`
**Then** CLAUDE.md generated in vault root from template
**And** sections include: identity, vault rules, folder structure, frontmatter, known issues (from corrections.md)
**And** modules (career, content, etc.) inject their sections
**And** existing CLAUDE.md is overwritten (compiled output)

### Story 3.3: AGENT-MAP.md generator

As a user,
I want AGENT-MAP.md generated from manifest,
So that agents have a human-readable vault index.

**Acceptance Criteria:**

**Given** manifest.yaml with paths and modules
**When** compile runs
**Then** AGENT-MAP.md generated with vault name, profile, directory mapping table, boot sequence, active modules, memory locations

### Story 3.4: Handlebars template system

As a developer,
I want Handlebars templates for all compiled outputs,
So that output format is separated from compile logic.

**Acceptance Criteria:**

**Given** templates/ directory
**When** compiler loads template
**Then** `claude.md.hbs` renders CLAUDE.md with manifest data
**And** `agent-map.md.hbs` renders AGENT-MAP.md
**And** custom helpers available (dateFormat, pathResolve, etc.)

### Story 3.5: Compile CLI command

As a user,
I want `agentfs compile [agent] [--dry-run]` command,
So that I can compile on demand with preview.

**Acceptance Criteria:**

**Given** valid `.agentos/` kernel
**When** I run `agentfs compile`
**Then** all supported agents compiled
**When** I run `agentfs compile claude`
**Then** only Claude output compiled
**When** I run `agentfs compile --dry-run`
**Then** changes shown but not written to disk

### Story 3.6: Ownership protection

As a user,
I want compile to never overwrite my agent settings,
So that my manual configurations are preserved.

**Acceptance Criteria:**

**Given** existing `.claude/settings.json` with user settings
**When** compile runs
**Then** CLAUDE.md overwritten (compiled output)
**And** `.claude/settings.json` NOT modified (user-owned)
**And** `.claude/sessions/` NOT touched
**And** `.obsidian/` NOT touched

---

## Epic 4: Onboarding

**Цель:** Реализовать agent-led interview для заполнения identity и memory.

### Story 4.1: Onboard CLI command

As a user,
I want `agentfs onboard` to start an interactive interview,
So that my agent learns about me through conversation.

**Acceptance Criteria:**

**Given** `.agentos/` exists
**When** I run `agentfs onboard`
**Then** agent asks questions: name, role, style preferences, tech stack, what to avoid
**And** answers are formatted for agent consumption

### Story 4.2: Populate identity from interview

As a user,
I want interview answers to populate init.d/00-identity.md,
So that my agent knows who I am.

**Acceptance Criteria:**

**Given** completed onboard interview
**When** identity file generated
**Then** `init.d/00-identity.md` contains owner name, role, communication style, agent rules
**And** existing manual edits in identity are preserved (merge, not overwrite)

### Story 4.3: Populate semantic memory from interview

As a user,
I want interview answers to populate memory/semantic.md,
So that my agent remembers my preferences and facts.

**Acceptance Criteria:**

**Given** completed onboard interview
**When** semantic memory updated
**Then** PREF entries added for style preferences
**And** FACT entries added for tech stack, role
**And** AVOID entries added for "what not to do"
**And** existing entries preserved (append, not overwrite)

---

## Epic 5: Memory System

**Цель:** Реализовать полную систему памяти по таксономии Tulving.

### Story 5.1: Semantic memory format and parser

As a developer,
I want a parser for semantic.md format,
So that compile pipeline can extract and inject memory entries.

**Acceptance Criteria:**

**Given** semantic.md with PREF, FACT, PATTERN, AVOID entries
**When** parser reads the file
**Then** returns structured data with type, content, status (active/superseded), confidence
**And** supports immutable append pattern

### Story 5.2: Confidence scoring engine

As a developer,
I want confidence scoring for PATTERN entries,
So that patterns have measurable reliability.

**Acceptance Criteria:**

**Given** a PATTERN entry with confidence score
**When** confirmed → confidence += 0.2 (max 1.0)
**When** denied → confidence -= 0.3
**When** inactive 30 days → confidence -= 0.1
**When** confidence < 0.1 → marked as [superseded]

### Story 5.3: Episodic memory writer

As a developer,
I want episodic memory creation per date,
So that session events are recorded chronologically.

**Acceptance Criteria:**

**Given** end of agent session
**When** consolidation writes episodic entry
**Then** `episodic/YYYY-MM-DD.md` created/appended with timestamp, events, decisions, lessons

### Story 5.4: Procedural memory writer

As a developer,
I want procedural memory creation per skill,
So that learned workflows are reusable.

**Acceptance Criteria:**

**Given** agent learns a new procedure (>2 times same workflow)
**When** procedural memory created
**Then** `procedural/{skill-name}.md` created with steps, context, examples

### Story 5.5: Memory CLI commands

As a user,
I want `agentfs memory show` and `agentfs memory consolidate`,
So that I can inspect and manage memory.

**Acceptance Criteria:**

**Given** populated memory system
**When** I run `agentfs memory show`
**Then** semantic memory displayed with confidence scores
**When** I run `agentfs memory consolidate`
**Then** manual consolidation runs (same as on-session-end)

---

## Epic 6: Cron Jobs

**Цель:** Реализовать scheduled tasks для memory maintenance.

### Story 6.1: Memory consolidation (on-session-end)

As a user,
I want automatic memory snapshot at session end,
So that new facts and patterns are preserved.

**Acceptance Criteria:**

**Given** agent session ending
**When** consolidation runs
**Then** new facts extracted → semantic.md
**And** contradictions → old marked [superseded], new appended
**And** new skills → procedural/{skill}.md
**And** episode → episodic/{date}.md
**And** errors → corrections.md

### Story 6.2: Distillation (batch analysis)

As a user,
I want periodic deep analysis of episodic memory,
So that cross-session patterns are discovered.

**Acceptance Criteria:**

**Given** episodic memory accumulated over multiple sessions
**When** distillation runs (every 2 days)
**Then** repeated patterns → confidence increased
**And** contradictions → AVOID created or PATTERN superseded
**And** repeated workflows → procedural skill created
**And** semantic.md deduplicated

### Story 6.3: Inbox triage

As a user,
I want Inbox/ files classified and routed,
So that new notes find their proper location.

**Acceptance Criteria:**

**Given** files in Inbox/ with frontmatter
**When** triage runs
**Then** target folder suggested based on tags/stream
**And** NO automatic move (suggestions only)

### Story 6.4: Heartbeat status

As a developer,
I want periodic status update in proc/,
So that runtime state is observable.

**Acceptance Criteria:**

**Given** agent session active
**When** heartbeat runs (every 30 min)
**Then** `.agentos/proc/status.md` updated with uptime, current task
**And** overdue tasks checked in Tasks/

---

## Epic 7: Security Model

**Цель:** Реализовать AppArmor-style security с real enforcement.

### Story 7.1: Policy parser

As a developer,
I want policy.yaml parsed into security model,
So that compile can generate native enforcement rules.

**Acceptance Criteria:**

**Given** `security/policy.yaml` with file_access, input_validation, network, commands
**When** parser processes it
**Then** returns structured SecurityPolicy with deny/allow/ask rules per path pattern

### Story 7.2: Claude AppArmor compiler

As a user,
I want policy compiled to .claude/settings.json permissions,
So that Claude Code has real deny rules.

**Acceptance Criteria:**

**Given** parsed SecurityPolicy
**When** `agentfs compile security` runs
**Then** `.claude/settings.json` `permissions.deny[]` populated with Read/Write deny rules
**And** `permissions.ask[]` populated with ask_write paths
**And** existing user settings in settings.json preserved

### Story 7.3: Input validation scanner

As a developer,
I want prompt injection pattern scanning,
So that malicious content is detected.

**Acceptance Criteria:**

**Given** input_validation patterns in policy.yaml
**When** file is read by agent
**Then** content scanned for injection patterns
**And** action taken per policy: warn / quarantine / block

### Story 7.4: Composable security modules

As a user,
I want `agentfs security add crypto` to add domain rules,
So that I can layer security per domain.

**Acceptance Criteria:**

**Given** base policy.yaml
**When** I run `agentfs security add crypto`
**Then** crypto.yaml rules merged into policy
**And** `agentfs security remove crypto` removes them
**And** `agentfs security list` shows active modules

### Story 7.5: Security mode management

As a user,
I want `agentfs security mode enforce|complain|disabled`,
So that I can control enforcement level.

**Acceptance Criteria:**

**Given** policy.yaml with default_mode
**When** I run `agentfs security mode enforce`
**Then** policy.yaml updated, recompile triggered
**When** mode is `complain`
**Then** violations logged but not blocked
**When** mode is `disabled`
**Then** no security rules applied

---

## Epic 8: Secrets Vault

**Цель:** Реализовать encrypted secrets с reference-only access.

### Story 8.1: SOPS/age integration

As a user,
I want secrets encrypted at rest with SOPS/age,
So that API keys and credentials are never in plaintext.

**Acceptance Criteria:**

**Given** age keypair generated
**When** I run `agentfs secret add github-token`
**Then** value encrypted in `.agentos/secrets/vault.yaml` via SOPS
**And** reference added to `refs.yaml`
**And** agent sees only `${{secret:github-token}}`, never raw value

### Story 8.2: Secret CLI commands

As a user,
I want `agentfs secret add|remove|list|rotate`,
So that I can manage secrets easily.

**Acceptance Criteria:**

**Given** SOPS configured
**When** `secret add` → encrypts and stores
**When** `secret remove` → deletes entry
**When** `secret list` → shows names (not values)
**When** `secret rotate` → re-encrypts with new value

### Story 8.3: Exec with secrets proxy

As a user,
I want `agentfs exec --with-secrets <cmd>`,
So that commands get secrets as environment variables.

**Acceptance Criteria:**

**Given** encrypted secrets exist
**When** I run `agentfs exec --with-secrets deploy.sh`
**Then** secrets decrypted to env vars for child process only
**And** decrypted values never written to disk
**And** process exit → env vars gone

### Story 8.4: Exfiltration guard

As a developer,
I want regex-based exfiltration detection,
So that secrets don't leak in agent output.

**Acceptance Criteria:**

**Given** deny_exfil_patterns in policy.yaml
**When** agent output matches pattern (API key, JWT, private key)
**Then** warning raised
**And** violation logged in audit/violations.log

---

## Epic 9: Sync & Import

**Цель:** Реализовать bidirectional синхронизацию между canonical и native formats.

### Story 9.1: Memory import from native

As a user,
I want `agentfs import memory` to pull facts from agent native stores,
So that agent-learned knowledge comes back to canonical.

**Acceptance Criteria:**

**Given** `.omc/project-memory.json` has new facts
**When** I run `agentfs import memory`
**Then** new entries added to semantic.md
**And** duplicates skipped
**And** canonical source always wins on conflicts

### Story 9.2: Drift detection

As a user,
I want `agentfs sync` to detect differences between manifest and compiled outputs,
So that I know when manual edits need reconciliation.

**Acceptance Criteria:**

**Given** CLAUDE.md was manually edited after compile
**When** I run `agentfs sync`
**Then** diff shown between current CLAUDE.md and what compile would generate
**And** user offered to update manifest or recompile

### Story 9.3: Bidirectional OpenClaw memory sync

As a user,
I want memory synchronized between canonical and .omc/,
So that OpenClaw and Claude share the same knowledge.

**Acceptance Criteria:**

**Given** both semantic.md and .omc/project-memory.json exist
**When** compile → canonical pushes to .omc/
**When** import → .omc/ pulls back to canonical
**Then** no data loss in either direction

---

## Epic 10: Multi-Agent Drivers

**Цель:** Добавить compile drivers для OpenClaw и Cursor.

### Story 10.1: OpenClaw compiler driver

As a user,
I want `agentfs compile openclaw` to generate OpenClaw configs,
So that OpenClaw reads my vault context.

**Acceptance Criteria:**

**Given** manifest + init.d + memory
**When** `agentfs compile openclaw`
**Then** SOUL.md generated from template
**And** `.omc/project-memory.json` updated (merge, not overwrite)

### Story 10.2: Cursor compiler driver

As a user,
I want `agentfs compile cursor` to generate .cursorrules,
So that Cursor knows my vault structure and rules.

**Acceptance Criteria:**

**Given** manifest + init.d
**When** `agentfs compile cursor`
**Then** `.cursorrules` generated from template with identity + paths

### Story 10.3: Multi-agent compile orchestration

As a user,
I want `agentfs compile` to compile all supported agents,
So that one command updates everything.

**Acceptance Criteria:**

**Given** manifest.agents.supported = [claude, openclaw, cursor]
**When** `agentfs compile`
**Then** all three drivers execute
**And** AGENT-MAP.md generated once (shared)

---

## Epic 11: Company & Shared Profiles

**Цель:** Поддержка командных и multi-user vault.

### Story 11.1: Company profile generator

As a team lead,
I want company profile with team directories and RBAC,
So that our team vault has proper structure.

**Acceptance Criteria:**

**Given** profile = company
**When** scaffold runs
**Then** Teams/, Decisions/, Postmortems/ created
**And** `rbac/roles.yaml` and `rbac/policies.yaml` generated

### Story 11.2: Shared profile generator

As a user,
I want shared profile with per-user spaces,
So that multiple people share one vault safely.

**Acceptance Criteria:**

**Given** profile = shared
**When** scaffold runs
**Then** Spaces/{user}/ directories created
**And** Shared/ directory with Projects/, Knowledge/, Templates/
**And** `.agentos/users/{user}.yaml` created per user

### Story 11.3: RBAC enforcement

As a team lead,
I want role-based access control compiled to agent configs,
So that team members have appropriate permissions.

**Acceptance Criteria:**

**Given** rbac/roles.yaml with role definitions
**When** compile runs
**Then** per-user security profiles generated
**And** agent configs reflect role permissions

---

## Epic 12: Full CLI (Doctor, Migrate, Triage)

**Цель:** Реализовать utility commands для vault management.

### Story 12.1: Doctor command

As a user,
I want `agentfs doctor` to check vault health,
So that I can find and fix issues.

**Acceptance Criteria:**

**Given** existing vault with `.agentos/`
**When** I run `agentfs doctor`
**Then** structure checks pass (required dirs exist, manifest valid)
**And** agnix lint runs (385 rules against CLAUDE.md, hooks, skills)
**And** security scan runs (prompt injection patterns)

### Story 12.2: Migrate command

As a user,
I want `agentfs migrate --source <path>`,
So that my existing vault gets AgentFS structure.

**Acceptance Criteria:**

**Given** existing vault without `.agentos/`
**When** I run `agentfs migrate`
**Then** analysis: file count, wikilinks, existing agent configs
**And** migration plan presented (directory mappings, wikilink fixes)
**And** git branch created, atomic commits per group

### Story 12.3: Triage command

As a user,
I want `agentfs triage` to classify Inbox/ files,
So that new notes get organized.

**Acceptance Criteria:**

**Given** unclassified files in Inbox/
**When** I run `agentfs triage`
**Then** each file analyzed (tags, content, stream)
**And** target folder suggested
**And** user confirms before any move

### Story 12.4: Security audit command

As a user,
I want `agentfs security audit`,
So that I can review security posture.

**Acceptance Criteria:**

**Given** policy.yaml and vault content
**When** I run `agentfs security audit`
**Then** all files scanned against policy
**And** violations reported
**And** recommendations for hardening

---

## Epic 13: Community & Publish

**Цель:** Подготовить проект к публикации и community contributions.

### Story 13.1: npm publish

As a maintainer,
I want the package published to npm,
So that users can `npx create-agentfs`.

**Acceptance Criteria:**

**Given** package.json configured, tests passing
**When** `npm publish` runs
**Then** `create-agentfs` available on npm
**And** `npx create-agentfs` works for new users

### Story 13.2: Contributing guide

As a contributor,
I want clear contributing guidelines,
So that I know how to add drivers and modules.

**Acceptance Criteria:**

**Given** CONTRIBUTING.md
**When** developer reads it
**Then** understands how to add new compile.d/ driver
**And** understands how to add new security module
**And** understands commit convention and PR process

### Story 13.3: Security module marketplace

As a community member,
I want to share security modules as npm packages,
So that domain-specific security can be community-driven.

**Acceptance Criteria:**

**Given** package convention `agentfs-security-{domain}`
**When** I run `agentfs security add <npm-package>`
**Then** package installed and policy merged
**And** `agentfs security list` shows community modules
