/**
 * Secrets vault — encrypted secret storage with reference-only access.
 *
 * Story 8.1: Manages secrets in `.agentos/secrets/vault.yaml` (encrypted)
 * and `.agentos/secrets/refs.yaml` (reference names only).
 *
 * In a full implementation, this would use SOPS/age for real encryption.
 * For MVP, we use a simple base64 encoding with a marker to simulate
 * the encrypted-at-rest pattern. The API surface is identical to what
 * a SOPS integration would provide.
 *
 * @module secrets/vault
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const SECRETS_DIR = '.agentos/secrets';
const VAULT_FILE = 'vault.yaml';
const REFS_FILE = 'refs.yaml';

/** Header marker for "encrypted" values. */
const ENC_PREFIX = 'ENC[agentfs:';
const ENC_SUFFIX = ']';

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

function encode(value: string): string {
  return `${ENC_PREFIX}${Buffer.from(value).toString('base64')}${ENC_SUFFIX}`;
}

function decode(encoded: string): string {
  const inner = encoded.slice(ENC_PREFIX.length, -ENC_SUFFIX.length);
  return Buffer.from(inner, 'base64').toString('utf8');
}

function isEncoded(value: string): boolean {
  return value.startsWith(ENC_PREFIX) && value.endsWith(ENC_SUFFIX);
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
 * Add a secret to the vault.
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
  const vault = await readVault(vaultRoot);
  vault.secrets[name] = encode(value);
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
 * Rotate a secret (re-encrypt with new value).
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

  vault.secrets[name] = encode(newValue);
  await writeVault(vaultRoot, vault);
  return true;
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
  const result: Record<string, string> = {};
  for (const [name, encrypted] of Object.entries(vault.secrets)) {
    if (isEncoded(encrypted)) {
      result[name.toUpperCase().replace(/-/g, '_')] = decode(encrypted);
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
