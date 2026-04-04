/**
 * Claude Code compiler driver.
 *
 * Compiles the AgentFS kernel manifest into a `CLAUDE.md` file
 * at the vault root — the native config format for Claude Code.
 *
 * @see docs/architecture.md Section 9 "Compile Pipeline"
 * @module compilers/claude
 */

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AgentCompiler, CompileContext, CompileResult } from '../types/index.js';
import { compileTemplate } from './base.js';

// ---------------------------------------------------------------------------
// Supported features
// ---------------------------------------------------------------------------

/**
 * Features natively supported by Claude Code.
 *
 * 'security-enforce' is supported because Claude Code implements real
 * `permissions.deny` enforcement, unlike agents that only read guidelines.
 */
const SUPPORTED_FEATURES = new Set<string>(['security-enforce']);

// ---------------------------------------------------------------------------
// Template path
// ---------------------------------------------------------------------------

/**
 * Resolve the Handlebars template path relative to this module's location.
 *
 * Using `import.meta.url` ensures correctness whether the package is
 * installed globally, locally, or run via `npx`.
 *
 * Layout assumption:
 *   src/compilers/claude.ts          ← this file (2 levels down from root)
 *   templates/compilers/claude.md.hbs ← target (2 levels up, then down)
 */
const TEMPLATE_URL = new URL(
  '../../templates/compilers/claude.md.hbs',
  import.meta.url,
);

// ---------------------------------------------------------------------------
// Compiler implementation
// ---------------------------------------------------------------------------

/**
 * Claude Code compiler driver.
 *
 * Implements {@link AgentCompiler} for the `claude` runtime.
 * Reads `templates/compilers/claude.md.hbs`, fills it with data
 * from the {@link CompileContext}, and outputs a single `CLAUDE.md`
 * file at the vault root.
 *
 * @example
 * ```ts
 * import { claudeCompiler } from './compilers/claude.js';
 * const result = await claudeCompiler.compile(ctx);
 * ```
 */
export const claudeCompiler: AgentCompiler = {
  /** Agent runtime identifier. */
  name: 'claude',

  /**
   * Compile manifest + context into a `CLAUDE.md` file.
   *
   * Template data exposed to Handlebars:
   * - `vault`       — `manifest.vault` (name, owner, created)
   * - `agentos`     — `manifest.agentos` (version, profile)
   * - `paths`       — `manifest.paths` (FHS directory mapping)
   * - `frontmatter` — `manifest.frontmatter` (required / standard fields)
   * - `boot`        — `manifest.boot` (sequence, variables)
   * - `modules`     — `manifest.modules` (optional active modules list)
   * - `identity`    — content of `init.d/00-identity.md`, or `null`
   * - `corrections` — content of `.agentos/memory/corrections.md`, or `null`
   *
   * @param context - Full compile context (manifest, init scripts, memory, etc.)
   * @returns CompileResult with one managed output: `CLAUDE.md`
   */
  async compile(context: CompileContext): Promise<CompileResult> {
    const { manifest, initScripts, corrections } = context;

    // Read template from the filesystem (async, so hot-reload works in dev)
    const templateSource = await fs.readFile(fileURLToPath(TEMPLATE_URL), 'utf-8');

    // Clean identity: strip the file header and <!-- custom --> marker
    const rawIdentity = initScripts['00-identity.md'] ?? '';
    const identityClean = rawIdentity
      .replace(/^# Agent Identity\s*\n*/m, '')
      .replace(/<!--\s*custom\s*-->\s*$/m, '')
      .trim() || null;

    // Parse corrections: extract only actual entries (lines that aren't headers/comments)
    const correctionsEntries = corrections
      ? corrections
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .filter((line) => !line.startsWith('#') && !line.startsWith('>'))
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter((line) => line.length > 0)
      : null;

    // Build template data from context
    const templateData = {
      vault: manifest.vault,
      agentos: manifest.agentos,
      paths: manifest.paths,
      frontmatter: manifest.frontmatter,
      boot: manifest.boot,
      modules: manifest.modules ?? null,
      identityClean,
      correctionsEntries,
    };

    // Compile template and render
    const render = compileTemplate(templateSource);
    const content = render(templateData);

    return {
      agent: 'claude',
      outputs: [
        {
          path: 'CLAUDE.md',
          content,
          managed: true,
        },
      ],
      summary: `Compiled CLAUDE.md for vault "${manifest.vault.name}" (profile: ${manifest.agentos.profile})`,
    };
  },

  /**
   * Check whether Claude Code natively supports a given feature.
   *
   * Claude Code supports `'security-enforce'` because it implements
   * real `permissions.deny` blocking — not just advisory guidelines.
   *
   * @param feature - Feature identifier to query
   * @returns `true` if Claude Code can enforce the feature
   */
  supports(feature: string): boolean {
    return SUPPORTED_FEATURES.has(feature);
  },
};
