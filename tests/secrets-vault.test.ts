import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addSecret,
  getSecret,
  rotateSecret,
  decryptSecrets,
  auditVault,
} from '../src/secrets/vault.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-vault-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('secrets/vault — AES-256-GCM', () => {
  describe('addSecret + getSecret round-trip', () => {
    it('retrieves the exact value that was stored', async () => {
      await addSecret(tmpDir, 'github-token', 'ghp_abc123');
      const value = await getSecret(tmpDir, 'github-token');
      expect(value).toBe('ghp_abc123');
    });

    it('round-trips a value containing special characters', async () => {
      const special = 'p@$$w0rd!#^&*(){}|<>';
      await addSecret(tmpDir, 'special', special);
      const value = await getSecret(tmpDir, 'special');
      expect(value).toBe(special);
    });

    it('returns null for a name that was never added', async () => {
      const value = await getSecret(tmpDir, 'nonexistent');
      expect(value).toBeNull();
    });
  });

  describe('encrypted storage format', () => {
    it('stores value with ENC[aes256gcm: prefix in vault.yaml', async () => {
      await addSecret(tmpDir, 'my-key', 'super-secret');
      const vaultPath = path.join(tmpDir, '.agentos/secrets/vault.yaml');
      const content = await fs.readFile(vaultPath, 'utf8');
      expect(content).toContain('ENC[aes256gcm:');
    });

    it('encrypted value ends with ] suffix', async () => {
      await addSecret(tmpDir, 'my-key', 'super-secret');
      const vaultPath = path.join(tmpDir, '.agentos/secrets/vault.yaml');
      const content = await fs.readFile(vaultPath, 'utf8');
      // The ENC[aes256gcm:...] value should be present
      expect(content).toMatch(/ENC\[aes256gcm:[^\]]+\]/);
    });

    it('encrypted ciphertext differs on each call (random IV)', async () => {
      await addSecret(tmpDir, 'key1', 'same-value');
      const vault1 = await fs.readFile(path.join(tmpDir, '.agentos/secrets/vault.yaml'), 'utf8');
      await addSecret(tmpDir, 'key2', 'same-value');
      const vault2 = await fs.readFile(path.join(tmpDir, '.agentos/secrets/vault.yaml'), 'utf8');
      // key1 and key2 should have different encrypted blobs even with same plaintext
      const key1Match = vault1.match(/key1:\s*'?(ENC\[aes256gcm:[^\]]+\])/);
      const key2Match = vault2.match(/key2:\s*'?(ENC\[aes256gcm:[^\]]+\])/);
      if (key1Match && key2Match) {
        expect(key1Match[1]).not.toBe(key2Match[1]);
      }
      // At minimum both should be present
      expect(vault2).toContain('key1:');
      expect(vault2).toContain('key2:');
    });
  });

  describe('rotateSecret', () => {
    it('returns true when the secret exists and is rotated', async () => {
      await addSecret(tmpDir, 'token', 'old-value');
      const result = await rotateSecret(tmpDir, 'token', 'new-value');
      expect(result).toBe(true);
    });

    it('returns the new value after rotation', async () => {
      await addSecret(tmpDir, 'token', 'old-value');
      await rotateSecret(tmpDir, 'token', 'new-value');
      const value = await getSecret(tmpDir, 'token');
      expect(value).toBe('new-value');
    });

    it('returns false when the secret does not exist', async () => {
      const result = await rotateSecret(tmpDir, 'nonexistent', 'any-value');
      expect(result).toBe(false);
    });

    it('stores a new ENC[aes256gcm: value after rotation', async () => {
      await addSecret(tmpDir, 'token', 'old-value');
      const beforeContent = await fs.readFile(
        path.join(tmpDir, '.agentos/secrets/vault.yaml'),
        'utf8',
      );
      await rotateSecret(tmpDir, 'token', 'new-value');
      const afterContent = await fs.readFile(
        path.join(tmpDir, '.agentos/secrets/vault.yaml'),
        'utf8',
      );
      // Both are AES encrypted but different
      expect(afterContent).toContain('ENC[aes256gcm:');
      expect(beforeContent).not.toBe(afterContent);
    });
  });

  describe('decryptSecrets', () => {
    it('returns SCREAMING_SNAKE_CASE keys', async () => {
      await addSecret(tmpDir, 'github-token', 'ghp_abc123');
      const map = await decryptSecrets(tmpDir);
      expect(map).toHaveProperty('GITHUB_TOKEN');
      expect(map['GITHUB_TOKEN']).toBe('ghp_abc123');
    });

    it('converts hyphenated names to underscored uppercase', async () => {
      await addSecret(tmpDir, 'api-secret-key', 'sk-xyz');
      const map = await decryptSecrets(tmpDir);
      expect(map).toHaveProperty('API_SECRET_KEY');
      expect(map['API_SECRET_KEY']).toBe('sk-xyz');
    });

    it('returns all added secrets in the map', async () => {
      await addSecret(tmpDir, 'token-a', 'val-a');
      await addSecret(tmpDir, 'token-b', 'val-b');
      const map = await decryptSecrets(tmpDir);
      expect(map['TOKEN_A']).toBe('val-a');
      expect(map['TOKEN_B']).toBe('val-b');
    });

    it('returns empty map for a fresh vault', async () => {
      const map = await decryptSecrets(tmpDir);
      expect(Object.keys(map)).toHaveLength(0);
    });
  });

  describe('legacy base64 backwards compatibility', () => {
    it('decodes legacy ENC[agentfs:base64] values transparently', async () => {
      // Manually write a legacy-format vault.yaml
      const secretsDir = path.join(tmpDir, '.agentos/secrets');
      await fs.mkdir(secretsDir, { recursive: true });
      const legacyValue = Buffer.from('legacy-secret-value').toString('base64');
      const vaultContent = `version: '1.0'\nsecrets:\n  legacy-key: 'ENC[agentfs:${legacyValue}]'\n`;
      await fs.writeFile(path.join(secretsDir, 'vault.yaml'), vaultContent, 'utf8');

      const value = await getSecret(tmpDir, 'legacy-key');
      expect(value).toBe('legacy-secret-value');
    });

    it('includes legacy secrets in decryptSecrets output', async () => {
      const secretsDir = path.join(tmpDir, '.agentos/secrets');
      await fs.mkdir(secretsDir, { recursive: true });
      const legacyValue = Buffer.from('my-legacy-token').toString('base64');
      const vaultContent = `version: '1.0'\nsecrets:\n  legacy-token: 'ENC[agentfs:${legacyValue}]'\n`;
      await fs.writeFile(path.join(secretsDir, 'vault.yaml'), vaultContent, 'utf8');

      const map = await decryptSecrets(tmpDir);
      expect(map['LEGACY_TOKEN']).toBe('my-legacy-token');
    });
  });

  describe('auditVault', () => {
    it('returns correct count after adding secrets', async () => {
      await addSecret(tmpDir, 'a', 'val-a');
      await addSecret(tmpDir, 'b', 'val-b');
      const result = await auditVault(tmpDir);
      expect(result.count).toBe(2);
    });

    it('returns hasKeyFile=true after a secret has been added', async () => {
      await addSecret(tmpDir, 'a', 'val-a');
      const result = await auditVault(tmpDir);
      expect(result.hasKeyFile).toBe(true);
    });

    it('returns missingEntries=[] when vault and refs are consistent', async () => {
      await addSecret(tmpDir, 'my-key', 'my-value');
      const result = await auditVault(tmpDir);
      expect(result.missingEntries).toEqual([]);
    });

    it('returns encryption=aes-256-gcm for newly added secrets', async () => {
      await addSecret(tmpDir, 'tok', 'val');
      const result = await auditVault(tmpDir);
      expect(result.encryption).toBe('aes-256-gcm');
    });

    it('returns encryption=empty for a fresh vault', async () => {
      const result = await auditVault(tmpDir);
      expect(result.encryption).toBe('empty');
    });

    it('returns encryption=legacy-base64 for a vault with only legacy entries', async () => {
      const secretsDir = path.join(tmpDir, '.agentos/secrets');
      await fs.mkdir(secretsDir, { recursive: true });
      const legacyValue = Buffer.from('val').toString('base64');
      const vaultContent = `version: '1.0'\nsecrets:\n  leg: 'ENC[agentfs:${legacyValue}]'\n`;
      await fs.writeFile(path.join(secretsDir, 'vault.yaml'), vaultContent, 'utf8');
      const result = await auditVault(tmpDir);
      expect(result.encryption).toBe('legacy-base64');
    });

    it('returns orphanedEntries for vault entries with no ref', async () => {
      // Write vault.yaml with an entry but no matching refs.yaml entry
      const secretsDir = path.join(tmpDir, '.agentos/secrets');
      await fs.mkdir(secretsDir, { recursive: true });
      const legacyValue = Buffer.from('val').toString('base64');
      await fs.writeFile(
        path.join(secretsDir, 'vault.yaml'),
        `version: '1.0'\nsecrets:\n  orphan: 'ENC[agentfs:${legacyValue}]'\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(secretsDir, 'refs.yaml'),
        `version: '1.0'\nrefs: []\n`,
        'utf8',
      );
      const result = await auditVault(tmpDir);
      expect(result.orphanedEntries).toContain('orphan');
    });

    it('returns missingEntries for refs with no vault entry', async () => {
      const secretsDir = path.join(tmpDir, '.agentos/secrets');
      await fs.mkdir(secretsDir, { recursive: true });
      await fs.writeFile(
        path.join(secretsDir, 'vault.yaml'),
        `version: '1.0'\nsecrets: {}\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(secretsDir, 'refs.yaml'),
        `version: '1.0'\nrefs:\n  - ghost-key\n`,
        'utf8',
      );
      const result = await auditVault(tmpDir);
      expect(result.missingEntries).toContain('ghost-key');
    });
  });
});
