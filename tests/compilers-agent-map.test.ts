import fs from 'node:fs/promises';
import { jest } from '@jest/globals';
import { generateAgentsFile } from '../src/compilers/agent-map.js';
import type { CompileContext, FhsPaths } from '../src/types/index.js';

describe('compilers/agent-map', () => {
  const dummyPaths: FhsPaths = {
    tmp: 'Inbox',
    log: 'Daily',
    spool: 'Tasks',
    home: 'Projects',
    srv: 'Content',
    usr_share: 'Knowledge',
    proc_people: 'People',
    etc: '.agentos',
    archive: 'Archive',
  };

  const mockContext: CompileContext = {
    dryRun: false,
    vaultRoot: '/tmp/test',
    manifest: {
      agentos: { version: '0.1.0', profile: 'personal' },
      vault: { name: 'Test Vault', owner: 'Alice', created: '2026-04-04' },
      agents: { primary: 'claude', supported: ['claude', 'openclaw'] },
      paths: dummyPaths,
      boot: { sequence: ['00-identity', '10-rules'] },
      frontmatter: { required: ['date', 'tags'] },
      modules: ['bmad'],
    },
    initScripts: {},
    semanticMemory: null,
    corrections: null,
  };

  test('generateAgentsFile generates managed output with correct data', async () => {
    // Spying on fs.readFile allows us to avoid filesystem side effects
    // while we provide a mock template to compile.
    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(
      'Target: {{vault.name}} | Owner: {{vault.owner}} | profile: {{agentos.profile}} | ' +
      'Primary: {{agents.primary}} | Sup: {{join agents.supported ","}} | Modules: {{join modules ","}}'
    ) as jest.SpiedFunction<typeof fs.readFile>;

    const output = await generateAgentsFile(mockContext);

    expect(output.path).toBe('AGENTS.md');
    expect(output.managed).toBe(true);
    expect(output.content).toContain('Target: Test Vault');
    expect(output.content).toContain('Owner: Alice');
    expect(output.content).toContain('profile: personal');
    expect(output.content).toContain('Primary: claude');
    expect(output.content).toContain('Sup: claude,openclaw');
    expect(output.content).toContain('Modules: bmad');

    readFileSpy.mockRestore();
  });
  
  test('generateAgentsFile handles missing optional modules gracefully', async () => {
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

    const output = await generateAgentsFile(ctxWithoutModules);
    expect(output.content).toContain('Modules: None');

    readFileSpy.mockRestore();
  });
});
