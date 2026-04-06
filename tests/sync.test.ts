import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { detectDrift } from '../src/sync/openclaw-sync.js';
import { syncCommand } from '../src/commands/sync.js';
import { parseCliFlags } from '../src/utils/cli-flags.js';

describe('sync system', () => {
  let tmpVault: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-sync-'));
    origCwd = process.cwd();
    process.chdir(tmpVault);
    await fs.mkdir(path.join(tmpVault, '.agentos/memory'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  describe('detectDrift', () => {
    test('reports missing files', async () => {
      const results = await detectDrift(tmpVault, ['CLAUDE.md', 'AGENT-MAP.md']);
      expect(results).toHaveLength(2);
      expect(results[0].currentHash).toBe('MISSING');
    });

    test('reports present files with hash', async () => {
      await fs.writeFile(path.join(tmpVault, 'CLAUDE.md'), 'test content');
      const results = await detectDrift(tmpVault, ['CLAUDE.md']);
      expect(results[0].currentHash).not.toBe('MISSING');
    });
  });

  describe('CLI commands', () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

    beforeEach(() => { jest.clearAllMocks(); });
    afterAll(() => { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); });

    test('sync shows drift detection', async () => {
      const code = await syncCommand(parseCliFlags([]));
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Drift Detection'));
    });

    test('sync --help shows usage', async () => {
      const code = await syncCommand(parseCliFlags(['--help']));
      expect(code).toBe(0);
    });
  });
});
