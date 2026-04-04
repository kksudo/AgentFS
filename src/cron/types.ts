/**
 * Cron job types.
 * @module cron/types
 */

/** Result returned by every cron job execution. */
export interface CronResult {
  success: boolean;
  job: string;
  message: string;
  details?: Record<string, unknown>;
}

/** A cron job that can be run against a vault. */
export interface CronJob {
  /** Human-readable job name. */
  name: string;
  /** Short description of what this job does. */
  description: string;
  /** Execute the job. */
  run(vaultRoot: string): Promise<CronResult>;
}
