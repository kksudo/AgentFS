import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCliFlags, loadConfigFile, resolveInput } from '../src/utils/cli-flags.js';

describe('utils/cli-flags', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-flags-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('parseCliFlags', () => {
    test('returns defaults when no flags given', () => {
      const flags = parseCliFlags([]);
      expect(flags.jsonInput).toBeNull();
      expect(flags.configPath).toBeNull();
      expect(flags.outputFormat).toBe('human');
      expect(flags.nonInteractive).toBe(false);
      expect(flags.args).toEqual([]);
    });

    test('parses --json with valid JSON', () => {
      const flags = parseCliFlags(['--json', '{"vaultName":"test"}']);
      expect(flags.jsonInput).toEqual({ vaultName: 'test' });
      expect(flags.nonInteractive).toBe(true);
    });

    test('throws on invalid --json', () => {
      expect(() => parseCliFlags(['--json', 'not-json']))
        .toThrow('Invalid JSON after --json');
    });

    test('parses --config path', () => {
      const flags = parseCliFlags(['--config', '/tmp/setup.yaml']);
      expect(flags.configPath).toBe('/tmp/setup.yaml');
      expect(flags.nonInteractive).toBe(true);
    });

    test('parses --output json', () => {
      const flags = parseCliFlags(['--output', 'json']);
      expect(flags.outputFormat).toBe('json');
    });

    test('parses --dir path', () => {
      const flags = parseCliFlags(['--dir', '/tmp/vault']);
      expect(flags.targetDir).toBe('/tmp/vault');
    });

    test('preserves remaining positional args', () => {
      const flags = parseCliFlags(['claude', '--output', 'json', '--dry-run']);
      expect(flags.args).toEqual(['claude', '--dry-run']);
      expect(flags.outputFormat).toBe('json');
    });

    test('handles all flags together', () => {
      const flags = parseCliFlags([
        '--json', '{"profile":"company"}',
        '--output', 'json',
        '--dir', '/tmp/test',
        'extra-arg',
      ]);
      expect(flags.jsonInput).toEqual({ profile: 'company' });
      expect(flags.outputFormat).toBe('json');
      expect(flags.targetDir).toBe('/tmp/test');
      expect(flags.nonInteractive).toBe(true);
      expect(flags.args).toEqual(['extra-arg']);
    });

    test('--json without value does not crash', () => {
      const flags = parseCliFlags(['--json']);
      expect(flags.jsonInput).toBeNull();
    });

    test('--config without value does not crash', () => {
      const flags = parseCliFlags(['--config']);
      expect(flags.configPath).toBeNull();
    });
  });

  describe('loadConfigFile', () => {
    test('loads JSON config file', async () => {
      const configPath = path.join(tmpDir, 'config.json');
      await fs.writeFile(configPath, '{"vaultName":"json-vault","profile":"personal"}');
      const result = await loadConfigFile(configPath);
      expect(result).toEqual({ vaultName: 'json-vault', profile: 'personal' });
    });

    test('loads YAML config file', async () => {
      const configPath = path.join(tmpDir, 'config.yaml');
      await fs.writeFile(configPath, 'vaultName: yaml-vault\nprofile: company\n');
      const result = await loadConfigFile(configPath);
      expect(result).toEqual({ vaultName: 'yaml-vault', profile: 'company' });
    });

    test('throws on missing file', async () => {
      await expect(loadConfigFile('/nonexistent/file.json'))
        .rejects.toThrow();
    });
  });

  describe('resolveInput', () => {
    test('returns jsonInput if provided', async () => {
      const flags = parseCliFlags(['--json', '{"x":1}']);
      const result = await resolveInput(flags);
      expect(result).toEqual({ x: 1 });
    });

    test('loads config file if provided', async () => {
      const configPath = path.join(tmpDir, 'test.json');
      await fs.writeFile(configPath, '{"y":2}');
      const flags = parseCliFlags(['--config', configPath]);
      const result = await resolveInput(flags);
      expect(result).toEqual({ y: 2 });
    });

    test('returns null if neither flag provided', async () => {
      const flags = parseCliFlags([]);
      const result = await resolveInput(flags);
      expect(result).toBeNull();
    });

    test('--json takes priority over --config', async () => {
      const configPath = path.join(tmpDir, 'test.json');
      await fs.writeFile(configPath, '{"source":"file"}');
      const flags = parseCliFlags(['--json', '{"source":"inline"}', '--config', configPath]);
      const result = await resolveInput(flags);
      expect(result).toEqual({ source: 'inline' });
    });
  });
});
