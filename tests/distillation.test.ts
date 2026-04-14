/**
 * Tests for the distillation cron job.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { distillationJob } from '../src/cron/jobs/distillation.js';
import { writeEpisodicEntry } from '../src/memory/episodic.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-distillation-'));
  await fs.mkdir(path.join(tmpDir, '.agentos/memory/episodic'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.agentos/proc'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('distillationJob', () => {
  it('returns error when semantic memory is missing', async () => {
    const result = await distillationJob.run(tmpDir);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/semantic memory/i);
  });

  it('succeeds with semantic.md present but no episodic entries', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentos/memory/semantic.md'),
      'FACT: [active] primary stack is TypeScript\n',
    );
    const result = await distillationJob.run(tmpDir);
    expect(result.success).toBe(true);
    expect(result.details?.datesScanned).toBe(0);
    expect(result.details?.promoted).toBe(0);
  });

  it('promotes a lesson that appears in 2+ distinct episodic entries', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentos/memory/semantic.md'),
      'FACT: [active] primary stack is TypeScript\n',
    );

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    await writeEpisodicEntry(tmpDir, {
      date: today,
      events: [],
      decisions: [],
      lessons: ['always write tests before code'],
    });
    await writeEpisodicEntry(tmpDir, {
      date: yesterday,
      events: [],
      decisions: [],
      lessons: ['always write tests before code'],
    });

    const result = await distillationJob.run(tmpDir);
    expect(result.success).toBe(true);
    expect(result.details?.promoted).toBe(1);

    const semantic = await fs.readFile(
      path.join(tmpDir, '.agentos/memory/semantic.md'),
      'utf8',
    );
    expect(semantic).toContain('PATTERN:');
    expect(semantic).toContain('always write tests before code');
  });

  it('does not promote a lesson that appears only once', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentos/memory/semantic.md'),
      'FACT: [active] primary stack is TypeScript\n',
    );

    const today = new Date().toISOString().slice(0, 10);
    await writeEpisodicEntry(tmpDir, {
      date: today,
      events: [],
      decisions: [],
      lessons: ['use immutable data structures'],
    });

    const result = await distillationJob.run(tmpDir);
    expect(result.success).toBe(true);
    expect(result.details?.promoted).toBe(0);
  });

  it('writes an episodic event after running', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentos/memory/semantic.md'),
      'FACT: [active] primary stack is TypeScript\n',
    );

    await distillationJob.run(tmpDir);

    const today = new Date().toISOString().slice(0, 10);
    const episodicPath = path.join(tmpDir, '.agentos/memory/episodic', `${today}.md`);
    const content = await fs.readFile(episodicPath, 'utf8');
    expect(content).toContain('Distillation ran');
  });

  it('has correct metadata', () => {
    expect(distillationJob.name).toBe('distillation');
    expect(distillationJob.description).toBeTruthy();
  });
});
