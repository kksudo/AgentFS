import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createDefaultAnswers } from '../src/generators/prompts.js';
import { parseCliFlags, resolveSetupAnswers } from '../src/utils/cli-flags.js';

describe('resolveSetupAnswers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-resolve-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('uses JSON input in non-interactive mode', async () => {
    const flags = parseCliFlags([
      '--json', '{"vaultName":"ai-vault","ownerName":"bot","profile":"company"}',
      '--dir', tmpDir,
    ]);

    const answers = await resolveSetupAnswers(flags);

    expect(answers.vaultName).toBe('ai-vault');
    expect(answers.ownerName).toBe('bot');
    expect(answers.profile).toBe('company');
    expect(answers.targetDir).toBe(tmpDir);
    // Defaults filled in
    expect(answers.primaryAgent).toBe('claude');
    expect(answers.supportedAgents).toEqual(['claude']);
    expect(answers.modules).toEqual([]);
  });

  test('uses config file in non-interactive mode', async () => {
    const configPath = path.join(tmpDir, 'setup.json');
    await fs.writeFile(configPath, JSON.stringify({
      vaultName: 'file-vault',
      profile: 'shared',
      primaryAgent: 'cursor',
      supportedAgents: ['cursor', 'claude'],
      modules: ['content'],
    }));

    const flags = parseCliFlags(['--config', configPath, '--dir', tmpDir]);
    const answers = await resolveSetupAnswers(flags);

    expect(answers.vaultName).toBe('file-vault');
    expect(answers.profile).toBe('shared');
    expect(answers.primaryAgent).toBe('cursor');
    expect(answers.supportedAgents).toEqual(['cursor', 'claude']);
    expect(answers.modules).toEqual(['content']);
    expect(answers.targetDir).toBe(tmpDir);
  });

  test('YAML config file works', async () => {
    const configPath = path.join(tmpDir, 'setup.yaml');
    await fs.writeFile(configPath, [
      'vaultName: yaml-vault',
      'ownerName: yaml-user',
      'profile: personal',
      'modules:',
      '  - career',
      '  - engineering',
    ].join('\n'));

    const flags = parseCliFlags(['--config', configPath]);
    const answers = await resolveSetupAnswers(flags);

    expect(answers.vaultName).toBe('yaml-vault');
    expect(answers.ownerName).toBe('yaml-user');
    expect(answers.modules).toEqual(['career', 'engineering']);
  });

  test('partial JSON input fills remaining with defaults', async () => {
    const flags = parseCliFlags(['--json', '{"vaultName":"minimal"}']);
    const answers = await resolveSetupAnswers(flags);

    expect(answers.vaultName).toBe('minimal');
    // All defaults applied
    expect(answers.ownerName).toBe('user');
    expect(answers.profile).toBe('personal');
    expect(answers.primaryAgent).toBe('claude');
  });

  test('empty JSON uses all defaults', async () => {
    const flags = parseCliFlags(['--json', '{}']);
    const answers = await resolveSetupAnswers(flags);
    const defaults = createDefaultAnswers();

    expect(answers.vaultName).toBe(defaults.vaultName);
    expect(answers.profile).toBe(defaults.profile);
    expect(answers.primaryAgent).toBe(defaults.primaryAgent);
  });

  test('--dir overrides targetDir from JSON', async () => {
    const flags = parseCliFlags([
      '--json', '{"vaultName":"x"}',
      '--dir', '/custom/path',
    ]);
    const answers = await resolveSetupAnswers(flags);
    expect(answers.targetDir).toBe('/custom/path');
  });
});
