/**
 * Tests for agentfs clean command.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanCommand } from '../src/commands/clean.js';
import type { CliFlags } from '../src/utils/cli-flags.js';

let tmpDir: string;

function makeFlags(args: string[] = [], extra: Partial<CliFlags> = {}): CliFlags {
  return {
    targetDir: tmpDir,
    args: ['clean', ...args],
    outputFormat: 'json',
    nonInteractive: true,
    jsonInput: null,
    configPath: null,
    ...extra,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-clean-'));
  await fs.mkdir(path.join(tmpDir, '.agentos/memory'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.cursor/rules'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.openclaw'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });

  // Create managed files
  await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# vault rules\n');
  await fs.writeFile(path.join(tmpDir, '.claude/settings.json'), '{}');
  await fs.writeFile(path.join(tmpDir, '.cursor/rules/agentfs-global.mdc'), '# cursor\n');
  await fs.writeFile(path.join(tmpDir, '.openclaw/AGENTS.md'), '# agents\n');
  await fs.writeFile(path.join(tmpDir, 'AGENT-MAP.md'), '# map\n');
  await fs.writeFile(path.join(tmpDir, '.agentos/os-release'), 'VERSION=0.1.7\n');
  await fs.writeFile(path.join(tmpDir, '.agentos/memory/INDEX.md'), '# index\n');

  // Create user content (should NOT be removed)
  await fs.writeFile(path.join(tmpDir, 'Notes.md'), 'my notes\n');
  await fs.writeFile(path.join(tmpDir, '.agentos/manifest.yaml'), 'vault:\n  name: test\n');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('cleanCommand', () => {
  it('--dry-run lists files without removing them', async () => {
    const code = await cleanCommand(makeFlags(['--dry-run']));
    expect(code).toBe(0);

    // Files still exist after dry-run
    const exists = await fs.access(path.join(tmpDir, 'CLAUDE.md')).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('removes compiled outputs with --force', async () => {
    const code = await cleanCommand(makeFlags(['--force']));
    expect(code).toBe(0);

    // Managed files removed
    const claudeExists = await fs.access(path.join(tmpDir, 'CLAUDE.md')).then(() => true).catch(() => false);
    expect(claudeExists).toBe(false);

    // User content preserved
    const notesExist = await fs.access(path.join(tmpDir, 'Notes.md')).then(() => true).catch(() => false);
    expect(notesExist).toBe(true);

    // Kernel preserved (no --all)
    const manifestExists = await fs.access(path.join(tmpDir, '.agentos/manifest.yaml')).then(() => true).catch(() => false);
    expect(manifestExists).toBe(true);
  });

  it('--all removes .agentos/ with --force', async () => {
    const code = await cleanCommand(makeFlags(['--all', '--force']));
    expect(code).toBe(0);

    const agentosExists = await fs.access(path.join(tmpDir, '.agentos')).then(() => true).catch(() => false);
    expect(agentosExists).toBe(false);

    // User content still preserved
    const notesExist = await fs.access(path.join(tmpDir, 'Notes.md')).then(() => true).catch(() => false);
    expect(notesExist).toBe(true);
  });

  it('returns 0 when nothing to remove', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-clean-empty-'));
    try {
      const flags = makeFlags(['--force']);
      flags.targetDir = emptyDir;
      const code = await cleanCommand(flags);
      expect(code).toBe(0);
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });
});
