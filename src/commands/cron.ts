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
import { CliFlags, printError, printResult } from '../utils/cli-flags.js';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs cron` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function cronCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const action = flags.args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printCronUsage();
    return 0;
  }

  if (action === 'list') {
    let human = '\nRegistered Cron Jobs\n' + '═'.repeat(50) + '\n';
    const jobs: Record<string, string> = {};
    for (const [key, job] of Object.entries(CRON_REGISTRY)) {
      human += `  ${key.padEnd(20)} ${job.description}\n`;
      jobs[key] = job.description;
    }
    human += '\n';
    printResult(flags, human, { jobs });
    return 0;
  }

  if (action === 'run') {
    const jobName = flags.args[1];
    if (!jobName) {
      printError(flags, 'agentfs cron run: job name required', 'MISSING_JOB_NAME');
      return 1;
    }

    const result = await runCronJob(jobName, vaultRoot);
    if (result.success) {
      printResult(flags, `✓ ${result.message}`, { result });
    } else {
      printError(flags, `✗ ${result.message}`, 'CRON_JOB_FAILED', { result });
    }
    return result.success ? 0 : 1;
  }

  if (action === 'run-all') {
    const results = await runAllCronJobs(vaultRoot);
    let hasFailure = false;

    let human = '\nCron Run Results\n' + '═'.repeat(50) + '\n';
    for (const result of results) {
      const icon = result.success ? '✓' : '✗';
      human += `  ${icon} [${result.job}] ${result.message}\n`;
      if (!result.success) hasFailure = true;
    }
    human += '\n';

    printResult(flags, human, { results });
    return hasFailure ? 1 : 0;
  }

  printError(flags, `agentfs cron: unknown action '${action}'`, 'UNKNOWN_ACTION');
  return 1;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printCronUsage(): void {
  process.stdout.write('\nUsage: agentfs cron <action>\n\n');
  process.stdout.write('Actions:\n');
  process.stdout.write('  list                  List all registered cron jobs\n');
  process.stdout.write('  run <job>             Run a specific cron job\n');
  process.stdout.write('  run-all               Run all registered cron jobs\n\n');
}
