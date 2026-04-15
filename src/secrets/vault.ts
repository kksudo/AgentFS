/**
 * Secrets vault — encrypted secret storage with reference-only access.
 *
 * Story 8.1: Manages secrets in `.agentos/secrets/vault.yaml` (encrypted)
 * and `.agentos/secrets/refs.yaml` (reference names only).
 *
 * Encryption: AES-256-GCM using Node.js built-in `crypto` module.
 * Format: ENC[aes256gcm:iv_hex:auth_tag_hex:ciphertext_hex]
 *
 * Key management: 32-byte random key stored in `.agentos/secrets/.vault-key`
 * (hex-encoded). Generated on first use. File permissions set to 0o600.
 *
 * Backwards compatibility: old ENC[agentfs:base64] values are decoded
 * transparently on read (migration path). New writes always use AES-256-GCM.
 *
 * @module secrets/vault
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const SECRETS_DIR = '.agentos/secrets';
const VAULT_FILE = 'vault.yaml';
const REFS_FILE = 'refs.yaml';
const KEY_FILE = '.vault-key';

const ALGORITHM = 'aes-256-gcm';

/** New AES-256-GCM format prefix. */
const AES_PREFIX = 'ENC[aes256gcm:';
const AES_SUFFIX = ']';

/** Legacy base64 format prefix (read-only backwards compatibility). */
const LEGACY_PREFIX = 'ENC[agentfs:';
const LEGACY_SUFFIX = ']';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface VaultData {
  version: string;
  secrets: Record<string, string>;
}

interface RefsData {
  version: string;
  refs: string[];
}

async function getOrCreateKey(vaultRoot: string): Promise<Buffer> {
  const keyPath = path.join(vaultRoot, SECRETS_DIR, KEY_FILE);
  try {
    const hex = await fs.readFile(keyPath, 'utf8');
    return Buffer.from(hex.trim(), 'hex');
  } catch {
    const key = crypto.randomBytes(32);
    await fs.mkdir(path.join(vaultRoot, SECRETS_DIR), { recursive: true });
    await fs.writeFile(keyPath, key.toString('hex'), 'utf8');
    // Restrict permissions (best-effort on non-Windows)
    try { await fs.chmod(keyPath, 0o600); } catch { /* ignore on Windows */ }
    // Protect entire secrets dir from accidental git commit
    const gitignorePath = path.join(vaultRoot, SECRETS_DIR, '.gitignore');
    try { await fs.access(gitignorePath); } catch {
      await fs.writeFile(gitignorePath, '*\n', 'utf8');
    }
    return key;
  }
}

function encrypt(value: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = (cipher as crypto.CipherGCM).getAuthTag();
  return `${AES_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}${AES_SUFFIX}`;
}

function decrypt(encoded: string, key: Buffer): string {
  const inner = encoded.slice(AES_PREFIX.length, -AES_SUFFIX.length);
  const [ivHex, authTagHex, ciphertextHex] = inner.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('malformed vault ciphertext: expected iv:tag:ciphertext');
  }
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error(`Failed to decrypt vault entry: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isAesEncrypted(value: string): boolean {
  return value.startsWith(AES_PREFIX) && value.endsWith(AES_SUFFIX);
}

function isLegacyEncoded(value: string): boolean {
  return value.startsWith(LEGACY_PREFIX) && value.endsWith(LEGACY_SUFFIX);
}

/** Decode a legacy base64-encoded value. */
function decodeLegacy(encoded: string): string {
  const inner = encoded.slice(LEGACY_PREFIX.length, -LEGACY_SUFFIX.length);
  return Buffer.from(inner, 'base64').toString('utf8');
}

/**
 * Decrypt a vault entry regardless of format (AES or legacy).
 * Returns null if the value format is unrecognised.
 */
async function decryptEntry(encoded: string, key: Buffer): Promise<string | null> {
  if (isAesEncrypted(encoded)) {
    return decrypt(encoded, key);
  }
  if (isLegacyEncoded(encoded)) {
    return decodeLegacy(encoded);
  }
  return null;
}

async function ensureDir(vaultRoot: string): Promise<string> {
  const dir = path.join(vaultRoot, SECRETS_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readVault(vaultRoot: string): Promise<VaultData> {
  const filePath = path.join(vaultRoot, SECRETS_DIR, VAULT_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return (yaml.load(content) as VaultData) ?? { version: '1.0', secrets: {} };
  } catch {
    return { version: '1.0', secrets: {} };
  }
}

async function writeVault(vaultRoot: string, data: VaultData): Promise<void> {
  const dir = await ensureDir(vaultRoot);
  await fs.writeFile(path.join(dir, VAULT_FILE), yaml.dump(data), 'utf8');
}

async function readRefs(vaultRoot: string): Promise<RefsData> {
  const filePath = path.join(vaultRoot, SECRETS_DIR, REFS_FILE);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return (yaml.load(content) as RefsData) ?? { version: '1.0', refs: [] };
  } catch {
    return { version: '1.0', refs: [] };
  }
}

async function writeRefs(vaultRoot: string, data: RefsData): Promise<void> {
  const dir = await ensureDir(vaultRoot);
  await fs.writeFile(path.join(dir, REFS_FILE), yaml.dump(data), 'utf8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a secret to the vault (AES-256-GCM encrypted).
 *
 * @param vaultRoot - Vault root path
 * @param name      - Secret name (e.g. 'github-token')
 * @param value     - Secret value to encrypt
 */
export async function addSecret(
  vaultRoot: string,
  name: string,
  value: string,
): Promise<void> {
  const key = await getOrCreateKey(vaultRoot);
  const vault = await readVault(vaultRoot);
  vault.secrets[name] = encrypt(value, key);
  await writeVault(vaultRoot, vault);

  const refs = await readRefs(vaultRoot);
  if (!refs.refs.includes(name)) {
    refs.refs.push(name);
    refs.refs.sort();
    await writeRefs(vaultRoot, refs);
  }
}

/**
 * Remove a secret from the vault.
 *
 * @param vaultRoot - Vault root path
 * @param name      - Secret name to remove
 * @returns true if removed, false if not found
 */
export async function removeSecret(
  vaultRoot: string,
  name: string,
): Promise<boolean> {
  const vault = await readVault(vaultRoot);
  if (!(name in vault.secrets)) return false;

  delete vault.secrets[name];
  await writeVault(vaultRoot, vault);

  const refs = await readRefs(vaultRoot);
  refs.refs = refs.refs.filter((r) => r !== name);
  await writeRefs(vaultRoot, refs);

  return true;
}

/**
 * List all secret names (never values).
 *
 * @param vaultRoot - Vault root path
 * @returns Sorted array of secret names
 */
export async function listSecrets(vaultRoot: string): Promise<string[]> {
  const refs = await readRefs(vaultRoot);
  return refs.refs;
}

/**
 * Rotate a secret (re-encrypt with new value using AES-256-GCM).
 *
 * @param vaultRoot - Vault root path
 * @param name      - Secret name to rotate
 * @param newValue  - New secret value
 * @returns true if rotated, false if not found
 */
export async function rotateSecret(
  vaultRoot: string,
  name: string,
  newValue: string,
): Promise<boolean> {
  const vault = await readVault(vaultRoot);
  if (!(name in vault.secrets)) return false;

  const key = await getOrCreateKey(vaultRoot);
  vault.secrets[name] = encrypt(newValue, key);
  await writeVault(vaultRoot, vault);
  return true;
}

/**
 * Get a single secret's plaintext value. Supports both AES-256-GCM and
 * legacy base64 formats (transparent migration).
 *
 * @param vaultRoot - Vault root path
 * @param name      - Secret name to fetch
 * @returns Plaintext value or null if not found
 */
export async function getSecret(
  vaultRoot: string,
  name: string,
): Promise<string | null> {
  const vault = await readVault(vaultRoot);
  const encoded = vault.secrets[name];
  if (!encoded) return null;
  const key = await getOrCreateKey(vaultRoot);
  return decryptEntry(encoded, key);
}

/**
 * Decrypt all secrets to a key-value map (for exec proxy).
 * WARNING: Returns plaintext — only use in-memory for child process env.
 *
 * @param vaultRoot - Vault root path
 * @returns Map of name → plaintext value
 */
export async function decryptSecrets(
  vaultRoot: string,
): Promise<Record<string, string>> {
  const vault = await readVault(vaultRoot);
  const key = await getOrCreateKey(vaultRoot);
  const result: Record<string, string> = {};
  for (const [name, encoded] of Object.entries(vault.secrets)) {
    const plaintext = await decryptEntry(encoded, key);
    if (plaintext !== null) {
      result[name.toUpperCase().replace(/-/g, '_')] = plaintext;
    }
  }
  return result;
}

/**
 * Resolve secret references in a string.
 * Replaces `${{secret:name}}` with actual values.
 *
 * @param template  - String with secret references
 * @param vaultRoot - Vault root path
 * @returns Resolved string
 */
export async function resolveSecretRefs(
  template: string,
  vaultRoot: string,
): Promise<string> {
  const secrets = await decryptSecrets(vaultRoot);
  return template.replace(/\$\{\{secret:([^}]+)\}\}/g, (_match, name: string) => {
    const envKey = name.toUpperCase().replace(/-/g, '_');
    return secrets[envKey] ?? ('${{secret:' + name + '}}');
  });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Result of a vault audit. */
export interface VaultAuditResult {
  /** Total number of secrets in vault.yaml. */
  count: number;
  /** Whether the .vault-key file exists. */
  hasKeyFile: boolean;
  /** Encryption format detected across all stored entries. */
  encryption: 'aes-256-gcm' | 'legacy-base64' | 'mixed' | 'empty';
  /** Number of entries in refs.yaml. */
  refsCount: number;
  /** Vault entries that have no matching ref (orphaned). */
  orphanedEntries: string[];
  /** Refs that have no corresponding vault entry (missing). */
  missingEntries: string[];
}

/**
 * Audit the vault for integrity and encryption status.
 *
 * @param vaultRoot - Vault root path
 * @returns VaultAuditResult
 */
export async function auditVault(vaultRoot: string): Promise<VaultAuditResult> {
  const keyPath = path.join(vaultRoot, SECRETS_DIR, KEY_FILE);
  let hasKeyFile = false;
  try {
    await fs.access(keyPath);
    hasKeyFile = true;
  } catch { /* not present */ }

  const vault = await readVault(vaultRoot);
  const refs = await readRefs(vaultRoot);

  const vaultKeys = Object.keys(vault.secrets);
  const refSet = new Set(refs.refs);
  const vaultSet = new Set(vaultKeys);

  const orphanedEntries = vaultKeys.filter((k) => !refSet.has(k));
  const missingEntries = refs.refs.filter((r) => !vaultSet.has(r));

  // Determine encryption format
  let aesCount = 0;
  let legacyCount = 0;
  for (const value of Object.values(vault.secrets)) {
    if (isAesEncrypted(value)) aesCount++;
    else if (isLegacyEncoded(value)) legacyCount++;
  }

  let encryption: VaultAuditResult['encryption'];
  if (aesCount === 0 && legacyCount === 0) {
    encryption = 'empty';
  } else if (aesCount > 0 && legacyCount === 0) {
    encryption = 'aes-256-gcm';
  } else if (legacyCount > 0 && aesCount === 0) {
    encryption = 'legacy-base64';
  } else {
    encryption = 'mixed';
  }

  return {
    count: vaultKeys.length,
    hasKeyFile,
    encryption,
    refsCount: refs.refs.length,
    orphanedEntries,
    missingEntries,
  };
}
