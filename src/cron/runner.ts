/**
 * Cron job runner — scheduled tasks for memory maintenance.
 *
 * Provides a registry of cron jobs that can be triggered by:
 * - Session end hooks (consolidation)
 * - Manual CLI invocation (`agentfs cron run <job>`)
 * - Future: actual cron scheduling via OS-level timers
 *
 * Each job implements the `CronJob` interface and is registered
 * in the `CRON_REGISTRY`.
 *
 * @module cron/runner
 */

import type { CronJob, CronResult } from './types.js';
import { consolidateJob } from './jobs/consolidate.js';
import { heartbeatJob } from './jobs/heartbeat.js';
import { inboxTriageJob } from './jobs/inbox-triage.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All available cron jobs, keyed by name. */
export const CRON_REGISTRY: Record<string, CronJob> = {
  consolidate: consolidateJob,
  heartbeat: heartbeatJob,
  'inbox-triage': inboxTriageJob,
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a single cron job by name.
 *
 * @param name      - Job name from the registry
 * @param vaultRoot - Absolute path to vault root
 * @returns CronResult with success flag, message, and optional details
 */
export async function runCronJob(
  name: string,
  vaultRoot: string,
): Promise<CronResult> {
  const job = CRON_REGISTRY[name];
  if (!job) {
    return {
      success: false,
      job: name,
      message: `Unknown cron job: '${name}'`,
    };
  }

  try {
    return await job.run(vaultRoot);
  } catch (err) {
    return {
      success: false,
      job: name,
      message: `Job '${name}' failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Run all registered cron jobs.
 *
 * @param vaultRoot - Absolute path to vault root
 * @returns Array of CronResults, one per job
 */
export async function runAllCronJobs(
  vaultRoot: string,
): Promise<CronResult[]> {
  const results: CronResult[] = [];
  for (const [name] of Object.entries(CRON_REGISTRY)) {
    results.push(await runCronJob(name, vaultRoot));
  }
  return results;
}
