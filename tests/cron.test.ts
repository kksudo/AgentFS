import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { runCronJob, runAllCronJobs, CRON_REGISTRY } from '../src/cron/runner.js';
import { cronCommand } from '../src/commands/cron.js';
import { parseCliFlags } from '../src/utils/cli-flags.js';

describe('cron system', () => {
  let tmpVault: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-cron-'));
    origCwd = process.cwd();
    process.chdir(tmpVault);

    // Set up minimal vault structure
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/episodic'), { recursive: true });
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/procedural'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  describe('runner', () => {
    test('CRON_REGISTRY contains expected jobs', () => {
      expect(CRON_REGISTRY).toHaveProperty('consolidate');
      expect(CRON_REGISTRY).toHaveProperty('heartbeat');
      expect(CRON_REGISTRY).toHaveProperty('inbox-triage');
    });

    test('runCronJob returns error for unknown job', async () => {
      const result = await runCronJob('nonexistent', tmpVault);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown cron job');
    });

    test('consolidate job fails without semantic memory', async () => {
      const result = await runCronJob('consolidate', tmpVault);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No semantic memory');
    });

    test('consolidate job succeeds with semantic memory', async () => {
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'PREF: dark mode\nFACT: [active] uses TS\n'
      );

      const result = await runCronJob('consolidate', tmpVault);
      expect(result.success).toBe(true);
      expect(result.message).toContain('2 active');
      expect(result.details?.semantic).toEqual({ active: 2, superseded: 0 });

      // Should have created episodic entry for today
      const today = new Date().toISOString().slice(0, 10);
      const episodic = await fs.readFile(
        path.join(tmpVault, '.agentos/memory/episodic', `${today}.md`),
        'utf8'
      );
      expect(episodic).toContain('consolidation');
    });

    test('heartbeat job writes status.md', async () => {
      const result = await runCronJob('heartbeat', tmpVault);
      expect(result.success).toBe(true);

      const status = await fs.readFile(
        path.join(tmpVault, '.agentos/proc/status.md'),
        'utf8'
      );
      expect(status).toContain('# Agent Status');
      expect(status).toContain('active');
    });

    test('heartbeat detects overdue tasks', async () => {
      await fs.mkdir(path.join(tmpVault, 'Tasks'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, 'Tasks/old-task.md'),
        '---\ndue: 2020-01-01\n---\nOld task\n'
      );

      const result = await runCronJob('heartbeat', tmpVault);
      expect(result.success).toBe(true);
      expect(result.message).toContain('1 overdue');
    });

    test('inbox-triage with empty inbox', async () => {
      const result = await runCronJob('inbox-triage', tmpVault);
      expect(result.success).toBe(true);
      expect(result.message).toContain('No Inbox/');
    });

    test('inbox-triage with tagged files', async () => {
      await fs.mkdir(path.join(tmpVault, 'Inbox'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, 'Inbox/note.md'),
        '---\ntags: [project, work]\n---\nSome note\n'
      );

      const result = await runCronJob('inbox-triage', tmpVault);
      expect(result.success).toBe(true);
      expect(result.message).toContain('1 file');
      expect(result.message).toContain('1 with suggestions');
    });

    test('runAllCronJobs runs all jobs', async () => {
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'PREF: test\n'
      );

      const results = await runAllCronJobs(tmpVault);
      expect(results).toHaveLength(3);
      // At least consolidate and heartbeat should succeed
      const consolidateResult = results.find((r) => r.job === 'consolidate');
      expect(consolidateResult?.success).toBe(true);
    });
  });

  describe('commands/cron CLI', () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterAll(() => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    test('prints usage with no args', async () => {
      const code = await cronCommand(parseCliFlags([]));
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: agentfs cron'));
    });

    test('lists jobs', async () => {
      const code = await cronCommand(parseCliFlags(['list']));
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('consolidate'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('heartbeat'));
    });

    test('run requires job name', async () => {
      const code = await cronCommand(parseCliFlags(['run']));
      expect(code).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('job name required'));
    });

    test('run executes a specific job', async () => {
      const code = await cronCommand(parseCliFlags(['run', 'heartbeat']));
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Heartbeat written'));
    });

    test('run-all executes all jobs', async () => {
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'PREF: test\n'
      );

      const code = await cronCommand(parseCliFlags(['run-all']));
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Cron Run Results'));
    });

    test('unknown action returns error', async () => {
      const code = await cronCommand(parseCliFlags(['bogus']));
      expect(code).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown action 'bogus'"));
    });
  });
});
