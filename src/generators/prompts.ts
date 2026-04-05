/**
 * Interactive setup prompts for `npx create-agentfs`.
 *
 * Uses `inquirer` to collect vault configuration from the user.
 * Returns a `SetupAnswers` object that drives all downstream generators.
 *
 * @module generators/prompts
 */

import inquirer from 'inquirer';
import path from 'node:path';
import type { Profile, AgentRuntime, SetupAnswers } from '../types/index.js';
import type { CliFlags } from '../utils/cli-flags.js';
import { resolveInput } from '../utils/cli-flags.js';

/** Available vault profiles with descriptions. */
const PROFILES: { name: string; value: Profile }[] = [
  { name: 'Personal — solo engineer, creator, builder', value: 'personal' },
  { name: 'Company — team with shared knowledge base', value: 'company' },
  { name: 'Shared — multi-user collaborative vault', value: 'shared' },
];

/** Available agent runtimes. */
const AGENTS: { name: string; value: AgentRuntime }[] = [
  { name: 'Claude Code', value: 'claude' },
  { name: 'OpenClaw / OMC', value: 'openclaw' },
  { name: 'Cursor', value: 'cursor' },
];

/** Optional modules available per profile. */
const MODULES: Record<Profile, { name: string; value: string }[]> = {
  personal: [
    { name: 'Career — job search pipeline', value: 'career' },
    { name: 'Content — multi-platform publishing', value: 'content' },
    { name: 'Engineering — professional knowledge base', value: 'engineering' },
    { name: 'BMAD — project management framework', value: 'bmad' },
  ],
  company: [
    { name: 'Clients — client project management', value: 'clients' },
    { name: 'Content — company blog/docs pipeline', value: 'content' },
    { name: 'BMAD — project management framework', value: 'bmad' },
  ],
  shared: [
    { name: 'Content — shared content pipeline', value: 'content' },
    { name: 'BMAD — project management framework', value: 'bmad' },
  ],
};

/**
 * Run the interactive setup wizard.
 *
 * @param targetDir - Directory where the vault will be created (defaults to cwd)
 * @returns Answers collected from the user
 */
export async function runSetupPrompts(targetDir?: string): Promise<SetupAnswers> {
  const resolvedDir = targetDir ?? process.cwd();
  const dirName = path.basename(resolvedDir);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'vaultName',
      message: 'Vault name:',
      default: dirName,
      validate: (input: string) => input.trim().length > 0 || 'Vault name cannot be empty',
    },
    {
      type: 'input',
      name: 'ownerName',
      message: 'Owner name (person or team):',
      validate: (input: string) => input.trim().length > 0 || 'Owner name cannot be empty',
    },
    {
      type: 'list',
      name: 'profile',
      message: 'Vault profile:',
      choices: PROFILES,
      default: 'personal',
    },
    {
      type: 'list',
      name: 'primaryAgent',
      message: 'Primary AI agent:',
      choices: AGENTS,
      default: 'claude',
    },
    {
      type: 'checkbox',
      name: 'supportedAgents',
      message: 'Additional supported agents:',
      choices: (prev: Record<string, unknown>) =>
        AGENTS.filter((a) => a.value !== prev.primaryAgent),
    },
    {
      type: 'checkbox',
      name: 'modules',
      message: 'Optional modules to enable:',
      choices: (prev: Record<string, unknown>) =>
        MODULES[prev.profile as Profile] ?? [],
    },
  ]);

  return {
    vaultName: answers.vaultName.trim(),
    ownerName: answers.ownerName.trim(),
    profile: answers.profile as Profile,
    primaryAgent: answers.primaryAgent as AgentRuntime,
    supportedAgents: [
      answers.primaryAgent as AgentRuntime,
      ...(answers.supportedAgents as AgentRuntime[]),
    ],
    modules: answers.modules as string[],
    targetDir: resolvedDir,
  };
}

/**
 * Create SetupAnswers programmatically (for testing and non-interactive use).
 *
 * @param overrides - Partial answers to merge with defaults
 * @returns Complete SetupAnswers with defaults filled in
 */
export function createDefaultAnswers(overrides: Partial<SetupAnswers> = {}): SetupAnswers {
  return {
    vaultName: 'my-vault',
    ownerName: 'user',
    profile: 'personal',
    primaryAgent: 'claude',
    supportedAgents: ['claude'],
    modules: [],
    targetDir: process.cwd(),
    ...overrides,
  };
}

/**
 * Resolve SetupAnswers from CLI flags — either JSON/config input or interactive prompts.
 *
 * AI agents use: `agentfs init --json '{"vaultName":"x","profile":"personal"}'`
 * Humans use: `agentfs init` (interactive prompts)
 *
 * @param flags - Parsed CLI flags from parseCliFlags()
 * @returns Complete SetupAnswers
 */
export async function resolveSetupAnswers(flags: CliFlags): Promise<SetupAnswers> {
  const input = await resolveInput(flags);

  if (input !== null) {
    // Non-interactive mode: merge only defined JSON fields with defaults
    const overrides: Partial<SetupAnswers> = { targetDir: flags.targetDir };
    if (input.vaultName !== undefined) overrides.vaultName = input.vaultName as string;
    if (input.ownerName !== undefined) overrides.ownerName = input.ownerName as string;
    if (input.profile !== undefined) overrides.profile = input.profile as Profile;
    if (input.primaryAgent !== undefined) overrides.primaryAgent = input.primaryAgent as AgentRuntime;
    if (input.supportedAgents !== undefined) overrides.supportedAgents = input.supportedAgents as AgentRuntime[];
    if (input.modules !== undefined) overrides.modules = input.modules as string[];
    return createDefaultAnswers(overrides);
  }

  // Interactive mode: run inquirer prompts
  return runSetupPrompts(flags.targetDir);
}
