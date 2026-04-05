/**
 * `agentfs cron` command implementation.
 *
 * Subcommands:
 *   agentfs cron list           — list all registered cron jobs
 *   agentfs cron run <job>      — run a specific job
 *   agentfs cron run-all        — run all registered jobs
 *
 * @module commands/cron
 */

import { CRON_REGISTRY, runCronJob, runAllCronJobs } from '../cron/index.js';

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

/**
 * Entry point for the `agentfs cron` subcommand.
 *
 * @param args - Arguments after the `cron` subcommand token
 * @returns 0 on success, 1 on error
 */
export async function cronCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const action = args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printCronUsage();
    return 0;
  }

  if (action === 'list') {
    print('');
    print('Registered Cron Jobs');
    print('═'.repeat(50));
    for (const [key, job] of Object.entries(CRON_REGISTRY)) {
      print(`  ${key.padEnd(20)} ${job.description}`);
    }
    print('');
    return 0;
  }

  if (action === 'run') {
    const jobName = args[1];
    if (!jobName) {
      printErr('agentfs cron run: job name required');
      printCronUsage();
      return 1;
    }

    const result = await runCronJob(jobName, vaultRoot);
    if (result.success) {
      print(`✓ ${result.message}`);
    } else {
      printErr(`✗ ${result.message}`);
    }
    return result.success ? 0 : 1;
  }

  if (action === 'run-all') {
    const results = await runAllCronJobs(vaultRoot);
    let hasFailure = false;

    print('');
    print('Cron Run Results');
    print('═'.repeat(50));
    for (const result of results) {
      const icon = result.success ? '✓' : '✗';
      print(`  ${icon} [${result.job}] ${result.message}`);
      if (!result.success) hasFailure = true;
    }
    print('');

    return hasFailure ? 1 : 0;
  }

  printErr(`agentfs cron: unknown action '${action}'`);
  printCronUsage();
  return 1;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printCronUsage(): void {
  print('');
  print('Usage: agentfs cron <action>');
  print('');
  print('Actions:');
  print('  list                  List all registered cron jobs');
  print('  run <job>             Run a specific cron job');
  print('  run-all               Run all registered cron jobs');
  print('');
}
