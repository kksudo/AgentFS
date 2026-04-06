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

import fs from 'node:fs/promises';
import path from 'node:path';
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

  const lockDir = path.join(vaultRoot, '.agentos/proc/locks');
  const signalDir = path.join(vaultRoot, '.agentos/proc/signals');
  const lockPath = path.join(lockDir, `${name}.lock`);
  const signalPath = path.join(signalDir, `${name}.signal`);

  await fs.mkdir(lockDir, { recursive: true });
  await fs.mkdir(signalDir, { recursive: true });

  // 1. Check for existing lock
  try {
    await fs.stat(lockPath);
    // If we're here, the file exists. Check if it's stale (optional, but for now just fail)
    return {
      success: false,
      job: name,
      message: `Job '${name}' is already running (lock file exists: ${lockPath})`,
    };
  } catch {
    // File doesn't exist — proceed to create it
  }

  // 2. Create lock
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), 'utf8');

  try {
    const result = await job.run(vaultRoot);

    // 3. Create signal on success
    if (result.success) {
      await fs.writeFile(signalPath, JSON.stringify({ lastRun: new Date().toISOString(), status: 'success' }), 'utf8');
    }

    return result;
  } catch (err) {
    return {
      success: false,
      job: name,
      message: `Job '${name}' failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    // 4. Always remove lock
    try {
      await fs.unlink(lockPath);
    } catch {
      // Ignore cleanup errors
    }
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
