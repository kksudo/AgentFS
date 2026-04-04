import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { memoryCommand } from '../src/commands/memory.js';

describe('commands/memory', () => {
  let tmpVault: string;
  let origCwd: string;
  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-memcli-'));
    origCwd = process.cwd();
    process.chdir(tmpVault);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('prints usage with no arguments', async () => {
    const code = await memoryCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: agentfs memory'));
  });

  test('prints usage with --help', async () => {
    const code = await memoryCommand(['--help']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: agentfs memory'));
  });

  test('show semantic — error when no semantic.md exists', async () => {
    const code = await memoryCommand(['show']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No semantic memory found'));
  });

  test('show semantic — displays entries with confidence', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory'), { recursive: true });
    await fs.writeFile(
      path.join(tmpVault, '.agentos/memory/semantic.md'),
      'PREF: dark mode\nFACT: [active] uses TypeScript\nPATTERN: [confidence:0.85] works mornings\nAVOID: LangChain\n'
    );

    const code = await memoryCommand(['show']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Semantic Memory'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('dark mode'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('85%'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Active: 4'));
  });

  test('show semantic — empty file', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos/memory/semantic.md'), '# Semantic Memory\n');

    const code = await memoryCommand(['show']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('empty'));
  });

  test('show episodic — lists dates', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/episodic'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos/memory/episodic/2026-04-04.md'), '# 2026-04-04\n');

    const code = await memoryCommand(['show', 'episodic']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('2026-04-04'));
  });

  test('show episodic — empty', async () => {
    const code = await memoryCommand(['show', 'episodic']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No episodic'));
  });

  test('show episodic <date> — displays content', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/episodic'), { recursive: true });
    await fs.writeFile(
      path.join(tmpVault, '.agentos/memory/episodic/2026-04-04.md'),
      '# 2026-04-04\n\n## Events\n- Did stuff\n'
    );

    const code = await memoryCommand(['show', 'episodic', '2026-04-04']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Did stuff'));
  });

  test('show episodic <date> — not found', async () => {
    const code = await memoryCommand(['show', 'episodic', '1999-01-01']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No episodic entry'));
  });

  test('show procedural — lists skills', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/procedural'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos/memory/procedural/deploy-k8s.md'), '# Deploy K8s\n');

    const code = await memoryCommand(['show', 'procedural']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('deploy-k8s'));
  });

  test('show procedural — empty', async () => {
    const code = await memoryCommand(['show', 'procedural']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No procedural'));
  });

  test('show procedural <name> — displays content', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/procedural'), { recursive: true });
    await fs.writeFile(
      path.join(tmpVault, '.agentos/memory/procedural/deploy-k8s.md'),
      '# Deploy K8s\nHow to deploy\n'
    );

    const code = await memoryCommand(['show', 'procedural', 'deploy-k8s']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('How to deploy'));
  });

  test('show procedural <name> — not found', async () => {
    const code = await memoryCommand(['show', 'procedural', 'nonexistent']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No procedural skill'));
  });

  test('consolidate — reports counts', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/episodic'), { recursive: true });
    await fs.mkdir(path.join(tmpVault, '.agentos/memory/procedural'), { recursive: true });
    await fs.writeFile(
      path.join(tmpVault, '.agentos/memory/semantic.md'),
      'PREF: dark mode\nFACT: [active] uses TS\n'
    );

    const code = await memoryCommand(['consolidate']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Consolidation'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Semantic entries: 2'));
  });

  test('consolidate — no semantic memory', async () => {
    const code = await memoryCommand(['consolidate']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No semantic memory'));
  });

  test('unknown action — returns error', async () => {
    const code = await memoryCommand(['unknown']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown action 'unknown'"));
  });
});
