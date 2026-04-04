import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import {
  addSecret,
  removeSecret,
  listSecrets,
  rotateSecret,
  decryptSecrets,
  resolveSecretRefs,
} from '../src/secrets/vault.js';
import { scanForExfiltration, logViolation } from '../src/secrets/exfil-guard.js';
import { DEFAULT_POLICY } from '../src/security/parser.js';
import { secretCommand } from '../src/commands/secret.js';

describe('secrets system', () => {
  let tmpVault: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-secrets-'));
    origCwd = process.cwd();
    process.chdir(tmpVault);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  describe('vault', () => {
    test('add and list secrets', async () => {
      await addSecret(tmpVault, 'github-token', 'ghp_abc123');
      await addSecret(tmpVault, 'api-key', 'sk-xyz');

      const names = await listSecrets(tmpVault);
      expect(names).toEqual(['api-key', 'github-token']);
    });

    test('add is idempotent for refs', async () => {
      await addSecret(tmpVault, 'test', 'val1');
      await addSecret(tmpVault, 'test', 'val2');

      const names = await listSecrets(tmpVault);
      expect(names).toEqual(['test']);
    });

    test('remove secret', async () => {
      await addSecret(tmpVault, 'test', 'val');
      const removed = await removeSecret(tmpVault, 'test');
      expect(removed).toBe(true);

      const names = await listSecrets(tmpVault);
      expect(names).toEqual([]);
    });

    test('remove returns false for non-existent', async () => {
      const removed = await removeSecret(tmpVault, 'nope');
      expect(removed).toBe(false);
    });

    test('rotate secret', async () => {
      await addSecret(tmpVault, 'token', 'old-value');
      const rotated = await rotateSecret(tmpVault, 'token', 'new-value');
      expect(rotated).toBe(true);

      const decrypted = await decryptSecrets(tmpVault);
      expect(decrypted['TOKEN']).toBe('new-value');
    });

    test('rotate returns false for non-existent', async () => {
      const rotated = await rotateSecret(tmpVault, 'nope', 'val');
      expect(rotated).toBe(false);
    });

    test('decrypt returns env-var format keys', async () => {
      await addSecret(tmpVault, 'github-token', 'ghp_abc123');
      await addSecret(tmpVault, 'api-key', 'sk-xyz');

      const decrypted = await decryptSecrets(tmpVault);
      expect(decrypted['GITHUB_TOKEN']).toBe('ghp_abc123');
      expect(decrypted['API_KEY']).toBe('sk-xyz');
    });

    test('resolveSecretRefs replaces references', async () => {
      await addSecret(tmpVault, 'api-key', 'sk-xyz');

      const resolved = await resolveSecretRefs(
        'Authorization: Bearer ${{secret:api-key}}',
        tmpVault
      );
      expect(resolved).toBe('Authorization: Bearer sk-xyz');
    });

    test('resolveSecretRefs keeps unresolved refs', async () => {
      const resolved = await resolveSecretRefs(
        'Token: ${{secret:missing}}',
        tmpVault
      );
      expect(resolved).toBe('Token: ${{secret:missing}}');
    });

    test('list returns empty for fresh vault', async () => {
      const names = await listSecrets(tmpVault);
      expect(names).toEqual([]);
    });
  });

  describe('exfil-guard', () => {
    test('detects exfiltration patterns', () => {
      const result = scanForExfiltration(
        'api_key = "sk-abc123"',
        DEFAULT_POLICY
      );
      expect(result.clean).toBe(false);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('clean text passes', () => {
      const result = scanForExfiltration(
        'This is normal output text',
        DEFAULT_POLICY
      );
      expect(result.clean).toBe(true);
    });

    test('logViolation writes to audit log', async () => {
      await logViolation(tmpVault, 'test', ['api_key = "leaked"']);

      const log = await fs.readFile(
        path.join(tmpVault, '.agentos/security/audit/violations.log'),
        'utf8'
      );
      expect(log).toContain('EXFIL_DETECTED');
      expect(log).toContain('test');
    });
  });

  describe('commands/secret CLI', () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

    beforeEach(() => { jest.clearAllMocks(); });
    afterAll(() => { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); });

    test('prints usage with no args', async () => {
      const code = await secretCommand([]);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: agentfs secret'));
    });

    test('add requires name and value', async () => {
      const code = await secretCommand(['add', 'name-only']);
      expect(code).toBe(1);
    });

    test('add stores secret', async () => {
      const code = await secretCommand(['add', 'my-token', 'abc123']);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('my-token'));
    });

    test('list shows secrets', async () => {
      await addSecret(tmpVault, 'test-key', 'val');
      const code = await secretCommand(['list']);
      expect(code).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('test-key'));
    });

    test('remove deletes secret', async () => {
      await addSecret(tmpVault, 'del-me', 'val');
      const code = await secretCommand(['remove', 'del-me']);
      expect(code).toBe(0);
    });

    test('remove fails for missing', async () => {
      const code = await secretCommand(['remove', 'nope']);
      expect(code).toBe(1);
    });

    test('rotate updates secret', async () => {
      await addSecret(tmpVault, 'rot', 'old');
      const code = await secretCommand(['rotate', 'rot', 'new']);
      expect(code).toBe(0);
    });

    test('unknown action returns error', async () => {
      const code = await secretCommand(['bogus']);
      expect(code).toBe(1);
    });
  });
});
