import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  writeEpisodicEntry,
  readEpisodicEntry,
  listEpisodicDates,
} from '../src/memory/episodic.js';

describe('memory/episodic', () => {
  let tmpVault: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-episodic-'));
  });

  afterEach(async () => {
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  test('creates a new episodic file with events, decisions, and lessons', async () => {
    await writeEpisodicEntry(tmpVault, {
      date: '2026-04-04',
      events: ['Implemented memory system', 'Fixed ENOENT bug'],
      decisions: ['Use Tulving taxonomy'],
      lessons: ['Always test edge cases'],
    });

    const content = await readEpisodicEntry(tmpVault, '2026-04-04');
    expect(content).not.toBeNull();
    expect(content).toContain('# 2026-04-04');
    expect(content).toContain('Implemented memory system');
    expect(content).toContain('Fixed ENOENT bug');
    expect(content).toContain('Use Tulving taxonomy');
    expect(content).toContain('Always test edge cases');
  });

  test('appends new events without duplicating existing ones', async () => {
    await writeEpisodicEntry(tmpVault, {
      date: '2026-04-04',
      events: ['Event A'],
      decisions: [],
      lessons: [],
    });

    await writeEpisodicEntry(tmpVault, {
      date: '2026-04-04',
      events: ['Event A', 'Event B'],
      decisions: ['Decision X'],
      lessons: [],
    });

    const content = await readEpisodicEntry(tmpVault, '2026-04-04');
    expect(content).not.toBeNull();
    // Event A should appear only once (from original creation)
    const matches = content!.match(/Event A/g);
    expect(matches).toHaveLength(1);
    // Event B should be appended
    expect(content).toContain('Event B');
    expect(content).toContain('Decision X');
  });

  test('returns null for non-existent date', async () => {
    const content = await readEpisodicEntry(tmpVault, '1999-01-01');
    expect(content).toBeNull();
  });

  test('listEpisodicDates returns sorted dates', async () => {
    await writeEpisodicEntry(tmpVault, {
      date: '2026-04-02',
      events: ['older'],
      decisions: [],
      lessons: [],
    });
    await writeEpisodicEntry(tmpVault, {
      date: '2026-04-04',
      events: ['newer'],
      decisions: [],
      lessons: [],
    });

    const dates = await listEpisodicDates(tmpVault);
    expect(dates).toEqual(['2026-04-02', '2026-04-04']);
  });

  test('listEpisodicDates returns empty array if directory missing', async () => {
    const dates = await listEpisodicDates(tmpVault);
    expect(dates).toEqual([]);
  });
});
