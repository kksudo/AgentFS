/**
 * Claude AppArmor compiler — Story 7.2.
 *
 * Compiles SecurityPolicy into `.claude/settings.json` permissions format.
 * Preserves existing user settings when the file already exists.
 *
 * @module security/claude-compiler
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecurityPolicy } from '../types/index.js';

/** Shape of .claude/settings.json that we manage. */
interface ClaudeSettings {
  permissions?: {
    deny?: string[];
    ask?: string[];
  };
  [key: string]: unknown;
}

/**
 * Compile SecurityPolicy into .claude/settings.json permissions.
 *
 * @param vaultRoot - Absolute path to vault root
 * @param policy    - Parsed security policy
 * @param dryRun    - If true, returns the settings without writing
 * @returns The compiled ClaudeSettings object
 */
export async function compileClaudeSecurity(
  vaultRoot: string,
  policy: SecurityPolicy,
  dryRun = false,
): Promise<ClaudeSettings> {
  const settingsPath = path.join(vaultRoot, '.claude', 'settings.json');

  // Read existing settings to preserve user customizations
  let existing: ClaudeSettings = {};
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    existing = JSON.parse(raw) as ClaudeSettings;
  } catch {
    // No existing settings — start fresh
  }

  // Build deny rules from policy
  const denyRules: string[] = [];

  // File read denials → "Read" deny
  for (const pattern of policy.file_access.deny_read) {
    denyRules.push(`Read(${pattern})`);
  }

  // File write denials → "Write" deny
  for (const pattern of policy.file_access.deny_write) {
    denyRules.push(`Write(${pattern})`);
  }

  // Blocked commands
  for (const cmd of policy.commands.blocked) {
    denyRules.push(`Execute(${cmd})`);
  }

  // Build ask rules from policy
  const askRules: string[] = [];

  for (const pattern of policy.file_access.ask_write) {
    askRules.push(`Write(${pattern})`);
  }

  for (const cmd of policy.commands.ask_before) {
    askRules.push(`Execute(${cmd})`);
  }

  // Merge with existing settings
  const result: ClaudeSettings = {
    ...existing,
    permissions: {
      deny: denyRules,
      ask: askRules,
    },
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  }

  return result;
}
