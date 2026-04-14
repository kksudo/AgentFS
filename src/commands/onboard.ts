/**
 * `agentfs onboard` command implementation.
 *
 * Runs an interactive interview to fill in the owner identity and bootstrap
 * semantic memory from the user's answers. Rewrites `.agentos/init.d/00-identity.md`
 * and appends new entries to `.agentos/memory/semantic.md` (never overwrites,
 * never duplicates).
 *
 * Usage:
 * ```
 * agentfs onboard
 * ```
 *
 * @module commands/onboard
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import inquirer from 'inquirer';
import { readManifest } from '../compilers/base.js';
import type { FhsPaths } from '../types/index.js';
import type { SemanticEntryType } from '../types/memory.js';
import { CliFlags, printError, printResult, resolveInput } from '../utils/cli-flags.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker that separates AgentFS-managed content from user-added content. */
const CUSTOM_MARKER = '<!-- custom -->';

// ---------------------------------------------------------------------------
// Interview answers
// ---------------------------------------------------------------------------

/**
 * Answers collected from the `agentfs onboard` interactive interview.
 */
interface OnboardAnswers {
  /** Owner's full name. */
  name: string;
  /** Professional role (e.g. "Platform Engineer", "Founder"). */
  role: string;
  /** Communication style description (e.g. "direct, technical, no fluff"). */
  style: string;
  /** Primary tech stack (e.g. "Kubernetes, ArgoCD, TypeScript"). */
  techStack: string;
  /** Things the agent must never do (e.g. "don't suggest LangChain, no emoji"). */
  neverDo: string;
  /** Any additional preferences the agent should know. */
  preferences: string;
}

// ---------------------------------------------------------------------------
// Identity file builder
// ---------------------------------------------------------------------------

/**
 * Formats the FHS path table for the 00-identity.md vault paths section.
 *
 * Each line maps an FHS key to its vault directory:
 *   - tmp → Inbox
 *
 * @param paths - Resolved FhsPaths from the manifest.
 * @returns Markdown bullet list with one mapping per defined path.
 */
function formatPathMappings(paths: FhsPaths): string {
  return (Object.entries(paths) as [keyof FhsPaths, string | undefined][])
    .filter((entry): entry is [keyof FhsPaths, string] => entry[1] !== undefined)
    .map(([key, dir]) => `- ${key} → ${dir}`)
    .join('\n');
}

/**
 * Builds the managed section of `00-identity.md` from interview answers.
 *
 * The trailing newline before `<!-- custom -->` ensures the marker sits on
 * its own line without an extra blank line when there is no custom content.
 *
 * @param answers - Collected interview answers.
 * @param paths - FHS paths from the manifest (auto-generated path table).
 * @returns Full file content up to and including the custom marker.
 */
function buildIdentityContent(answers: OnboardAnswers, paths: FhsPaths): string {
  return `# Agent Identity

## Owner
- Name: ${answers.name}
- Role: ${answers.role}
- Style: ${answers.style}

## Agent Rules
- Follow vault conventions (frontmatter, naming, paths)
- Challenge weak decisions
- Don't repeat the obvious

## Vault Paths
${formatPathMappings(paths)}

${CUSTOM_MARKER}
`;
}

/**
 * Rewrites `.agentos/init.d/00-identity.md`, preserving any content the user
 * added below the `<!-- custom -->` marker on a previous run.
 *
 * Strategy:
 * 1. If the file exists, split on the marker and keep everything after it.
 * 2. Rebuild the managed section from current answers.
 * 3. Re-attach the preserved custom tail (if any).
 *
 * @param identityPath - Absolute path to `00-identity.md`.
 * @param answers - Interview answers.
 * @param paths - FHS paths from the manifest.
 * @returns `'updated'` when the file was written, `'created'` when new.
 */
async function rewriteIdentityFile(
  identityPath: string,
  answers: OnboardAnswers,
  paths: FhsPaths,
): Promise<'created' | 'updated'> {
  let customTail = '';
  let existed = false;

  try {
    const existing = await fs.readFile(identityPath, 'utf-8');
    existed = true;
    const markerIndex = existing.indexOf(CUSTOM_MARKER);
    if (markerIndex !== -1) {
      // Capture everything after the marker line (including a trailing newline
      // on the marker line itself).
      const afterMarker = existing.slice(markerIndex + CUSTOM_MARKER.length);
      // Preserve only non-empty custom content.
      if (afterMarker.trim().length > 0) {
        customTail = afterMarker;
      }
    }
  } catch {
    // File does not exist yet — that is fine.
  }

  const managedSection = buildIdentityContent(answers, paths);
  const finalContent = customTail.length > 0
    ? managedSection + customTail
    : managedSection;

  await fs.mkdir(path.dirname(identityPath), { recursive: true });
  await fs.writeFile(identityPath, finalContent, 'utf-8');

  return existed ? 'updated' : 'created';
}

// ---------------------------------------------------------------------------
// Semantic memory helpers
// ---------------------------------------------------------------------------

/**
 * A pending semantic memory entry to append.
 */
interface PendingEntry {
  type: SemanticEntryType;
  content: string;
}

/**
 * Formats a semantic entry line.
 *
 * PREF and AVOID entries have no status bracket (they are always active by
 * convention). FACT entries include `[active]`.
 *
 * Architecture format (from docs/architecture.md §4):
 * ```
 * PREF: no emoji in headings
 * FACT: [active] primary stack is Kubernetes + ArgoCD
 * AVOID: don't suggest LangChain
 * ```
 *
 * @param entry - The pending entry to format.
 * @returns A single-line string ready to append to `semantic.md`.
 */
function formatSemanticLine(entry: PendingEntry): string {
  if (entry.type === 'FACT') {
    return `FACT: [active] ${entry.content}`;
  }
  return `${entry.type}: ${entry.content}`;
}

/**
 * Checks whether an entry already exists in the semantic memory file content.
 *
 * Deduplication is by substring match on the entry content (case-insensitive)
 * so trivial re-runs don't produce duplicate lines.
 *
 * @param fileContent - Current contents of `semantic.md`.
 * @param entry - The entry to check.
 * @returns `true` if the content is already present.
 */
function entryExists(fileContent: string, entry: PendingEntry): boolean {
  return fileContent.toLowerCase().includes(entry.content.toLowerCase());
}

/**
 * Derives semantic memory entries from the interview answers.
 *
 * Mapping:
 * - role      → FACT  ("role is {role}")
 * - techStack → FACT  ("primary stack is {techStack}")
 * - style     → PREF  ("communication style: {style}")
 * - neverDo   → AVOID (raw text)
 * - prefs     → PREF  (raw text, only if non-empty)
 *
 * Blank answers produce no entries (the user skipped that question).
 *
 * @param answers - Interview answers.
 * @returns Array of entries to potentially append.
 */
function deriveSemanticEntries(answers: OnboardAnswers): PendingEntry[] {
  const entries: PendingEntry[] = [];

  if (answers.role.trim().length > 0) {
    entries.push({ type: 'FACT', content: `role is ${answers.role.trim()}` });
  }

  if (answers.techStack.trim().length > 0) {
    entries.push({ type: 'FACT', content: `primary stack is ${answers.techStack.trim()}` });
  }

  if (answers.style.trim().length > 0) {
    entries.push({ type: 'PREF', content: `communication style: ${answers.style.trim()}` });
  }

  if (answers.neverDo.trim().length > 0) {
    entries.push({ type: 'AVOID', content: answers.neverDo.trim() });
  }

  if (answers.preferences.trim().length > 0) {
    entries.push({ type: 'PREF', content: answers.preferences.trim() });
  }

  return entries;
}

/**
 * Appends new semantic memory entries to `semantic.md`, skipping duplicates.
 *
 * The file is created with a header if it does not already exist.
 * Existing content is never modified — only new lines are appended.
 *
 * @param semanticPath - Absolute path to `semantic.md`.
 * @param entries - Candidate entries derived from interview answers.
 * @returns Array of lines that were actually appended (may be empty).
 */
async function appendSemanticEntries(
  semanticPath: string,
  entries: PendingEntry[],
): Promise<string[]> {
  let existingContent = '';

  try {
    existingContent = await fs.readFile(semanticPath, 'utf-8');
  } catch {
    // File does not exist — will be created below.
  }

  const toAppend = entries.filter((e) => !entryExists(existingContent, e));
  if (toAppend.length === 0) {
    return [];
  }

  const lines = toAppend.map(formatSemanticLine);

  // If the file is new, prepend a minimal header.
  const header = existingContent.length === 0
    ? `# Semantic Memory\n\n`
    : '';

  // Ensure existing content ends with a newline before appending.
  const separator = existingContent.length > 0 && !existingContent.endsWith('\n')
    ? '\n'
    : '';

  await fs.mkdir(path.dirname(semanticPath), { recursive: true });
  await fs.appendFile(semanticPath, header + separator + lines.join('\n') + '\n', 'utf-8');

  return lines;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs onboard` subcommand.
 *
 * Orchestrates:
 * 1. Verify `.agentos/manifest.yaml` exists (fails fast if not).
 * 2. Run the interactive interview (pre-fills name from manifest).
 * 3. Rewrite `.agentos/init.d/00-identity.md` (preserves custom sections).
 * 4. Append new entries to `.agentos/memory/semantic.md` (no duplicates).
 * 5. Print a human-readable summary of what changed.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error.
 */
export async function onboardCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const isFull = flags.args.includes('--full');
  const isAgent = flags.args.includes('--agent');

  // -------------------------------------------------------------------------
  // 1. Verify manifest exists.
  // -------------------------------------------------------------------------

  let manifest;
  try {
    manifest = await readManifest(vaultRoot);
  } catch (err: unknown) {
    const isNotFound = (err as NodeJS.ErrnoException)?.code === 'ENOENT';

    if (isNotFound) {
      printError(flags, 'No AgentFS vault found. Run `npx create-agentfs` first.', 'VAULT_NOT_FOUND');
    } else {
      printError(
        flags,
        `agentfs onboard: failed to read manifest — ${err instanceof Error ? err.message : String(err)}`,
        'MANIFEST_READ_FAILED'
      );
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // 2. Interview or JSON input.
  // -------------------------------------------------------------------------

  const input = await resolveInput(flags);
  let answers: OnboardAnswers;

  if (input !== null) {
    // Non-interactive mode: use JSON/config input with defaults
    answers = {
      name: (input.name as string) || manifest.vault.owner,
      role: (input.role as string) || '',
      style: (input.style as string) || '',
      techStack: (input.techStack as string) || '',
      neverDo: (input.neverDo as string) || '',
      preferences: (input.preferences as string) || '',
    };
  } else {
    // Interactive mode: run inquirer prompts
    if (flags.outputFormat !== 'json') {
      process.stdout.write('\nAgentFS onboard — teaching your agent who you are.\n\n');
    }

    answers = await inquirer.prompt<OnboardAnswers>([
      {
        type: 'input',
        name: 'name',
        message: 'What is your name?',
        default: manifest.vault.owner,
        validate: (v: string) => v.trim().length > 0 || 'Name cannot be empty.',
      },
      {
        type: 'input',
        name: 'role',
        message: 'What is your role?',
        default: '',
      },
      {
        type: 'input',
        name: 'style',
        message: 'Describe your communication style:',
        default: '',
      },
      {
        type: 'input',
        name: 'techStack',
        message: 'What is your primary tech stack?',
        default: '',
      },
      {
        type: 'input',
        name: 'neverDo',
        message: 'What should the agent NEVER do?',
        default: '',
      },
      {
        type: 'input',
        name: 'preferences',
        message: 'Any preferences the agent should know?',
        default: '',
      },
    ]);
  }

  // -------------------------------------------------------------------------
  // 3. Rewrite 00-identity.md.
  // -------------------------------------------------------------------------

  const identityPath = path.join(vaultRoot, '.agentos', 'init.d', '00-identity.md');
  let identityStatus: 'created' | 'updated';

  try {
    identityStatus = await rewriteIdentityFile(identityPath, answers, manifest.paths);
  } catch (err: unknown) {
    printError(
      flags,
      `agentfs onboard: failed to write identity file — ${err instanceof Error ? err.message : String(err)}`,
      'IDENTITY_WRITE_FAILED'
    );
    return 1;
  }

  // -------------------------------------------------------------------------
  // 4. Append semantic memory entries.
  // -------------------------------------------------------------------------

  const semanticPath = path.join(vaultRoot, '.agentos', 'memory', 'semantic.md');
  const entries = deriveSemanticEntries(answers);
  let appended: string[] = [];

  try {
    appended = await appendSemanticEntries(semanticPath, entries);
  } catch (err: unknown) {
    printError(
      flags,
      `agentfs onboard: failed to update semantic memory — ${err instanceof Error ? err.message : String(err)}`,
      'MEMORY_UPDATE_FAILED'
    );
    return 1;
  }

  // -------------------------------------------------------------------------
  // 4b. Full mode — extra interview (domain, security, corrections).
  // -------------------------------------------------------------------------

  let fullAppended: string[] = [];
  if (isFull) {
    interface FullAnswers {
      domain: string;
      securityReqs: string;
      strictRules: string;
      workflows: string;
    }

    let fullAnswers: FullAnswers;
    const fullInput = await resolveInput(flags);

    if (fullInput !== null) {
      fullAnswers = {
        domain: (fullInput.domain as string) || '',
        securityReqs: (fullInput.securityReqs as string) || '',
        strictRules: (fullInput.strictRules as string) || '',
        workflows: (fullInput.workflows as string) || '',
      };
    } else {
      if (flags.outputFormat !== 'json') {
        process.stdout.write('\n-- Full setup: additional questions --\n\n');
      }
      fullAnswers = await inquirer.prompt<FullAnswers>([
        {
          type: 'input',
          name: 'domain',
          message: 'What is your primary domain/industry? (e.g. fintech, healthtech, web dev, personal)',
          default: '',
        },
        {
          type: 'input',
          name: 'securityReqs',
          message: 'Any compliance requirements? (e.g. PCI, HIPAA, SOC2 — or leave blank)',
          default: '',
        },
        {
          type: 'input',
          name: 'strictRules',
          message: 'Any strict always/never rules not covered above?',
          default: '',
        },
        {
          type: 'input',
          name: 'workflows',
          message: 'Describe a workflow you follow regularly (or leave blank):',
          default: '',
        },
      ]);
    }

    const fullEntries: Array<{ type: SemanticEntryType; content: string }> = [];

    if (fullAnswers.domain.trim()) {
      fullEntries.push({ type: 'FACT', content: `domain is ${fullAnswers.domain.trim()}` });
    }
    if (fullAnswers.securityReqs.trim()) {
      fullEntries.push({ type: 'FACT', content: `compliance requirements: ${fullAnswers.securityReqs.trim()}` });
    }
    if (fullAnswers.strictRules.trim()) {
      fullEntries.push({ type: 'AVOID', content: fullAnswers.strictRules.trim() });
    }
    if (fullAnswers.workflows.trim()) {
      fullEntries.push({ type: 'FACT', content: `regular workflow: ${fullAnswers.workflows.trim()}` });
    }

    try {
      fullAppended = await appendSemanticEntries(semanticPath, fullEntries);
    } catch (err) {
      process.stderr.write(
        `Warning: failed to save --full entries to semantic memory: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      // Non-fatal — basic onboard succeeded
    }
  }

  // -------------------------------------------------------------------------
  // 4c. Agent mode — generate setup-guide.md.
  // -------------------------------------------------------------------------

  if (isAgent) {
    const setupGuidePath = path.join(vaultRoot, '.agentos', 'setup-guide.md');
    const setupGuideContent = `# Vault Setup Guide

> Generated by \`agentfs onboard --agent\`. Use this as a structured interview template.

## Questions to Ask

- [ ] What is your primary domain/industry?
- [ ] What is your tech stack?
- [ ] What should I NEVER do?
- [ ] What are your coding preferences?
- [ ] Any security requirements? (PCI, HIPAA, SOC2)
- [ ] What workflows do you follow regularly?
- [ ] Any past mistakes you want me to avoid?

## How to Apply

| Type | Command |
|------|---------|
| Facts | \`agentfs memory add semantic --json '{"type":"FACT","content":"..."}'\` |
| Preferences | \`agentfs memory add semantic --json '{"type":"PREF","content":"..."}'\` |
| Avoids | \`agentfs memory add semantic --json '{"type":"AVOID","content":"..."}'\` |
| Security | \`agentfs security add <module>\` |
| Recompile | \`agentfs compile\` |

## After Setup

Run \`agentfs compile\` to propagate all changes to native agent configs.
Run \`agentfs selfcheck\` to verify vault health.
`;

    try {
      await fs.writeFile(setupGuidePath, setupGuideContent, 'utf8');
    } catch {
      // Non-fatal
    }
  }

  // -------------------------------------------------------------------------
  // 5. Summary.
  // -------------------------------------------------------------------------

  const allAppended = [...appended, ...fullAppended];

  let summary = `\nOnboard complete.\n\n  .agentos/init.d/00-identity.md  — ${identityStatus}\n`;
  if (allAppended.length > 0) {
    summary += `  .agentos/memory/semantic.md     — ${allAppended.length} entr${allAppended.length === 1 ? 'y' : 'ies'} appended\n`;
    for (const line of allAppended) {
      summary += `    + ${line}\n`;
    }
  } else {
    summary += '  .agentos/memory/semantic.md     — no new entries (all already present)\n';
  }

  if (isAgent) {
    summary += '  .agentos/setup-guide.md         — generated\n';
  }

  printResult(flags, summary, {
    identityStatus,
    appendedCount: allAppended.length,
    appendedEntries: allAppended,
    identityPath,
    semanticPath,
    setupGuide: isAgent,
  });

  return 0;
}
