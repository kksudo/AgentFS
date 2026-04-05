/**
 * Inbox triage cron job — Story 6.3.
 *
 * Scans `Inbox/` for markdown files and suggests routing based on
 * frontmatter tags. Does NOT automatically move files — suggestions only.
 *
 * @module cron/jobs/inbox-triage
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CronJob, CronResult } from '../types.js';

/** Simple frontmatter tag extraction. */
function extractTags(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  const frontmatter = match[1];
  const tagLine = frontmatter.split('\n').find((l) => l.startsWith('tags:'));
  if (!tagLine) return [];

  // Support `tags: [a, b]` or `tags: a, b`
  const raw = tagLine.replace('tags:', '').trim();
  return raw
    .replace(/[\[\]]/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Suggest a target folder based on tags. */
function suggestFolder(tags: string[]): string | null {
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  if (tagSet.has('project') || tagSet.has('work')) return 'Projects';
  if (tagSet.has('daily') || tagSet.has('journal')) return 'Daily';
  if (tagSet.has('resource') || tagSet.has('reference')) return 'Resources';
  if (tagSet.has('person') || tagSet.has('contact')) return 'People';
  if (tagSet.has('engineering') || tagSet.has('devops')) return 'Engineering';
  if (tagSet.has('career') || tagSet.has('job')) return 'Career';

  return null;
}

export const inboxTriageJob: CronJob = {
  name: 'inbox-triage',
  description: 'Scan Inbox/ and suggest file routing based on tags',

  async run(vaultRoot: string): Promise<CronResult> {
    const inboxDir = path.join(vaultRoot, 'Inbox');

    let files: string[];
    try {
      const entries = await fs.readdir(inboxDir);
      files = entries.filter((f) => f.endsWith('.md'));
    } catch {
      return {
        success: true,
        job: 'inbox-triage',
        message: 'No Inbox/ directory found. Nothing to triage.',
      };
    }

    if (files.length === 0) {
      return {
        success: true,
        job: 'inbox-triage',
        message: 'Inbox is empty. Nothing to triage.',
      };
    }

    const suggestions: Array<{ file: string; tags: string[]; suggestion: string | null }> = [];

    for (const file of files) {
      const content = await fs.readFile(path.join(inboxDir, file), 'utf8');
      const tags = extractTags(content);
      const suggestion = suggestFolder(tags);
      suggestions.push({ file, tags, suggestion });
    }

    const withSuggestion = suggestions.filter((s) => s.suggestion !== null);

    return {
      success: true,
      job: 'inbox-triage',
      message: `Triaged ${files.length} file(s): ${withSuggestion.length} with suggestions, ${files.length - withSuggestion.length} unclassified.`,
      details: { suggestions },
    };
  },
};
