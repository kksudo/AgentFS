import fs from 'node:fs/promises';
import { jest } from '@jest/globals';
import { generateAgentMap } from '../src/compilers/agent-map.js';
import type { CompileContext, FhsPaths } from '../src/types/index.js';

describe('compilers/agent-map', () => {
  const dummyPaths: FhsPaths = {
    inbox: 'Inbox',
    daily: 'Daily',
    projects: 'Projects',
    resources: 'Resources',
    archive: 'Archive',
  };

  const mockContext: CompileContext = {
    dryRun: false,
    vaultRoot: '/tmp/test',
    manifest: {
      version: '1.0',
      vault: { name: 'Test Vault', owner: 'Alice' },
      agentos: { profile: 'personal' },
      agents: { primary: 'claude', supported: ['claude', 'omc'] },
      paths: dummyPaths,
      boot: { sequence: ['00-identity', '10-rules'] },
      modules: ['bmad'],
    },
    initScripts: {},
    semanticMemory: null,
    corrections: null,
  };

  test('generateAgentMap generates managed output with correct data', async () => {
    // Spying on fs.readFile allows us to avoid filesystem side effects
    // while we provide a mock template to compile.
    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(
      'Target: {{vault.name}} | Owner: {{vault.owner}} | profile: {{agentos.profile}} | ' +
      'Primary: {{agents.primary}} | Sup: {{join agents.supported ","}} | Modules: {{join modules ","}}'
    ) as jest.SpiedFunction<typeof fs.readFile>;

    const output = await generateAgentMap(mockContext);

    expect(output.path).toBe('AGENT-MAP.md');
    expect(output.managed).toBe(true);
    expect(output.content).toContain('Target: Test Vault');
    expect(output.content).toContain('Owner: Alice');
    expect(output.content).toContain('profile: personal');
    expect(output.content).toContain('Primary: claude');
    expect(output.content).toContain('Sup: claude,omc');
    expect(output.content).toContain('Modules: bmad');

    readFileSpy.mockRestore();
  });
  
  test('generateAgentMap handles missing optional modules gracefully', async () => {
    const ctxWithoutModules = {
      ...mockContext,
      manifest: {
        ...mockContext.manifest,
        modules: undefined
      }
    };

    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(
      'Modules: {{#if modules.length}}{{join modules ","}}{{else}}None{{/if}}'
    ) as jest.SpiedFunction<typeof fs.readFile>;

    const output = await generateAgentMap(ctxWithoutModules);
    expect(output.content).toContain('Modules: None');

    readFileSpy.mockRestore();
  });
});
