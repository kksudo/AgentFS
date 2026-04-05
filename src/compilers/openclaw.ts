/**
 * OpenClaw compiler driver — Story 10.1.
 *
 * Compiles the AgentFS kernel into OpenClaw-native formats:
 * - .openclaw/SOUL.md: Persona, tone, boundaries
 * - .openclaw/IDENTITY.md: Name, vibe, metadata
 * - .openclaw/AGENTS.md: Rules, priorities, instructions
 * - .openclaw/USER.md: Human user context
 * - .openclaw/TOOLS.md: Tool usage guidance
 *
 * @module compilers/openclaw
 */

import type { AgentCompiler, CompileContext, CompileResult, CompileOutput } from '../types/index.js';

export const openclawCompiler: AgentCompiler = {
  name: 'openclaw',

  async compile(context: CompileContext): Promise<CompileResult> {
    const { manifest, initScripts, semanticMemory } = context;
    const outputs: CompileOutput[] = [];

    // 1. .openclaw/SOUL.md (Persona & Boundaries)
    const soulLines: string[] = [];
    soulLines.push('# Persona & Boundaries');
    soulLines.push('');
    soulLines.push('## Core Vibe');
    soulLines.push('Maintain a professional yet agentic persona as defined in the AgentOS manifest.');
    soulLines.push('');
    soulLines.push('## Boundaries');
    soulLines.push('- Follow all security policies defined in the kernel space.');
    soulLines.push('- Do not exfiltrate secrets or private data.');
    outputs.push({ path: '.openclaw/SOUL.md', content: soulLines.join('\n') + '\n', managed: true });

    // 2. .openclaw/IDENTITY.md (Agent Name & Metadata)
    const idLines: string[] = [];
    idLines.push(`# Identity: ${manifest.vault?.name ?? 'AgentFS Vault'}`);
    idLines.push('');
    idLines.push(`- Profile: ${manifest.agentos?.profile ?? 'personal'}`);
    if (initScripts['00-identity.md']) {
      idLines.push('');
      idLines.push(initScripts['00-identity.md']);
    }
    outputs.push({ path: '.openclaw/IDENTITY.md', content: idLines.join('\n') + '\n', managed: true });

    // 3. .openclaw/AGENTS.md (Rules & Priorities)
    const agentLines: string[] = [];
    agentLines.push('# Rules & Priorities');
    agentLines.push('');
    if (semanticMemory) {
      agentLines.push('## Active Knowledge & Rules');
      agentLines.push(semanticMemory);
      agentLines.push('');
    }
    if (manifest.boot?.sequence) {
      agentLines.push('## Boot Sequence Requirements');
      for (const script of manifest.boot.sequence) {
        agentLines.push(`- ${script}`);
      }
      agentLines.push('');
    }
    outputs.push({ path: '.openclaw/AGENTS.md', content: agentLines.join('\n') + '\n', managed: true });

    // 4. .openclaw/USER.md (User Context)
    const userLines: string[] = [];
    userLines.push('# User Context');
    userLines.push('');
    userLines.push(`**Owner:** ${manifest.vault?.owner ?? 'unknown'}`);
    outputs.push({ path: '.openclaw/USER.md', content: userLines.join('\n') + '\n', managed: true });

    // 5. .openclaw/TOOLS.md (Tools Guidance)
    const toolLines: string[] = [];
    toolLines.push('# Tool Usage Guidance');
    toolLines.push('');
    toolLines.push('This agent operates within an AgentFS vault.');
    toolLines.push('Prefer using the `agentfs` CLI for system-level operations.');
    outputs.push({ path: '.openclaw/TOOLS.md', content: toolLines.join('\n') + '\n', managed: true });

    return {
      agent: 'openclaw',
      outputs,
      summary: `Compiled correct OpenClaw structure in .openclaw/ for vault "${manifest.vault?.name ?? 'unknown'}"`,
    };
  },

  supports(_feature: string): boolean {
    // OpenClaw doesn't support native security enforcement in the formats we're compiling
    return false;
  },
};
