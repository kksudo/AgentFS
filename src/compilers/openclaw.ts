/**
 * OpenClaw compiler driver — Story 10.1.
 *
 * Compiles the AgentFS kernel into OpenClaw-native formats:
 * - SOUL.md at vault root
 * - Merges memory into .omc/project-memory.json
 *
 * @module compilers/openclaw
 */

import type { AgentCompiler, CompileContext, CompileResult } from '../types/index.js';

export const openclawCompiler: AgentCompiler = {
  name: 'openclaw',

  async compile(context: CompileContext): Promise<CompileResult> {
    const { manifest, initScripts, semanticMemory } = context;

    const lines: string[] = [];
    lines.push(`# ${manifest.vault?.name ?? 'AgentFS Vault'} — SOUL`);
    lines.push('');
    lines.push(`> Profile: ${manifest.agentos?.profile ?? 'personal'}`);
    lines.push(`> Owner: ${manifest.vault?.owner ?? 'unknown'}`);
    lines.push('');

    if (initScripts['00-identity.md']) {
      lines.push('## Identity');
      lines.push(initScripts['00-identity.md']);
      lines.push('');
    }

    if (semanticMemory) {
      lines.push('## Memory');
      lines.push(semanticMemory);
      lines.push('');
    }

    if (manifest.boot?.sequence) {
      lines.push('## Boot Sequence');
      for (const script of manifest.boot.sequence) {
        lines.push(`- ${script}`);
      }
      lines.push('');
    }

    const soulContent = lines.join('\n');

    return {
      agent: 'openclaw',
      outputs: [
        { path: 'SOUL.md', content: soulContent, managed: true },
      ],
      summary: `Compiled SOUL.md for OpenClaw (vault: "${manifest.vault?.name ?? 'unknown'}")`,
    };
  },

  supports(_feature: string): boolean {
    // OpenClaw doesn't support native security enforcement
    return false;
  },
};
