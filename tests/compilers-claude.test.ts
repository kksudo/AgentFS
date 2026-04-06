import fs from 'node:fs/promises';
import { jest } from '@jest/globals';
import { claudeCompiler } from '../src/compilers/claude.js';
import type { CompileContext } from '../src/types/index.js';

describe('compilers/claude', () => {
  const dummyContext: CompileContext = {
    dryRun: false,
    vaultRoot: '/tmp/test',
    manifest: {
      version: '1.0',
      vault: { name: 'Claude Vault', owner: 'Owner' },
      agentos: { profile: 'personal' },
      agents: { primary: 'claude', supported: ['claude'] },
      paths: { inbox: 'Inbox', daily: '', projects: '', resources: '', archive: '' },
      boot: { sequence: ['00-identity.md'] },
      modules: ['bmad'],
      frontmatter: { required: [], standard: [] }
    },
    initScripts: {
      '00-identity.md': 'Identity Content',
    },
    semanticMemory: null,
    corrections: 'Corrections Content',
  };

  test('name is claude', () => {
    expect(claudeCompiler.name).toBe('claude');
  });

  test('supports security-enforce feature natively', () => {
    expect(claudeCompiler.supports('security-enforce')).toBe(true);
    expect(claudeCompiler.supports('unknown-feature')).toBe(false);
  });

  test('compile populates CLAUDE.md with correct context', async () => {
    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(
      'Vault: {{vault.name}} | Profile: {{agentos.profile}} | ' +
      'Identity: {{identityClean}} | Corrections: {{#each correctionsEntries}}{{this}}{{/each}} | Modules: {{join modules ","}}'
    ) as jest.SpiedFunction<typeof fs.readFile>;

    const result = await claudeCompiler.compile(dummyContext);

    expect(result.agent).toBe('claude');
    expect(result.outputs.length).toBeGreaterThanOrEqual(1);

    const output = result.outputs.find(o => o.path === 'CLAUDE.md')!;
    expect(output).toBeDefined();
    expect(output.path).toBe('CLAUDE.md');
    expect(output.managed).toBe(true);

    expect(output.content).toContain('Vault: Claude Vault');
    expect(output.content).toContain('Profile: personal');
    expect(output.content).toContain('Corrections: Corrections Content');
    expect(output.content).toContain('Modules: bmad');

    expect(result.summary).toContain('Compiled CLAUDE.md');
    expect(result.summary).toContain('Claude Vault');

    readFileSpy.mockRestore();
  });

  test('compile handles null modules gracefully', async () => {
    const ctx = {
      ...dummyContext,
      manifest: { ...dummyContext.manifest, modules: undefined },
      initScripts: {},
      corrections: null
    };

    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(
      'Modules: {{#if modules}}Yes{{else}}No{{/if}} | Identity: {{#if identity}}Yes{{else}}No{{/if}}'
    ) as jest.SpiedFunction<typeof fs.readFile>;

    const result = await claudeCompiler.compile(ctx);
    expect(result.outputs[0].content).toContain('Modules: No');
    expect(result.outputs[0].content).toContain('Identity: No');

    readFileSpy.mockRestore();
  });
});
