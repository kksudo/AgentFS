import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { 
  readManifest, 
  readInitScripts, 
  readSemanticMemory, 
  readCorrections, 
  buildCompileContext, 
  compileTemplate, 
  writeOutputs 
} from '../src/compilers/base.js';
import type { CompileOutput } from '../src/types/index.js';

describe('compilers/base', () => {
  let tmpVault: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-base-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  describe('readManifest', () => {
    test('parses manifest.yaml successfully', async () => {
      await fs.mkdir(path.join(tmpVault, '.agentos'), { recursive: true });
      await fs.writeFile(
        path.join(tmpVault, '.agentos', 'manifest.yaml'),
        'version: "1.0"\nvault:\n  owner: test-owner\n'
      );
      const manifest = await readManifest(tmpVault);
      expect(manifest.version).toBe('1.0');
      expect(manifest.vault.owner).toBe('test-owner');
    });

    test('throws on missing manifest', async () => {
      await expect(readManifest(tmpVault)).rejects.toThrow();
    });
  });

  describe('readInitScripts', () => {
    test('reads all .md files in init.d', async () => {
      await fs.mkdir(path.join(tmpVault, '.agentos', 'init.d'), { recursive: true });
      await fs.writeFile(path.join(tmpVault, '.agentos', 'init.d', '00-identity.md'), 'identity content');
      await fs.writeFile(path.join(tmpVault, '.agentos', 'init.d', '10-rules.md'), 'rules content');
      await fs.writeFile(path.join(tmpVault, '.agentos', 'init.d', 'ignore.txt'), 'ignore me');

      const scripts = await readInitScripts(tmpVault);
      expect(Object.keys(scripts)).toEqual(['00-identity.md', '10-rules.md']);
      expect(scripts['00-identity.md']).toBe('identity content');
    });

    test('returns empty object if init.d does not exist', async () => {
      const scripts = await readInitScripts(tmpVault);
      expect(scripts).toEqual({});
    });
  });

  describe('readSemanticMemory & readCorrections', () => {
    test('reads existing memory files', async () => {
      await fs.mkdir(path.join(tmpVault, '.agentos', 'memory'), { recursive: true });
      await fs.writeFile(path.join(tmpVault, '.agentos', 'memory', 'semantic.md'), 'semantic-stuff');
      await fs.writeFile(path.join(tmpVault, '.agentos', 'memory', 'corrections.md'), 'correction-stuff');

      expect(await readSemanticMemory(tmpVault)).toBe('semantic-stuff');
      expect(await readCorrections(tmpVault)).toBe('correction-stuff');
    });

    test('returns null if memory files are missing', async () => {
      expect(await readSemanticMemory(tmpVault)).toBeNull();
      expect(await readCorrections(tmpVault)).toBeNull();
    });
  });

  describe('buildCompileContext', () => {
    test('assembles everything into CompileContext', async () => {
      await fs.mkdir(path.join(tmpVault, '.agentos', 'init.d'), { recursive: true });
      await fs.mkdir(path.join(tmpVault, '.agentos', 'memory'), { recursive: true });
      
      await fs.writeFile(
        path.join(tmpVault, '.agentos', 'manifest.yaml'),
        'version: "1.0"'
      );
      await fs.writeFile(path.join(tmpVault, '.agentos', 'init.d', '00-id.md'), 'id');
      await fs.writeFile(path.join(tmpVault, '.agentos', 'memory', 'semantic.md'), 'sem');

      const ctx = await buildCompileContext(tmpVault, true);
      expect(ctx.dryRun).toBe(true);
      expect(ctx.vaultRoot).toBe(tmpVault);
      expect(ctx.manifest.version).toBe('1.0');
      expect(ctx.initScripts['00-id.md']).toBe('id');
      expect(ctx.semanticMemory).toBe('sem');
      expect(ctx.corrections).toBeNull();
    });
  });

  describe('compileTemplate', () => {
    test('registers helpers and renders handlebars templates', () => {
      const tmpl = compileTemplate('Hello {{capitalize name}}, today is {{today}}');
      const rendered = tmpl({ name: 'world' });
      expect(rendered).toContain('Hello World');
      expect(rendered).toMatch(/today is \d{4}-\d{2}-\d{2}/);
    });

    test('eq helper', () => {
      const tmpl = compileTemplate('{{#eq type "test"}}match{{else}}miss{{/eq}}');
      expect(tmpl({ type: 'test' })).toBe('match');
      expect(tmpl({ type: 'other' })).toBe('miss');
    });

    test('join helper', () => {
      const tmpl = compileTemplate('{{join items " | "}}');
      expect(tmpl({ items: ['a', 'b'] })).toBe('a | b');
    });

    test('pathTable helper', () => {
      const tmpl = compileTemplate('{{{pathTable paths}}}');
      expect(tmpl({ paths: { tmp: 'Inbox', daily: 'Daily' } }))
        .toBe('| `tmp` | `Inbox/` |\n| `daily` | `Daily/` |');
    });
  });

  describe('writeOutputs', () => {
    test('skips writing during dry-run but returns paths', async () => {
      const outputs: CompileOutput[] = [
        { path: 'test.txt', content: 'hello', managed: true }
      ];
      const paths = await writeOutputs(outputs, tmpVault, true);
      expect(paths).toEqual(['test.txt']);
      
      await expect(fs.readFile(path.join(tmpVault, 'test.txt'))).rejects.toThrow();
    });

    test('writes files when dryRun is false', async () => {
      const outputs: CompileOutput[] = [
        { path: 'outdir/test.txt', content: 'hello', managed: true }
      ];
      const paths = await writeOutputs(outputs, tmpVault, false);
      expect(paths).toEqual(['outdir/test.txt']);
      
      const content = await fs.readFile(path.join(tmpVault, 'outdir/test.txt'), 'utf8');
      expect(content).toBe('hello');
    });
  });
});
