/**
 * `agentfs secret` command implementation.
 *
 * Subcommands:
 *   agentfs secret add <name>       — add encrypted secret (Story 8.2)
 *   agentfs secret remove <name>    — remove secret
 *   agentfs secret list             — list secret names (never values)
 *   agentfs secret rotate <name>    — re-encrypt with new value
 *
 * @module commands/secret
 */

import {
  addSecret,
  removeSecret,
  listSecrets,
  rotateSecret,
} from '../secrets/vault.js';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function print(line: string): void {
  process.stdout.write(line + '\n');
}

function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function secretCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const action = args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printSecretUsage();
    return 0;
  }

  if (action === 'add') {
    const name = args[1];
    const value = args[2];
    if (!name || !value) {
      printErr('agentfs secret add: requires <name> <value>');
      return 1;
    }
    await addSecret(vaultRoot, name, value);
    print(`✓ Secret '${name}' added. Reference: \${{secret:${name}}}`);
    return 0;
  }

  if (action === 'remove') {
    const name = args[1];
    if (!name) {
      printErr('agentfs secret remove: requires <name>');
      return 1;
    }
    const removed = await removeSecret(vaultRoot, name);
    if (removed) {
      print(`✓ Secret '${name}' removed.`);
    } else {
      printErr(`Secret '${name}' not found.`);
      return 1;
    }
    return 0;
  }

  if (action === 'list') {
    const names = await listSecrets(vaultRoot);
    if (names.length === 0) {
      print('No secrets stored.');
    } else {
      print('');
      print('Stored Secrets');
      print('═'.repeat(50));
      for (const name of names) {
        print(`  🔑 ${name}`);
      }
      print('');
      print(`  Total: ${names.length} secret(s)`);
      print('');
    }
    return 0;
  }

  if (action === 'rotate') {
    const name = args[1];
    const newValue = args[2];
    if (!name || !newValue) {
      printErr('agentfs secret rotate: requires <name> <new-value>');
      return 1;
    }
    const rotated = await rotateSecret(vaultRoot, name, newValue);
    if (rotated) {
      print(`✓ Secret '${name}' rotated.`);
    } else {
      printErr(`Secret '${name}' not found.`);
      return 1;
    }
    return 0;
  }

  printErr(`agentfs secret: unknown action '${action}'`);
  printSecretUsage();
  return 1;
}

function printSecretUsage(): void {
  print('');
  print('Usage: agentfs secret <action>');
  print('');
  print('Actions:');
  print('  add <name> <value>    Add an encrypted secret');
  print('  remove <name>         Remove a secret');
  print('  list                  List secret names (not values)');
  print('  rotate <name> <val>   Rotate (re-encrypt) a secret');
  print('');
}
