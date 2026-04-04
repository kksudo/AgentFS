/**
 * Consolidation cron job — Story 6.1.
 *
 * Runs at session end to snapshot memory state:
 * - Reads semantic.md and reports active/superseded counts
 * - Lists episodic entries
 * - Lists procedural skills
 *
 * Future enhancement: auto-extract new facts from session transcript,
 * detect contradictions, and trigger decay on stale patterns.
 *
 * @module cron/jobs/consolidate
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CronJob, CronResult } from '../types.js';
import { parseSemanticMemory, isSuperseded } from '../../memory/index.js';
import { listEpisodicDates } from '../../memory/episodic.js';
import { listProceduralSkills } from '../../memory/procedural.js';
import { writeEpisodicEntry } from '../../memory/episodic.js';

export const consolidateJob: CronJob = {
  name: 'consolidate',
  description: 'Snapshot memory state at session end',

  async run(vaultRoot: string): Promise<CronResult> {
    const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

    let semanticContent: string;
    try {
      semanticContent = await fs.readFile(semanticPath, 'utf8');
    } catch {
      return {
        success: false,
        job: 'consolidate',
        message: 'No semantic memory found. Run `agentfs onboard` first.',
      };
    }

    const entries = parseSemanticMemory(semanticContent);
    const active = entries.filter((e) => !isSuperseded(e));
    const superseded = entries.filter((e) => isSuperseded(e));

    const episodicDates = await listEpisodicDates(vaultRoot);
    const proceduralSkills = await listProceduralSkills(vaultRoot);

    // Write an episodic entry for today's consolidation
    const today = new Date().toISOString().slice(0, 10);
    await writeEpisodicEntry(vaultRoot, {
      date: today,
      events: [`Memory consolidation ran`],
      decisions: [],
      lessons: [],
    });

    return {
      success: true,
      job: 'consolidate',
      message: `Consolidation complete. Semantic: ${active.length} active, ${superseded.length} superseded. Episodic: ${episodicDates.length} days. Procedural: ${proceduralSkills.length} skills.`,
      details: {
        semantic: { active: active.length, superseded: superseded.length },
        episodic: episodicDates.length,
        procedural: proceduralSkills.length,
      },
    };
  },
};
