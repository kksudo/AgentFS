/**
 * `agentfs sync` / `agentfs import` command implementations.
 *
 * @module commands/sync
 */

import { importFromOmc, exportToOmc, detectDrift } from '../sync/index.js';

function print(line: string): void {
  process.stdout.write(line + '\n');
}

function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

/**
 * Entry point for `agentfs import` subcommand.
 */
export async function importCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const target = args[0];

  if (target === undefined || target === '--help') {
    print('');
    print('Usage: agentfs import <source>');
    print('');
    print('Sources:');
    print('  memory       Import facts from .omc/project-memory.json');
    print('');
    return 0;
  }

  if (target === 'memory') {
    const result = await importFromOmc(vaultRoot);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        printErr(`  ✗ ${err}`);
      }
      if (result.imported === 0 && result.skipped === 0) return 1;
    }

    print(`✓ Import complete: ${result.imported} imported, ${result.skipped} skipped.`);
    return 0;
  }

  printErr(`agentfs import: unknown source '${target}'`);
  return 1;
}

/**
 * Entry point for `agentfs sync` subcommand.
 */
export async function syncCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const action = args[0];

  if (action === '--help' || action === '-h') {
    print('');
    print('Usage: agentfs sync [action]');
    print('');
    print('Actions:');
    print('  (none)       Check drift between compiled outputs and manifest');
    print('  push         Export canonical memory to .omc/ format');
    print('');
    return 0;
  }

  if (action === 'push') {
    const count = await exportToOmc(vaultRoot);
    if (count === 0) {
      print('No semantic memory to export.');
    } else {
      print(`✓ Exported ${count} entries to .omc/project-memory.json`);
    }
    return 0;
  }

  // Default: drift detection
  const managedFiles = ['CLAUDE.md', 'AGENTS.md'];
  const results = await detectDrift(vaultRoot, managedFiles);

  print('');
  print('Drift Detection');
  print('═'.repeat(50));
  for (const r of results) {
    const status = r.currentHash === 'MISSING' ? '❌ missing' : '✓ present';
    print(`  ${status}  ${r.file}`);
  }
  print('');
  print('Tip: Run `agentfs compile` to regenerate managed files.');
  print('');

  return 0;
}
