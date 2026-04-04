/**
 * AGENT-MAP.md generator — shared across all agent runtimes.
 *
 * Reads the agent-map.md.hbs template and renders it from the current
 * CompileContext. The output is a single managed file at the vault root
 * (`AGENT-MAP.md`) that gives any agent a unified view of the vault layout,
 * active modules, and boot sequence.
 *
 * This is intentionally NOT an AgentCompiler because it belongs to no single
 * agent — every compile run (for any target agent) should regenerate it.
 *
 * @module compilers/agent-map
 */

import fs from 'node:fs/promises';
import type { CompileContext, CompileOutput, FhsPaths } from '../types/index.js';
import { compileTemplate } from './base.js';

/**
 * Render AGENTS.md from the current compile context.
 *
 * Reads `templates/compilers/agent-map.md.hbs` relative to this module's
 * location (ESM-safe), compiles it with Handlebars, and returns a single
 * managed CompileOutput at path `AGENTS.md`.
 *
 * The template data is built directly from `context.manifest`, exposing:
 * - `vault`    — name, owner
 * - `agentos`  — profile
 * - `agents`   — primary, supported array
 * - `paths`    — FhsPaths object (rendered as a table by the `pathTable` helper)
 * - `boot`     — sequence array
 * - `modules`  — optional active module list
 *
 * @param context - Compile context built by `buildCompileContext`
 * @returns A single CompileOutput for AGENTS.md (managed: true)
 */
export async function generateAgentsFile(context: CompileContext): Promise<CompileOutput> {
  // Resolve template path relative to this file — ESM-safe.
  const templateUrl = new URL(
    '../../templates/compilers/agent-map.md.hbs',
    import.meta.url,
  );
  const templateSource = await fs.readFile(templateUrl, 'utf-8');
  const template = compileTemplate(templateSource);

  const { manifest } = context;

  // Build the data object that maps to the template's {{variable}} references.
  const data: AgentsFileTemplateData = {
    vault: {
      name: manifest.vault.name,
      owner: manifest.vault.owner,
    },
    agentos: {
      profile: manifest.agentos.profile,
    },
    agents: {
      primary: manifest.agents.primary,
      supported: manifest.agents.supported,
    },
    paths: manifest.paths,
    boot: {
      sequence: manifest.boot.sequence,
    },
    modules: manifest.modules ?? [],
  };

  const content = template(data);

  return {
    path: 'AGENTS.md',
    content,
    managed: true,
  };
}

// ---------------------------------------------------------------------------
// Internal template data shape
// ---------------------------------------------------------------------------

/**
 * Data object passed to the agent-map.md.hbs template.
 *
 * Kept local to this module — callers only see the public
 * `generateAgentsFile` function.
 */
interface AgentsFileTemplateData {
  vault: {
    name: string;
    owner: string;
  };
  agentos: {
    profile: string;
  };
  agents: {
    primary: string;
    supported: string[];
  };
  paths: FhsPaths;
  boot: {
    sequence: string[];
  };
  modules: string[];
}
