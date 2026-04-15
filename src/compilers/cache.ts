/**
 * Compile cache — hash-based incremental compilation.
 *
 * Stores a JSON map of { outputPath → sourceHash } at
 * `.agentos/compile-cache.json`. Before writing a compiled output,
 * the driver checks if the content hash matches the cached value.
 * If it matches, the write is skipped.
 *
 * Source hash: SHA-256 of all source content strings that contributed
 * to this output (manifest + init.d scripts + memory content, joined).
 *
 * @module compilers/cache
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_FILE = '.agentos/compile-cache.json';

export interface CacheEntry {
  contentHash: string;
  writtenAt: string; // ISO timestamp
}

export type CompileCache = Record<string, CacheEntry>;

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export async function readCache(vaultRoot: string): Promise<CompileCache> {
  try {
    const raw = await fs.readFile(path.join(vaultRoot, CACHE_FILE), 'utf8');
    return JSON.parse(raw) as CompileCache;
  } catch {
    return {};
  }
}

export async function writeCache(vaultRoot: string, cache: CompileCache): Promise<void> {
  const filePath = path.join(vaultRoot, CACHE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8');
}

export function isCacheHit(cache: CompileCache, outputPath: string, contentHash: string): boolean {
  return cache[outputPath]?.contentHash === contentHash;
}

export function updateCache(cache: CompileCache, outputPath: string, contentHash: string): void {
  cache[outputPath] = { contentHash, writtenAt: new Date().toISOString() };
}
