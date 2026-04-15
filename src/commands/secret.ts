/**
 * `agentfs secret` command implementation.
 *
 * Subcommands:
 *   agentfs secret add <name>       — add encrypted secret (Story 8.2)
 *   agentfs secret remove <name>    — remove secret
 *   agentfs secret list             — list secret names (never values)
 *   agentfs secret rotate <name>    — re-encrypt with new value
 *   agentfs secret audit            — integrity and encryption audit
 *
 * @module commands/secret
 */

import {
  addSecret,
  removeSecret,
  listSecrets,
  rotateSecret,
  getSecret,
  auditVault,
} from '../secrets/vault.js';
import { CliFlags, printError, printResult } from '../utils/cli-flags.js';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs secret` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function secretCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const action = flags.args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printSecretUsage();
    return 0;
  }

  if (action === 'add') {
    const name = flags.args[1];
    const value = flags.args[2];
    if (!name || !value) {
      printError(flags, 'agentfs secret add: requires <name> <value>', 'MISSING_ARGUMENTS');
      return 1;
    }
    await addSecret(vaultRoot, name, value);
    printResult(flags, `✓ Secret '${name}' added. Reference: \${{secret:${name}}}`, { name });
    return 0;
  }

  if (action === 'remove') {
    const name = flags.args[1];
    if (!name) {
      printError(flags, 'agentfs secret remove: requires <name>', 'MISSING_NAME');
      return 1;
    }
    const removed = await removeSecret(vaultRoot, name);
    if (removed) {
      printResult(flags, `✓ Secret '${name}' removed.`, { name });
    } else {
      printError(flags, `Secret '${name}' not found.`, 'SECRET_NOT_FOUND');
      return 1;
    }
    return 0;
  }

  if (action === 'list') {
    const names = await listSecrets(vaultRoot);
    if (names.length === 0) {
      printResult(flags, 'No secrets stored.', { secrets: [] });
    } else {
      let human = '\nStored Secrets\n' + '═'.repeat(50) + '\n';
      for (const name of names) {
        human += `  🔑 ${name}\n`;
      }
      human += `\n  Total: ${names.length} secret(s)\n`;
      printResult(flags, human, { secrets: names });
    }
    return 0;
  }

  if (action === 'rotate') {
    const name = flags.args[1];
    const newValue = flags.args[2];
    if (!name || !newValue) {
      printError(flags, 'agentfs secret rotate: requires <name> <new-value>', 'MISSING_ARGUMENTS');
      return 1;
    }
    const rotated = await rotateSecret(vaultRoot, name, newValue);
    if (rotated) {
      printResult(flags, `✓ Secret '${name}' rotated.`, { name });
    } else {
      printError(flags, `Secret '${name}' not found.`, 'SECRET_NOT_FOUND');
      return 1;
    }
    return 0;
  }

  if (action === 'get') {
    const name = flags.args[1];
    if (!name) {
      printError(flags, 'agentfs secret get: requires <name>', 'MISSING_NAME');
      return 1;
    }
    const value = await getSecret(vaultRoot, name);
    if (value !== null) {
      // In JSON mode, include the value. In human mode, just print it.
      printResult(flags, value, { name, value });
    } else {
      printError(flags, `Secret '${name}' not found or invalid.`, 'SECRET_NOT_FOUND');
      return 1;
    }
    return 0;
  }

  if (action === 'audit') {
    return runAudit(flags, vaultRoot);
  }

  printError(flags, `agentfs secret: unknown action '${action}'`, 'UNKNOWN_ACTION');
  return 1;
}

async function runAudit(flags: CliFlags, vaultRoot: string): Promise<number> {
  const result = await auditVault(vaultRoot);
  const sep = '═'.repeat(50);

  const keyStatus = result.hasKeyFile ? 'present' : 'MISSING';
  const refsOk = result.missingEntries.length === 0;
  const orphansOk = result.orphanedEntries.length === 0;

  let human = `\nSecret Vault Audit\n${sep}\n`;
  human += `  Vault: .agentos/secrets/vault.yaml\n`;
  human += `  Secrets: ${result.count} stored\n`;
  human += `  Encryption: ${result.encryption}\n`;
  human += `  Key file: .agentos/secrets/.vault-key (${keyStatus})\n`;
  human += `\n  Refs integrity:\n`;

  if (refsOk && orphansOk) {
    human += `    ✓ All ${result.refsCount} refs have corresponding vault entries\n`;
  } else {
    if (!refsOk) {
      human += `    ✗ Missing vault entries for: ${result.missingEntries.join(', ')}\n`;
    }
    if (!orphansOk) {
      human += `    ✗ Orphaned vault entries (no ref): ${result.orphanedEntries.join(', ')}\n`;
    }
  }

  human += `${sep}\n`;

  printResult(flags, human, result as unknown as Record<string, unknown>);
  return 0;
}

function printSecretUsage(): void {
  process.stdout.write('\nUsage: agentfs secret <action>\n\n');
  process.stdout.write('Actions:\n');
  process.stdout.write('  add <name> <value>    Add an encrypted secret\n');
  process.stdout.write('  remove <name>         Remove a secret\n');
  process.stdout.write('  list                  List secret names (not values)\n');
  process.stdout.write('  rotate <name> <val>   Rotate (re-encrypt) a secret\n');
  process.stdout.write('  get <name>            Get the plaintext value of a secret\n');
  process.stdout.write('  audit                 Audit vault integrity and encryption status\n\n');
}
