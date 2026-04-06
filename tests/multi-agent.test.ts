import { openclawCompiler } from '../src/compilers/openclaw.js';
import { cursorCompiler } from '../src/compilers/cursor.js';
import type { CompileContext } from '../src/types/index.js';

const mockContext: CompileContext = {
  dryRun: false,
  vaultRoot: '/tmp/test',
  manifest: {
    version: '1.0',
    vault: { name: 'Test Vault', owner: 'Alice' },
    agentos: { profile: 'personal' },
    agents: { primary: 'claude', supported: ['claude', 'openclaw', 'cursor'] },
    paths: { inbox: 'Inbox', daily: 'Daily', projects: 'Projects', resources: 'Resources', archive: 'Archive' },
    boot: { sequence: ['00-identity.md', '10-rules.md'] },
    modules: [],
  },
  initScripts: {
    '00-identity.md': 'I am a helpful assistant.',
  },
  semanticMemory: 'PREF: dark mode\nFACT: [active] uses TS',
  corrections: null,
};

describe('compilers/openclaw', () => {
  test('name is openclaw', () => {
    expect(openclawCompiler.name).toBe('openclaw');
  });

  test('does not support security-enforce', () => {
    expect(openclawCompiler.supports('security-enforce')).toBe(false);
  });

  test('compile generates SOUL.md', async () => {
    const result = await openclawCompiler.compile(mockContext);
    expect(result.agent).toBe('openclaw');
    expect(result.outputs.length).toBeGreaterThanOrEqual(1);

    const soul = result.outputs.find(o => o.path === '.openclaw/SOUL.md');
    expect(soul).toBeDefined();
    expect(soul!.managed).toBe(true);

    const identity = result.outputs.find(o => o.path === '.openclaw/IDENTITY.md');
    expect(identity).toBeDefined();
    expect(identity!.content).toContain('Test Vault');
  });

  test('handles missing identity gracefully', async () => {
    const ctx = { ...mockContext, initScripts: {} };
    const result = await openclawCompiler.compile(ctx);
    const identity = result.outputs.find(o => o.path === '.openclaw/IDENTITY.md');
    expect(identity).toBeDefined();
  });
});

describe('compilers/cursor', () => {
  test('name is cursor', () => {
    expect(cursorCompiler.name).toBe('cursor');
  });

  test('does not support security-enforce', () => {
    expect(cursorCompiler.supports('security-enforce')).toBe(false);
  });

  test('compile generates .cursor/rules/agentfs-global.mdc', async () => {
    const result = await cursorCompiler.compile(mockContext);
    expect(result.agent).toBe('cursor');
    expect(result.outputs).toHaveLength(1);

    const output = result.outputs[0];
    expect(output.path).toBe('.cursor/rules/agentfs-global.mdc');
    expect(output.managed).toBe(true);
    expect(output.content).toContain('Test Vault');
    expect(output.content).toContain('I am a helpful assistant');
    expect(output.content).toContain('Inbox');
    expect(output.content).toContain('00-identity.md');
  });

  test('handles missing paths gracefully', async () => {
    const ctx = {
      ...mockContext,
      manifest: { ...mockContext.manifest, paths: undefined as any },
    };
    const result = await cursorCompiler.compile(ctx);
    expect(result.outputs[0].content).not.toContain('Directory Structure');
  });
});
