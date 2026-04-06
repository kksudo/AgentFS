import { detectDrift } from '../sync/index.js';
import { CliFlags, printResult } from '../utils/cli-flags.js';

/**
 * Entry point for `agentfs sync` subcommand.
 *
 * Checks for drift between the kernel manifest and compiled agent-native outputs.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function syncCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const action = flags.args[0];

  if (action === '--help' || action === '-h') {
    printSyncUsage();
    return 0;
  }

  // Managed files across all supported agents
  const managedFiles = [
    'CLAUDE.md',
    '.claude/settings.json',
    '.cursor/rules/agentfs-global.mdc',
    '.openclaw/AGENTS.md',
    '.openclaw/SOUL.md',
    '.openclaw/IDENTITY.md',
    '.openclaw/USER.md',
    '.openclaw/TOOLS.md',
    'AGENT-MAP.md',
  ];

  const results = await detectDrift(vaultRoot, managedFiles);

  let human = '\nDrift Detection\n' + '═'.repeat(50) + '\n';
  let driftedCount = 0;

  for (const r of results) {
    const status = r.currentHash === 'MISSING' ? '❌ missing' : '✓ present';
    if (r.currentHash === 'MISSING') driftedCount++;
    human += `  ${status.padEnd(10)}  ${r.file}\n`;
  }

  if (driftedCount > 0) {
    human += `\nFound ${driftedCount} missing managed file(s).\n`;
    human += 'Tip: Run `agentfs compile` to regenerate all managed files.\n';
  } else {
    human += '\n✓ All managed files are present.\n';
  }

  printResult(flags, human, { driftResults: results });
  return 0;
}

function printSyncUsage(): void {
  process.stdout.write('\nUsage: agentfs sync\n\n');
  process.stdout.write('Description:\n');
  process.stdout.write('  Checks for drift between the kernel manifest and compiled agent-native outputs.\n');
  process.stdout.write('  It verifies that all managed files (CLAUDE.md, .cursor/rules/, .openclaw/, etc.) exist.\n\n');
}
