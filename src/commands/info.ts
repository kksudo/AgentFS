/**
 * Info command — display a summary of the current AgentFS vault.
 *
 * @module commands/info
 */

import { buildCompileContext } from '../compilers/base.js';
import { readSecurityPolicy } from '../security/parser.js';
import { parseSemanticMemory, listEpisodicDates, listProceduralSkills } from '../memory/index.js';
import { CliFlags, printResult, printError } from '../utils/cli-flags.js';
import { readOsRelease } from '../generators/os-release.js';
import { CLI_VERSION } from '../utils/version.js';

/**
 * Entry point for the `agentfs info` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function infoCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;

  let context: Awaited<ReturnType<typeof buildCompileContext>>;
  try {
    context = await buildCompileContext(vaultRoot, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT' || msg.includes('ENOENT');
    printError(
      flags,
      isNotFound ? 'No AgentFS vault found. Run `agentfs init` to create one.' : msg,
      isNotFound ? 'VAULT_NOT_FOUND' : 'INFO_ERROR',
    );
    return 1;
  }

  const { manifest, initScripts, semanticMemory, corrections } = context;

  // Security policy
  const { policy } = await readSecurityPolicy(vaultRoot);

  // Memory counts
  const semanticEntries = semanticMemory ? parseSemanticMemory(semanticMemory) : [];
  const semanticCount = semanticEntries.length;

  const [episodicDates, proceduralSkills] = await Promise.all([
    listEpisodicDates(vaultRoot),
    listProceduralSkills(vaultRoot),
  ]);
  const episodicCount = episodicDates.length;
  const proceduralCount = proceduralSkills.length;

  // Corrections count — non-empty, non-comment lines
  const correctionsCount = corrections
    ? corrections.split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith('#')).length
    : 0;

  // Boot sequence — filenames from initScripts
  const bootScripts = Object.keys(initScripts).sort();

  // Manifest fields
  const vaultName = manifest.vault?.name ?? '(unknown)';
  const ownerName = manifest.vault?.owner ?? '(unknown)';
  const profile = manifest.agentos?.profile ?? '(unknown)';
  const modules: string[] = manifest.modules ?? [];
  const paths = (manifest.paths ?? {}) as unknown as Record<string, string>;

  // Security fields
  const securityMode = policy.default_mode;
  const denyReadCount = policy.file_access.deny_read.length;
  const denyWriteCount = policy.file_access.deny_write.length;

  // Version info
  const osRelease = await readOsRelease(vaultRoot);
  const vaultVersion = osRelease?.VERSION ?? 'unknown';
  const schemaVersion = osRelease?.SCHEMA_VERSION ?? 'unknown';
  const vaultCreated = osRelease?.VAULT_CREATED ?? 'unknown';
  const lastUpgrade = osRelease?.LAST_UPGRADE ?? null;

  // Build human output
  let human = '\nAgentFS Info\n' + '═'.repeat(54) + '\n';
  human += `  Vault:      ${vaultName} (${profile})\n`;
  human += `  Owner:      ${ownerName}\n`;
  human += `  Version:    vault v${vaultVersion} (schema v${schemaVersion}), CLI v${CLI_VERSION}\n`;
  if (vaultCreated !== 'unknown') {
    human += `  Created:    ${vaultCreated}${lastUpgrade ? `, upgraded ${lastUpgrade}` : ''}\n`;
  }
  human += '\n';
  human += `  Memory:     ${semanticCount} semantic, ${episodicCount} episodic, ${proceduralCount} procedural\n`;
  human += `  Security:   ${securityMode} mode, ${denyReadCount} deny-read, ${denyWriteCount} deny-write\n`;

  if (bootScripts.length > 0) {
    human += `  Boot:       ${bootScripts.join(', ')}\n`;
  } else {
    human += `  Boot:       (none)\n`;
  }

  if (modules.length > 0) {
    human += `  Modules:    ${modules.join(', ')}\n`;
  } else {
    human += `  Modules:    (none)\n`;
  }

  human += `  Corrections: ${correctionsCount} active\n`;

  if (Object.keys(paths).length > 0) {
    human += '\n  FHS Navigation:\n';
    for (const [key, value] of Object.entries(paths)) {
      human += `    ${key.padEnd(8)} → ${value}\n`;
    }
  }

  human += '\n';

  const jsonData = {
    vault: vaultName,
    owner: ownerName,
    profile,
    version: {
      vault: vaultVersion,
      schema: schemaVersion,
      cli: CLI_VERSION,
      created: vaultCreated,
      lastUpgrade,
    },
    memory: {
      semantic: semanticCount,
      episodic: episodicCount,
      procedural: proceduralCount,
    },
    security: {
      mode: securityMode,
      denyRead: denyReadCount,
      denyWrite: denyWriteCount,
    },
    boot: bootScripts,
    modules,
    corrections: correctionsCount,
    paths,
  };

  printResult(flags, human, jsonData);
  return 0;
}
