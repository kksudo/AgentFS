/**
 * agentfs selfcheck — spacecraft-style vault health diagnostics.
 * agentfs status   — compact vault health summary.
 *
 * selfcheck exit codes:
 *   0 — all systems nominal
 *   1 — warnings (degraded but functional)
 *   2 — errors (needs intervention)
 *
 * Flags:
 *   --quick   fast heartbeat check (manifest + memory existence only)
 *   --deep    comprehensive: frontmatter, drift detection, FHS paths
 *
 * @module commands/selfcheck
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CliFlags, printResult } from '../utils/cli-flags.js';
import { readManifest } from '../compilers/base.js';
import { readOsRelease } from '../generators/os-release.js';
import { parseSemanticMemory, isSuperseded } from '../memory/index.js';
import { listEpisodicDates } from '../memory/episodic.js';
import { listProceduralSkills } from '../memory/procedural.js';
import { readSecurityPolicy } from '../security/parser.js';
import { CLI_VERSION } from '../utils/version.js';
import { CURRENT_SCHEMA_VERSION } from '../migrations/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'ok' | 'warn' | 'error';

interface Check {
  name: string;
  severity: Severity;
  message: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkAgentos(vaultRoot: string): Promise<Check> {
  try {
    await fs.access(path.join(vaultRoot, '.agentos'));
    return { name: 'AgentFS kernel', severity: 'ok', message: '.agentos/ exists' };
  } catch {
    return { name: 'AgentFS kernel', severity: 'error', message: '.agentos/ not found — run `agentfs init`' };
  }
}

async function checkManifest(vaultRoot: string): Promise<Check> {
  try {
    const manifest = await readManifest(vaultRoot);
    if (!manifest.vault?.name) {
      return { name: 'Manifest', severity: 'warn', message: 'manifest.yaml found but vault.name missing' };
    }
    return { name: 'Manifest', severity: 'ok', message: `manifest.yaml valid (vault: "${manifest.vault.name}")` };
  } catch (err) {
    return { name: 'Manifest', severity: 'error', message: `manifest.yaml unreadable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function checkOsRelease(vaultRoot: string): Promise<Check> {
  const osRelease = await readOsRelease(vaultRoot);
  if (osRelease === null) {
    return { name: 'OS release', severity: 'warn', message: 'os-release not found — run `agentfs compile`' };
  }
  if (osRelease.SCHEMA_VERSION !== CURRENT_SCHEMA_VERSION) {
    return { name: 'OS release', severity: 'warn', message: `schema v${osRelease.SCHEMA_VERSION} outdated (current: v${CURRENT_SCHEMA_VERSION}) — run \`agentfs upgrade\`` };
  }
  return { name: 'OS release', severity: 'ok', message: `v${osRelease.VERSION}, schema v${osRelease.SCHEMA_VERSION}` };
}

async function checkMemory(vaultRoot: string): Promise<Check> {
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');
  try {
    const content = await fs.readFile(semanticPath, 'utf8');
    const entries = parseSemanticMemory(content);
    const active = entries.filter((e) => !isSuperseded(e)).length;
    return { name: 'Memory', severity: 'ok', message: `semantic.md readable (${active} active entries)` };
  } catch {
    return { name: 'Memory', severity: 'warn', message: 'semantic.md not found — run `agentfs onboard`' };
  }
}

async function checkInitD(vaultRoot: string): Promise<Check> {
  const initDir = path.join(vaultRoot, '.agentos/init.d');
  try {
    const files = await fs.readdir(initDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) {
      return { name: 'Init scripts', severity: 'warn', message: 'init.d/ exists but contains no .md scripts' };
    }
    return { name: 'Init scripts', severity: 'ok', message: `init.d/ has ${mdFiles.length} script(s)` };
  } catch {
    return { name: 'Init scripts', severity: 'warn', message: 'init.d/ not found — run `agentfs compile`' };
  }
}

async function checkSecurity(vaultRoot: string): Promise<Check> {
  try {
    const result = await readSecurityPolicy(vaultRoot);
    const p = result.policy;
    const denyCount = (p.file_access?.deny_read?.length ?? 0) + (p.file_access?.deny_write?.length ?? 0);
    return { name: 'Security', severity: 'ok', message: `policy.yaml valid (${p.default_mode ?? 'enforce'} mode, ${denyCount} deny rules)` };
  } catch {
    return { name: 'Security', severity: 'warn', message: 'policy.yaml not found — defaults active' };
  }
}

async function checkCompiledOutput(vaultRoot: string): Promise<Check> {
  const claudeMd = path.join(vaultRoot, 'CLAUDE.md');
  try {
    const stat = await fs.stat(claudeMd);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageMins = Math.floor(ageMs / 60000);
    const ageStr = ageMins < 60 ? `${ageMins}m ago` : `${Math.floor(ageMins / 60)}h ago`;
    return { name: 'Compiled output', severity: 'ok', message: `CLAUDE.md present (${ageStr})` };
  } catch {
    return { name: 'Compiled output', severity: 'warn', message: 'CLAUDE.md not found — run `agentfs compile`' };
  }
}

async function checkDrift(vaultRoot: string): Promise<Check> {
  const claudeMd = path.join(vaultRoot, 'CLAUDE.md');
  const manifestPath = path.join(vaultRoot, '.agentos/manifest.yaml');
  try {
    const [claudeStat, manifestStat] = await Promise.all([
      fs.stat(claudeMd),
      fs.stat(manifestPath),
    ]);
    if (manifestStat.mtimeMs > claudeStat.mtimeMs) {
      return { name: 'Drift', severity: 'warn', message: 'manifest.yaml newer than CLAUDE.md — run `agentfs compile`' };
    }
    return { name: 'Drift', severity: 'ok', message: 'no drift detected' };
  } catch {
    return { name: 'Drift', severity: 'ok', message: 'drift check skipped (missing files)' };
  }
}

// ---------------------------------------------------------------------------
// selfcheck command
// ---------------------------------------------------------------------------

/**
 * Entry point for `agentfs selfcheck`.
 */
export async function selfcheckCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const args = flags.args;
  const quick = args.includes('--quick');
  const deep = args.includes('--deep');

  // Run checks
  const checks: Check[] = [];

  checks.push(await checkAgentos(vaultRoot));
  checks.push(await checkManifest(vaultRoot));

  if (!quick) {
    checks.push(await checkOsRelease(vaultRoot));
    checks.push(await checkMemory(vaultRoot));
    checks.push(await checkInitD(vaultRoot));
    checks.push(await checkSecurity(vaultRoot));
    checks.push(await checkCompiledOutput(vaultRoot));
  }

  if (deep) {
    checks.push(await checkDrift(vaultRoot));
  }

  // Determine overall severity
  const hasErrors = checks.some((c) => c.severity === 'error');
  const hasWarnings = checks.some((c) => c.severity === 'warn');
  const health = hasErrors ? 'degraded' : hasWarnings ? 'warning' : 'nominal';

  // Format output
  const icon = (s: Severity) => s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✗';
  let human = `\nAgentFS Selfcheck — ${quick ? 'quick' : deep ? 'deep' : 'standard'}\n${'─'.repeat(50)}\n`;
  for (const check of checks) {
    human += `  ${icon(check.severity)} ${check.name}: ${check.message}\n`;
  }
  human += `${'─'.repeat(50)}\n`;
  human += `  Health: ${health}\n\n`;

  printResult(flags, human, {
    checks,
    health,
    counts: {
      ok: checks.filter((c) => c.severity === 'ok').length,
      warn: checks.filter((c) => c.severity === 'warn').length,
      error: checks.filter((c) => c.severity === 'error').length,
    },
  });

  if (hasErrors) return 2;
  if (hasWarnings) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// status command
// ---------------------------------------------------------------------------

/**
 * Entry point for `agentfs status`.
 * Prints a compact vault health summary.
 */
export async function statusCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;

  // Gather data in parallel
  const [manifest, osRelease, semanticContent, episodicDates, proceduralSkills, securityCheck, driftCheck] =
    await Promise.all([
      readManifest(vaultRoot).catch(() => null),
      readOsRelease(vaultRoot),
      fs.readFile(path.join(vaultRoot, '.agentos/memory/semantic.md'), 'utf8').catch(() => null),
      listEpisodicDates(vaultRoot),
      listProceduralSkills(vaultRoot),
      checkSecurity(vaultRoot),
      checkDrift(vaultRoot),
    ]);

  const vaultName = manifest?.vault?.name ?? 'unknown';
  const profile = manifest?.agentos?.profile ?? 'personal';
  const version = CLI_VERSION;

  // Memory stats
  const semanticEntries = semanticContent ? parseSemanticMemory(semanticContent) : [];
  const activeEntries = semanticEntries.filter((e) => !isSuperseded(e)).length;

  // Compile age
  let compileAge = 'not compiled';
  try {
    const stat = await fs.stat(path.join(vaultRoot, 'CLAUDE.md'));
    const ageMs = Date.now() - stat.mtimeMs;
    const ageMins = Math.floor(ageMs / 60000);
    compileAge = ageMins < 60 ? `${ageMins}m ago` : `${Math.floor(ageMins / 60)}h ago`;
  } catch {
    compileAge = 'not found';
  }

  // Health
  const driftOk = driftCheck.severity === 'ok';
  const health = (activeEntries > 0 && compileAge !== 'not found') ? 'nominal' : 'degraded';

  // Security info
  let securityLine = 'defaults (no policy.yaml)';
  if (securityCheck.severity === 'ok') {
    securityLine = securityCheck.message.replace('policy.yaml valid (', '').replace(/\)$/, '');
  }

  // Build status line
  let human = `\nAgentFS v${version} — vault "${vaultName}" (${profile})\n`;
  human += `├── Kernel:    ${manifest ? '✓ manifest valid' : '✗ manifest not found'}, schema v${osRelease?.SCHEMA_VERSION ?? '?'}\n`;
  human += `├── Memory:    ${activeEntries} semantic, ${episodicDates.length} episodic, ${proceduralSkills.length} procedural\n`;
  human += `├── Security:  ${securityLine}\n`;
  human += `├── Compiled:  CLAUDE.md (${compileAge})\n`;
  human += `├── Drift:     ${driftOk ? 'none detected' : driftCheck.message}\n`;
  human += `└── Health:    ${health}\n\n`;

  printResult(flags, human, {
    vault: { name: vaultName, profile, version },
    memory: { semantic: activeEntries, episodic: episodicDates.length, procedural: proceduralSkills.length },
    compiled: { age: compileAge },
    drift: driftOk,
    health,
  });

  return 0;
}
