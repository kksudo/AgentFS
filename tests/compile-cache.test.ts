import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  hashContent,
  readCache,
  writeCache,
  isCacheHit,
  updateCache,
} from '../src/compilers/cache.js';
import type { CompileCache } from '../src/compilers/cache.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-cache-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('compilers/cache', () => {
  describe('hashContent', () => {
    it('returns a 16-character string', () => {
      const hash = hashContent('foo');
      expect(hash).toHaveLength(16);
    });

    it('returns only hex characters', () => {
      const hash = hashContent('foo');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns the same hash for the same input (deterministic)', () => {
      const h1 = hashContent('hello world');
      const h2 = hashContent('hello world');
      expect(h1).toBe(h2);
    });

    it('returns different hashes for different inputs', () => {
      const h1 = hashContent('foo');
      const h2 = hashContent('bar');
      expect(h1).not.toBe(h2);
    });

    it('is sensitive to whitespace differences', () => {
      expect(hashContent('foo')).not.toBe(hashContent('foo '));
    });

    it('handles empty string without throwing', () => {
      const hash = hashContent('');
      expect(hash).toHaveLength(16);
    });
  });

  describe('readCache', () => {
    it('returns an empty object when the cache file does not exist', async () => {
      const cache = await readCache(tmpDir);
      expect(cache).toEqual({});
    });

    it('returns empty object for a directory with no .agentos folder', async () => {
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-cache-empty-'));
      try {
        const cache = await readCache(emptyDir);
        expect(cache).toEqual({});
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('writeCache + readCache round-trip', () => {
    it('persists a cache entry and reads it back', async () => {
      const cache: CompileCache = {
        'CLAUDE.md': { contentHash: 'abc123', writtenAt: '2025-01-01T00:00:00.000Z' },
      };
      await writeCache(tmpDir, cache);
      const read = await readCache(tmpDir);
      expect(read['CLAUDE.md']).toEqual(cache['CLAUDE.md']);
    });

    it('round-trips multiple entries', async () => {
      const cache: CompileCache = {
        'CLAUDE.md': { contentHash: 'aaa', writtenAt: '2025-01-01T00:00:00.000Z' },
        '.cursor/rules/foo.mdc': { contentHash: 'bbb', writtenAt: '2025-01-02T00:00:00.000Z' },
      };
      await writeCache(tmpDir, cache);
      const read = await readCache(tmpDir);
      expect(Object.keys(read)).toHaveLength(2);
      expect(read['.cursor/rules/foo.mdc'].contentHash).toBe('bbb');
    });

    it('overwrites existing cache file on second write', async () => {
      await writeCache(tmpDir, { 'a.md': { contentHash: 'old', writtenAt: '2025-01-01T00:00:00.000Z' } });
      await writeCache(tmpDir, { 'b.md': { contentHash: 'new', writtenAt: '2025-01-02T00:00:00.000Z' } });
      const read = await readCache(tmpDir);
      expect(read).not.toHaveProperty('a.md');
      expect(read['b.md'].contentHash).toBe('new');
    });

    it('creates the .agentos directory if it does not exist', async () => {
      await writeCache(tmpDir, {});
      const stat = await fs.stat(path.join(tmpDir, '.agentos/compile-cache.json'));
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('isCacheHit', () => {
    it('returns true when the stored hash matches', () => {
      const cache: CompileCache = {
        'CLAUDE.md': { contentHash: 'abc123', writtenAt: '2025-01-01T00:00:00.000Z' },
      };
      expect(isCacheHit(cache, 'CLAUDE.md', 'abc123')).toBe(true);
    });

    it('returns false when the stored hash differs', () => {
      const cache: CompileCache = {
        'CLAUDE.md': { contentHash: 'abc123', writtenAt: '2025-01-01T00:00:00.000Z' },
      };
      expect(isCacheHit(cache, 'CLAUDE.md', 'different')).toBe(false);
    });

    it('returns false when the output path is not in the cache', () => {
      const cache: CompileCache = {};
      expect(isCacheHit(cache, 'CLAUDE.md', 'abc123')).toBe(false);
    });
  });

  describe('updateCache', () => {
    it('writes the correct contentHash for the given path', () => {
      const cache: CompileCache = {};
      updateCache(cache, 'CLAUDE.md', 'deadbeef1234');
      expect(cache['CLAUDE.md'].contentHash).toBe('deadbeef1234');
    });

    it('writes a writtenAt ISO timestamp', () => {
      const before = Date.now();
      const cache: CompileCache = {};
      updateCache(cache, 'CLAUDE.md', 'abc');
      const after = Date.now();
      const writtenAt = new Date(cache['CLAUDE.md'].writtenAt).getTime();
      expect(writtenAt).toBeGreaterThanOrEqual(before);
      expect(writtenAt).toBeLessThanOrEqual(after);
    });

    it('overwrites an existing entry', () => {
      const cache: CompileCache = {
        'CLAUDE.md': { contentHash: 'old', writtenAt: '2020-01-01T00:00:00.000Z' },
      };
      updateCache(cache, 'CLAUDE.md', 'new');
      expect(cache['CLAUDE.md'].contentHash).toBe('new');
    });

    it('mutates the cache object in place', () => {
      const cache: CompileCache = {};
      updateCache(cache, 'foo.md', 'hash1');
      expect(Object.keys(cache)).toContain('foo.md');
    });

    it('isCacheHit returns true immediately after updateCache', () => {
      const cache: CompileCache = {};
      updateCache(cache, 'output.md', 'myhash');
      expect(isCacheHit(cache, 'output.md', 'myhash')).toBe(true);
    });
  });
});
