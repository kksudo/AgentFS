/**
 * Heartbeat cron job — Story 6.4.
 *
 * Writes periodic status to `.agentos/proc/status.md` so that
 * runtime state is observable.
 *
 * @module cron/jobs/heartbeat
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CronJob, CronResult } from '../types.js';

export const heartbeatJob: CronJob = {
  name: 'heartbeat',
  description: 'Write runtime status to .agentos/proc/status.md',

  async run(vaultRoot: string): Promise<CronResult> {
    const procDir = path.join(vaultRoot, '.agentos/proc');
    await fs.mkdir(procDir, { recursive: true });

    const statusPath = path.join(procDir, 'status.md');
    const now = new Date();
    const timestamp = now.toISOString();

    // Check for overdue tasks in Tasks/ directory
    let overdueTasks: string[] = [];
    const tasksDir = path.join(vaultRoot, 'Tasks');
    try {
      const files = await fs.readdir(tasksDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      for (const file of mdFiles) {
        const content = await fs.readFile(path.join(tasksDir, file), 'utf8');
        const dueLine = content.split('\n').find((l) => l.startsWith('due:'));
        if (dueLine) {
          const dueDate = dueLine.replace('due:', '').trim();
          if (dueDate <= now.toISOString().slice(0, 10)) {
            overdueTasks.push(file.replace('.md', ''));
          }
        }
      }
    } catch {
      // No Tasks/ directory — that's fine
    }

    const lines: string[] = [
      '# Agent Status',
      '',
      `**Last heartbeat:** ${timestamp}`,
      `**Status:** active`,
      '',
    ];

    if (overdueTasks.length > 0) {
      lines.push('## Overdue Tasks');
      for (const task of overdueTasks) {
        lines.push(`- ⚠️ ${task}`);
      }
      lines.push('');
    }

    await fs.writeFile(statusPath, lines.join('\n'), 'utf8');

    return {
      success: true,
      job: 'heartbeat',
      message: `Heartbeat written at ${timestamp}. ${overdueTasks.length} overdue task(s).`,
      details: {
        timestamp,
        overdueTasks: overdueTasks.length,
      },
    };
  },
};
