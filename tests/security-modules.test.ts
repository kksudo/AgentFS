import { describe, it, expect } from '@jest/globals';
import {
  BUILTIN_MODULES,
  BUILTIN_MODULE_NAMES,
  isBuiltinModule,
  mergeModules,
} from '../src/security/modules.js';
import { DEFAULT_POLICY } from '../src/security/parser.js';
import type { SecurityPolicy } from '../src/types/index.js';

describe('security/modules', () => {
  describe('BUILTIN_MODULES', () => {
    it('contains the crypto key', () => {
      expect(BUILTIN_MODULES).toHaveProperty('crypto');
    });

    it('contains the web key', () => {
      expect(BUILTIN_MODULES).toHaveProperty('web');
    });

    it('contains the infra key', () => {
      expect(BUILTIN_MODULES).toHaveProperty('infra');
    });

    it('contains the cloud key', () => {
      expect(BUILTIN_MODULES).toHaveProperty('cloud');
    });

    it('contains the ci-cd key', () => {
      expect(BUILTIN_MODULES).toHaveProperty('ci-cd');
    });

    it('BUILTIN_MODULE_NAMES lists all five modules', () => {
      expect(BUILTIN_MODULE_NAMES).toContain('crypto');
      expect(BUILTIN_MODULE_NAMES).toContain('web');
      expect(BUILTIN_MODULE_NAMES).toContain('infra');
      expect(BUILTIN_MODULE_NAMES).toContain('cloud');
      expect(BUILTIN_MODULE_NAMES).toContain('ci-cd');
    });
  });

  describe('isBuiltinModule', () => {
    it('returns true for crypto', () => {
      expect(isBuiltinModule('crypto')).toBe(true);
    });

    it('returns true for web', () => {
      expect(isBuiltinModule('web')).toBe(true);
    });

    it('returns true for infra', () => {
      expect(isBuiltinModule('infra')).toBe(true);
    });

    it('returns true for cloud', () => {
      expect(isBuiltinModule('cloud')).toBe(true);
    });

    it('returns true for ci-cd', () => {
      expect(isBuiltinModule('ci-cd')).toBe(true);
    });

    it('returns false for an unknown name', () => {
      expect(isBuiltinModule('unknown')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isBuiltinModule('')).toBe(false);
    });
  });

  describe('mergeModules', () => {
    it('deduplicates deny_read when merging crypto module', () => {
      // DEFAULT_POLICY already has **/*.pem and **/*.key in deny_read
      const merged = mergeModules(DEFAULT_POLICY, [BUILTIN_MODULES['crypto']]);
      const pemCount = merged.file_access.deny_read.filter((p) => p === '**/*.pem').length;
      const keyCount = merged.file_access.deny_read.filter((p) => p === '**/*.key').length;
      expect(pemCount).toBe(1);
      expect(keyCount).toBe(1);
    });

    it('adds new deny_read entries from crypto module', () => {
      const merged = mergeModules(DEFAULT_POLICY, [BUILTIN_MODULES['crypto']]);
      expect(merged.file_access.deny_read).toContain('**/.ssh/id_*');
      expect(merged.file_access.deny_read).toContain('**/.gnupg/**');
    });

    it('merges deny rules from both crypto and cloud modules', () => {
      const merged = mergeModules(DEFAULT_POLICY, [
        BUILTIN_MODULES['crypto'],
        BUILTIN_MODULES['cloud'],
      ]);
      // crypto adds .ssh/id_*
      expect(merged.file_access.deny_read).toContain('**/.ssh/id_*');
      // cloud adds .aws/credentials
      expect(merged.file_access.deny_read).toContain('**/.aws/credentials');
    });

    it('merges exfil patterns from crypto and cloud modules', () => {
      const merged = mergeModules(DEFAULT_POLICY, [
        BUILTIN_MODULES['crypto'],
        BUILTIN_MODULES['cloud'],
      ]);
      const regexes = merged.network.deny_exfil_patterns.map((p) => p.regex);
      expect(regexes.some((r) => r.includes('PRIVATE KEY'))).toBe(true);
      expect(regexes.some((r) => r.includes('AKIA'))).toBe(true);
    });

    it('does not create duplicate entries when merging the same module twice', () => {
      const merged = mergeModules(DEFAULT_POLICY, [
        BUILTIN_MODULES['crypto'],
        BUILTIN_MODULES['crypto'],
      ]);
      const sshCount = merged.file_access.deny_read.filter((p) => p === '**/.ssh/id_*').length;
      expect(sshCount).toBe(1);
    });

    it('does not mutate the base policy', () => {
      const baselineDenyReadLength = DEFAULT_POLICY.file_access.deny_read.length;
      mergeModules(DEFAULT_POLICY, [BUILTIN_MODULES['crypto']]);
      expect(DEFAULT_POLICY.file_access.deny_read).toHaveLength(baselineDenyReadLength);
    });

    it('returns a new policy object distinct from the base', () => {
      const merged = mergeModules(DEFAULT_POLICY, [BUILTIN_MODULES['crypto']]);
      expect(merged).not.toBe(DEFAULT_POLICY);
      expect(merged.file_access).not.toBe(DEFAULT_POLICY.file_access);
    });

    it('merges command blocks from infra module', () => {
      const merged = mergeModules(DEFAULT_POLICY, [BUILTIN_MODULES['infra']]);
      expect(merged.commands.blocked).toContain('kubectl delete namespace');
      expect(merged.commands.ask_before).toContain('terraform apply');
    });

    it('deduplicates injection scan_on_read patterns from web module', () => {
      // Add a pattern that is also in the web module to confirm deduplication
      const baseWithDocument: SecurityPolicy = {
        ...DEFAULT_POLICY,
        input_validation: {
          ...DEFAULT_POLICY.input_validation,
          scan_on_read: [
            ...DEFAULT_POLICY.input_validation.scan_on_read,
            { pattern: 'document.cookie' },
          ],
        },
      };
      const merged = mergeModules(baseWithDocument, [BUILTIN_MODULES['web']]);
      const cookieCount = merged.input_validation.scan_on_read.filter(
        (p) => p.pattern === 'document.cookie',
      ).length;
      expect(cookieCount).toBe(1);
    });

    it('returns base policy unchanged when merging empty module list', () => {
      const merged = mergeModules(DEFAULT_POLICY, []);
      expect(merged.file_access.deny_read).toEqual(DEFAULT_POLICY.file_access.deny_read);
      expect(merged.commands.blocked).toEqual(DEFAULT_POLICY.commands.blocked);
    });
  });
});
