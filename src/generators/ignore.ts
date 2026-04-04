/**
 * Ignore Files Generator — creates `.gitignore` and `.agentignore` at vault root.
 *
 * `.gitignore` protects runtime state and secrets from accidental commits.
 * `.agentignore` enforces an agent-level read barrier over secrets and PII.
 *
 * Both files are written idempotently:
 * - `.gitignore` — if the file exists, only absent lines are appended.
 * - `.agentignore` — if the file exists, it is skipped entirely.
 *
 * @see docs/architecture.md Section 15 "Security Model"
 * @module generators/ignore
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SetupAnswers, GeneratorResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lines written to (or appended into) `.gitignore`.
 *
 * Covers runtime state directories that must never be committed:
 * active process state, decrypted secrets, and per-agent session logs.
 */
const GITIGNORE_LINES: readonly string[] = [
  '# Runtime state',
  '.agentos/proc/',
  '.agentos/secrets/decrypted/',
  '.claude/sessions/',
  '.omc/sessions/',
  '.omc/state/',
];

/**
 * Full content written to `.agentignore` when the file does not yet exist.
 *
 * Declares directories and glob patterns that agents must never read directly.
 * Covers raw secrets, PII, and foreign-agent session files.
 */
const AGENTIGNORE_CONTENT = `# Secrets — agent must NEVER read directly
.agentos/secrets/
**/.env
**/*.key
**/*.pem
**/*credentials*
**/*token*

# PII
People/**/private-notes.md

# Other agent sessions
.claude/sessions/
.omc/sessions/
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads an existing text file and returns its lines, or an empty array when
 * the file does not exist.
 *
 * @param filePath - Absolute path to the file to read.
 * @returns Array of lines with newlines stripped.
 */
async function readLinesIfExists(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// generateIgnoreFiles
// ---------------------------------------------------------------------------

/**
 * Generates `.gitignore` and `.agentignore` at the vault root.
 *
 * `.gitignore` handling:
 * - If the file does not exist, it is created with all managed lines.
 * - If the file already exists, only lines that are not already present are
 *   appended (blank-line separator added before the new block).
 *
 * `.agentignore` handling:
 * - If the file does not exist, it is created with the full managed content.
 * - If the file already exists, it is skipped entirely.
 *
 * @param answers - Setup answers from the interactive wizard.
 * @returns A `GeneratorResult` listing created and skipped paths.
 *
 * @example
 * ```ts
 * const result = await generateIgnoreFiles(answers);
 * console.log(result.created);  // ['.gitignore', '.agentignore']
 * console.log(result.skipped);  // []
 * ```
 */
export async function generateIgnoreFiles(answers: SetupAnswers): Promise<GeneratorResult> {
  const result: GeneratorResult = { created: [], skipped: [] };

  // -------------------------------------------------------------------------
  // .gitignore — append-only merge
  // -------------------------------------------------------------------------

  const gitignorePath = path.join(answers.targetDir, '.gitignore');

  const existingLines = await readLinesIfExists(gitignorePath);
  const existingSet = new Set(existingLines.map((l) => l.trim()));

  const missingLines = GITIGNORE_LINES.filter((line) => {
    // Always insert comment headers if the exact comment is absent;
    // always insert blank separators implicitly via the join below.
    return !existingSet.has(line.trim());
  });

  if (existingLines.length === 0) {
    // File does not exist — write it fresh.
    await fs.writeFile(gitignorePath, GITIGNORE_LINES.join('\n') + '\n', 'utf8');
    result.created.push('.gitignore');
  } else if (missingLines.length > 0) {
    // File exists — append only the lines that are not present.
    const appendBlock = '\n' + missingLines.join('\n') + '\n';
    await fs.appendFile(gitignorePath, appendBlock, 'utf8');
    result.created.push('.gitignore');
  } else {
    // All lines already present — skip.
    result.skipped.push('.gitignore');
  }

  // -------------------------------------------------------------------------
  // .agentignore — create or skip
  // -------------------------------------------------------------------------

  const agentignorePath = path.join(answers.targetDir, '.agentignore');

  try {
    await fs.access(agentignorePath);
    // File already exists — skip.
    result.skipped.push('.agentignore');
  } catch {
    // File does not exist — write it.
    await fs.writeFile(agentignorePath, AGENTIGNORE_CONTENT, 'utf8');
    result.created.push('.agentignore');
  }

  return result;
}
