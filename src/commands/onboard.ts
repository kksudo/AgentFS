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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker that separates AgentFS-managed content from user-added content. */
const CUSTOM_MARKER = '<!-- custom -->';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/** Write a line to stdout. */
function print(line: string): void {
  process.stdout.write(line + '\n');
}

/** Write a line to stderr. */
function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

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
 * @param args - Arguments after the `onboard` subcommand token.
 *               Currently unused — reserved for future flags.
 * @returns 0 on success, 1 on error.
 */
export async function onboardCommand(_args: string[]): Promise<number> {
  const vaultRoot = process.cwd();

  // -------------------------------------------------------------------------
  // 1. Verify manifest exists.
  // -------------------------------------------------------------------------

  let manifest;
  try {
    manifest = await readManifest(vaultRoot);
  } catch (err) {
    const isNotFound =
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as any).code === 'ENOENT';

    if (isNotFound) {
      printErr('No AgentFS vault found. Run `npx create-agentfs` first.');
    } else {
      printErr(
        `agentfs onboard: failed to read manifest — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // 2. Interactive interview.
  // -------------------------------------------------------------------------

  print('');
  print('AgentFS onboard — teaching your agent who you are.');
  print('');

  const answers = await inquirer.prompt<OnboardAnswers>([
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
      // e.g. "Platform Engineer", "Student", "Founder"
    },
    {
      type: 'input',
      name: 'style',
      message: 'Describe your communication style:',
      default: '',
      // e.g. "direct, technical, no fluff"
    },
    {
      type: 'input',
      name: 'techStack',
      message: 'What is your primary tech stack?',
      default: '',
      // e.g. "Kubernetes, ArgoCD, TypeScript"
    },
    {
      type: 'input',
      name: 'neverDo',
      message: 'What should the agent NEVER do?',
      default: '',
      // e.g. "don't suggest LangChain, no emoji"
    },
    {
      type: 'input',
      name: 'preferences',
      message: 'Any preferences the agent should know?',
      default: '',
    },
  ]);

  // -------------------------------------------------------------------------
  // 3. Rewrite 00-identity.md.
  // -------------------------------------------------------------------------

  const identityPath = path.join(vaultRoot, '.agentos', 'init.d', '00-identity.md');
  let identityStatus: 'created' | 'updated';

  try {
    identityStatus = await rewriteIdentityFile(identityPath, answers, manifest.paths);
  } catch (err) {
    printErr(
      `agentfs onboard: failed to write identity file — ${err instanceof Error ? err.message : String(err)}`,
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
  } catch (err) {
    printErr(
      `agentfs onboard: failed to update semantic memory — ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  // -------------------------------------------------------------------------
  // 5. Summary.
  // -------------------------------------------------------------------------

  print('');
  print('Onboard complete.');
  print('');
  print(`  .agentos/init.d/00-identity.md  — ${identityStatus}`);

  if (appended.length > 0) {
    print(`  .agentos/memory/semantic.md     — ${appended.length} entr${appended.length === 1 ? 'y' : 'ies'} appended`);
    for (const line of appended) {
      print(`    + ${line}`);
    }
  } else {
    print('  .agentos/memory/semantic.md     — no new entries (all already present)');
  }

  print('');

  return 0;
}
