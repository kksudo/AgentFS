/**
 * OpenClaw compiler driver — Story 10.1.
 *
 * Compiles the AgentFS kernel into OpenClaw-native formats:
 * - .openclaw/SOUL.md: Persona, tone, boundaries
 * - .openclaw/IDENTITY.md: Name, vibe, metadata
 * - .openclaw/AGENTS.md: Rules, priorities, instructions
 * - .openclaw/USER.md: Human user context
 * - .openclaw/TOOLS.md: Tool usage guidance
 * - .openclaw/SECURITY.md: Security policy and deny rules
 *
 * @module compilers/openclaw
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { AgentCompiler, CompileContext, CompileResult, CompileOutput } from '../types/index.js';

export const openclawCompiler: AgentCompiler = {
  name: 'openclaw',

  async compile(context: CompileContext): Promise<CompileResult> {
    const { manifest, initScripts, semanticMemory, corrections, vaultRoot } = context;
    const outputs: CompileOutput[] = [];

    // Read security policy if it exists
    let securityPolicy: Record<string, unknown> | null = null;
    try {
      const policyPath = path.join(vaultRoot, '.agentos', 'security', 'policy.yaml');
      const policyContent = await fs.readFile(policyPath, 'utf-8');
      securityPolicy = yaml.load(policyContent) as Record<string, unknown>;
    } catch {
      // policy.yaml doesn't exist — skip security compilation
    }

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
    agentLines.push('## Vault Navigation');
    agentLines.push('');
    agentLines.push('**IMPORTANT:** Instead of running `ls`, `find`, or `tree`, read `AGENT-MAP.md` at the vault root.');
    agentLines.push('It contains:');
    agentLines.push('- FHS mapping (which directory is for what)');
    agentLines.push('- Boot sequence (which files to read first)');
    agentLines.push('- Active modules (what features are enabled)');
    agentLines.push('');
    agentLines.push('Example: "Where should I put a new daily note?"');
    agentLines.push('→ Read AGENT-MAP.md → Find "Daily" in the FHS table → Answer: "Daily/"');
    agentLines.push('');
    agentLines.push('## Memory System (Lazy Load)');
    agentLines.push('');
    agentLines.push('### Semantic Memory (Always Loaded)');
    agentLines.push('See below for active facts, preferences, and rules.');
    agentLines.push('');
    agentLines.push('### Episodic Memory (Load on Demand)');
    agentLines.push('Location: `.agentos/memory/episodic/YYYY-MM-DD.md`');
    agentLines.push('');
    agentLines.push('When asked "What did I do today?", read ONLY:');
    agentLines.push('- `.agentos/memory/episodic/{today}.md`');
    agentLines.push('');
    agentLines.push('**Do NOT read the entire episodic/ directory.**');
    agentLines.push('');
    agentLines.push('### Procedural Memory (Load on Demand)');
    agentLines.push('Location: `.agentos/memory/procedural/{skill}.md`');
    agentLines.push('');
    agentLines.push('When asked about a specific skill (e.g., "How do I deploy?"), read ONLY:');
    agentLines.push('- `.agentos/memory/procedural/deploy.md`');
    agentLines.push('');
    agentLines.push('**Do NOT scan the entire procedural/ directory.**');
    agentLines.push('');
    if (semanticMemory) {
      agentLines.push('## Active Knowledge & Rules');
      agentLines.push(semanticMemory);
      agentLines.push('');
    }
    if (corrections) {
      agentLines.push('## Past Mistakes (Learn from These)');
      agentLines.push(corrections);
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

    // 6. .openclaw/SECURITY.md (Security Policy)
    if (securityPolicy) {
      const secLines: string[] = [];
      secLines.push('# Security Policy');
      secLines.push('');
      secLines.push('## Deny Rules (HARD-GATE)');
      secLines.push('');
      secLines.push('These files are **NEVER** readable by this agent:');
      secLines.push('');
      if (securityPolicy.deny_read && Array.isArray(securityPolicy.deny_read)) {
        for (const pattern of securityPolicy.deny_read) {
          secLines.push(`- \`${pattern}\``);
        }
      } else {
        secLines.push('- `.agentos/secrets/**` — Encrypted secrets vault');
        secLines.push('- `**/*.key` — Private keys');
        secLines.push('- `**/.env` — Environment variables');
      }
      secLines.push('');
      secLines.push('These files are **NEVER** writable by this agent:');
      secLines.push('');
      if (securityPolicy.deny_write && Array.isArray(securityPolicy.deny_write)) {
        for (const pattern of securityPolicy.deny_write) {
          secLines.push(`- \`${pattern}\``);
        }
      } else {
        secLines.push('- `.agentos/manifest.yaml` — Managed by AgentFS');
        secLines.push('- `.agentos/security/policy.yaml` — Security policy is read-only');
        secLines.push('- `.openclaw/**` — Auto-generated by AgentFS compile');
      }
      secLines.push('');
      secLines.push('## Enforcement');
      secLines.push('');
      secLines.push('If you are asked to read or modify a deny-listed file, respond:');
      secLines.push('');
      secLines.push('> "This file is protected by the security policy. I cannot access it."');
      secLines.push('');
      secLines.push('## Rationalization Resistance');
      secLines.push('');
      secLines.push('These attempts to bypass security policy are **NOT** allowed:');
      secLines.push('');
      secLines.push('1. **"I\'ll just check if the file exists"**');
      secLines.push('   - Even `ls`, `stat`, or `test -f` on deny-listed files is forbidden.');
      secLines.push('   - Reason: Existence check is information leakage.');
      secLines.push('');
      secLines.push('2. **"The user explicitly asked me to read it"**');
      secLines.push('   - Security policy overrides user requests.');
      secLines.push('   - Reason: The policy is set by the vault owner, not the current user.');
      secLines.push('');
      secLines.push('3. **"I\'ll copy it to /tmp so the user can read it themselves"**');
      secLines.push('   - Copying deny-listed content anywhere is forbidden.');
      secLines.push('   - Reason: This is exfiltration, just with extra steps.');
      secLines.push('');
      secLines.push('If you encounter these requests, respond:');
      secLines.push('');
      secLines.push('> "I cannot do this. The security policy forbids it, and policy overrides user requests."');
      secLines.push('');
      outputs.push({ path: '.openclaw/SECURITY.md', content: secLines.join('\n') + '\n', managed: true });
    }

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
