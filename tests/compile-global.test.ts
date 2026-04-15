import { describe, it, expect } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';
import { mapToGlobalPath } from '../src/commands/compile.js';

describe('compile — mapToGlobalPath', () => {
  const vaultRoot = '/some/vault';

  describe('CLAUDE.md mapping', () => {
    it('maps CLAUDE.md to a path containing .claude', () => {
      const result = mapToGlobalPath('CLAUDE.md', vaultRoot);
      expect(result).not.toBeNull();
      expect(result).toContain('.claude');
    });

    it('maps CLAUDE.md to ~/.claude/CLAUDE.md', () => {
      const result = mapToGlobalPath('CLAUDE.md', vaultRoot);
      expect(result).toBe(path.join(os.homedir(), '.claude', 'CLAUDE.md'));
    });
  });

  describe('.cursor/rules/ mapping', () => {
    it('maps .cursor/rules/agentfs-global.mdc to a path in .cursor/rules', () => {
      const result = mapToGlobalPath('.cursor/rules/agentfs-global.mdc', vaultRoot);
      expect(result).not.toBeNull();
      expect(result).toContain('.cursor');
      expect(result).toContain('rules');
    });

    it('maps .cursor/rules/agentfs-global.mdc to ~/.cursor/rules/agentfs-global.mdc', () => {
      const result = mapToGlobalPath('.cursor/rules/agentfs-global.mdc', vaultRoot);
      expect(result).toBe(
        path.join(os.homedir(), '.cursor', 'rules', 'agentfs-global.mdc'),
      );
    });

    it('preserves the filename for any .cursor/rules/ file', () => {
      const result = mapToGlobalPath('.cursor/rules/custom-rule.mdc', vaultRoot);
      expect(result).toContain('custom-rule.mdc');
    });
  });

  describe('.openclaw/ mapping', () => {
    it('maps .openclaw/project-memory.json to a path in ~/.openclaw', () => {
      const result = mapToGlobalPath('.openclaw/project-memory.json', vaultRoot);
      expect(result).not.toBeNull();
      expect(result).toContain('.openclaw');
    });

    it('maps .openclaw/project-memory.json to ~/.openclaw/project-memory.json', () => {
      const result = mapToGlobalPath('.openclaw/project-memory.json', vaultRoot);
      expect(result).toBe(
        path.join(os.homedir(), '.openclaw', 'project-memory.json'),
      );
    });
  });

  describe('unknown paths', () => {
    it('returns null for an unknown file', () => {
      const result = mapToGlobalPath('unknown-file.txt', vaultRoot);
      expect(result).toBeNull();
    });

    it('returns null for a random subdirectory path', () => {
      const result = mapToGlobalPath('vault/some-random/path.md', vaultRoot);
      expect(result).toBeNull();
    });

    it('returns null for an empty string', () => {
      const result = mapToGlobalPath('', vaultRoot);
      expect(result).toBeNull();
    });

    it('returns null for a path that looks like .cursor but has wrong prefix', () => {
      // .cursor/settings.json is not under .cursor/rules/
      const result = mapToGlobalPath('.cursor/settings.json', vaultRoot);
      expect(result).toBeNull();
    });
  });

  describe('vaultRoot parameter', () => {
    it('produces the same result regardless of vaultRoot value for CLAUDE.md', () => {
      const r1 = mapToGlobalPath('CLAUDE.md', '/vault-a');
      const r2 = mapToGlobalPath('CLAUDE.md', '/vault-b');
      expect(r1).toBe(r2);
    });
  });
});
