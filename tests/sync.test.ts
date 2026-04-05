import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { importFromOmc, exportToOmc, detectDrift } from '../src/sync/sync.js';
import { importCommand, syncCommand } from '../src/commands/sync.js';

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

  describe('importFromOmc', () => {
    test('imports facts from omc json', async () => {
      await fs.mkdir(path.join(tmpVault, '.omc'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, '.omc/project-memory.json'),
        JSON.stringify({ facts: ['Uses TypeScript', 'Prefers dark mode'] })
      );
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        '# Semantic Memory\n'
      );

      const result = await importFromOmc(tmpVault);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
    });

    test('skips duplicates', async () => {
      await fs.mkdir(path.join(tmpVault, '.omc'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, '.omc/project-memory.json'),
        JSON.stringify({ facts: ['Uses TypeScript'] })
      );
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'FACT: [active] Uses TypeScript\n'
      );

      const result = await importFromOmc(tmpVault);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    test('returns error if .omc file missing', async () => {
      const result = await importFromOmc(tmpVault);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('handles entries with content property', async () => {
      await fs.mkdir(path.join(tmpVault, '.omc'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, '.omc/project-memory.json'),
        JSON.stringify({ entries: [{ content: 'From entries' }] })
      );
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        '# Semantic Memory\n'
      );

      const result = await importFromOmc(tmpVault);
      expect(result.imported).toBe(1);
    });
  });

  describe('exportToOmc', () => {
    test('exports semantic entries to .omc format', async () => {
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'PREF: dark mode\nFACT: [active] uses TS\n'
      );

      const count = await exportToOmc(tmpVault);
      expect(count).toBe(2);

      const omc = JSON.parse(
        await fs.readFile(path.join(tmpVault, '.omc/project-memory.json'), 'utf8')
      );
      expect(omc.facts).toHaveLength(2);
      expect(omc.source).toBe('agentfs');
    });

    test('returns 0 if no semantic memory', async () => {
      const count = await exportToOmc(tmpVault);
      expect(count).toBe(0);
    });
  });

  describe('detectDrift', () => {
    test('reports missing files', async () => {
      const results = await detectDrift(tmpVault, ['CLAUDE.md', 'AGENTS.md']);
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

    test('import --help shows usage', async () => {
      const code = await importCommand(['--help']);
      expect(code).toBe(0);
    });

    test('import memory works', async () => {
      await fs.mkdir(path.join(tmpVault, '.omc'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, '.omc/project-memory.json'),
        JSON.stringify({ facts: ['test fact'] })
      );
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        '# Semantic Memory\n'
      );

      const code = await importCommand(['memory']);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('1 imported'));
    });

    test('import unknown source fails', async () => {
      const code = await importCommand(['bogus']);
      expect(code).toBe(1);
    });

    test('sync shows drift detection', async () => {
      const code = await syncCommand([]);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Drift Detection'));
    });

    test('sync push exports to omc', async () => {
      await fs.writeFile(
        path.join(tmpVault, '.agentos/memory/semantic.md'),
        'PREF: test\n'
      );
      const code = await syncCommand(['push']);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Exported 1'));
    });

    test('sync --help shows usage', async () => {
      const code = await syncCommand(['--help']);
      expect(code).toBe(0);
    });
  });
});
