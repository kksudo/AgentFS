import fs from 'node:fs/promises';
import path from 'node:path';
import { scanForInjections, readSecurityPolicy } from '../security/parser.js';
import { CliFlags, printResult } from '../utils/cli-flags.js';
import { validateFrontmatter } from '../utils/validate-frontmatter.js';
import { readManifest } from '../compilers/base.js';
import { readOsRelease } from '../generators/os-release.js';
import { CLI_VERSION } from '../utils/version.js';

const DOCTOR_VERSION = CLI_VERSION;

// ---------------------------------------------------------------------------
// Doctor command — Story 12.1
// ---------------------------------------------------------------------------

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Entry point for the `agentfs doctor` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function doctorCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const checks: DoctorCheck[] = [];

  // Check 1: .agentos/ exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos'));
    checks.push({ name: 'AgentFS directory', passed: true, message: '.agentos/ exists' });
  } catch {
    checks.push({ name: 'AgentFS directory', passed: false, message: '.agentos/ not found' });
  }

  // Check 2: manifest.yaml exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos/manifest.yaml'));
    checks.push({ name: 'Manifest', passed: true, message: 'manifest.yaml found' });
  } catch {
    checks.push({ name: 'Manifest', passed: false, message: 'manifest.yaml not found' });
  }

  // Check 3: os-release version check (advisory — missing file is a warning, not a failure)
  const osRelease = await readOsRelease(vaultRoot);
  if (osRelease === null) {
    checks.push({ name: 'OS release', passed: true, message: 'not found (run `agentfs compile` to generate)' });
  } else if (osRelease.VERSION !== DOCTOR_VERSION) {
    checks.push({
      name: 'OS release',
      passed: false,
      message: `Vault was built with AgentFS v${osRelease.VERSION}, current CLI is v${DOCTOR_VERSION} — run \`agentfs compile\` to update`,
    });
  } else {
    checks.push({ name: 'OS release', passed: true, message: `v${osRelease.VERSION} (schema v${osRelease.SCHEMA_VERSION})` });
  }

  // Check 4: init.d/ exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos/init.d'));
    checks.push({ name: 'Init scripts', passed: true, message: 'init.d/ exists' });
  } catch {
    checks.push({ name: 'Init scripts', passed: false, message: 'init.d/ not found' });
  }

  // Check 5: memory directory exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos/memory'));
    checks.push({ name: 'Memory system', passed: true, message: 'memory/ exists' });
  } catch {
    checks.push({ name: 'Memory system', passed: false, message: 'memory/ not found' });
  }

  // Check 5: Security policy (warnings are advisory, not failures)
  const { policy, warnings: policyWarnings } = await readSecurityPolicy(vaultRoot);
  const policyMessage = policyWarnings.length > 0
    ? `Mode: ${policy.default_mode} (advisory: ${policyWarnings[0]})`
    : `Mode: ${policy.default_mode}, ${policy.input_validation.scan_on_read.length} injection patterns`;
  checks.push({ name: 'Security policy', passed: true, message: policyMessage });

  // Check 6: Scan compiled outputs for injection
  try {
    const claudeMd = await fs.readFile(path.join(vaultRoot, 'CLAUDE.md'), 'utf8');
    const injections = scanForInjections(claudeMd, policy);
    checks.push({
      name: 'CLAUDE.md injection scan',
      passed: injections.length === 0,
      message: injections.length === 0 ? 'Clean' : `${injections.length} pattern(s) detected`,
    });
  } catch {
    checks.push({ name: 'CLAUDE.md injection scan', passed: true, message: 'Not compiled yet (skipped)' });
  }

  // Check 7: Frontmatter validation on init.d/ files
  try {
    const manifest = await readManifest(vaultRoot);
    const requiredFields = manifest.frontmatter?.required ?? [];
    const initDir = path.join(vaultRoot, '.agentos', 'init.d');
    const entries = await fs.readdir(initDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));

    let fmErrors = 0;
    let fmWarnings = 0;
    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(initDir, file), 'utf8');
      const result = validateFrontmatter(content, requiredFields);
      fmErrors += result.errors.length;
      fmWarnings += result.warnings.length;
    }

    checks.push({
      name: 'Frontmatter validation',
      passed: fmErrors === 0,
      message: fmErrors === 0
        ? `${mdFiles.length} file(s) checked, ${fmWarnings} warning(s)`
        : `${fmErrors} error(s), ${fmWarnings} warning(s) across ${mdFiles.length} file(s)`,
    });
  } catch {
    checks.push({ name: 'Frontmatter validation', passed: true, message: 'Skipped (init.d/ not found or manifest unreadable)' });
  }

  // Print results
  let human = '\nAgentFS Doctor\n' + '═'.repeat(50) + '\n';
  let failures = 0;
  for (const check of checks) {
    const icon = check.passed ? '✓' : '✗';
    human += `  ${icon} ${check.name}: ${check.message}\n`;
    if (!check.passed) failures++;
  }

  human += '\n';
  if (failures === 0) {
    human += '  All checks passed! Vault is healthy.\n';
  } else {
    human += `  ${failures} check(s) failed. Run \`agentfs init\` to fix.\n`;
  }

  printResult(flags, human, { checks, failures });
  return failures > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Triage command — Story 12.3
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs triage` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function triageCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const inboxDir = path.join(vaultRoot, 'Inbox');

  let files: string[];
  try {
    const entries = await fs.readdir(inboxDir);
    files = entries.filter((f) => f.endsWith('.md'));
  } catch {
    printResult(flags, 'No Inbox/ directory found. Nothing to triage.', { files: [] });
    return 0;
  }

  if (files.length === 0) {
    printResult(flags, 'Inbox is empty. Nothing to triage.', { files: [] });
    return 0;
  }

  let human = '\nInbox Triage\n' + '═'.repeat(50) + '\n';
  const triageResults: { file: string; suggestion: string }[] = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(inboxDir, file), 'utf8');
    const suggestion = suggestFromContent(content, file);
    human += `  📄 ${file}\n     → Suggested: ${suggestion}\n\n`;
    triageResults.push({ file, suggestion });
  }

  human += '  Use `mv` to move files to their suggested locations.\n';
  human += '  (Automatic moving is disabled by design — user must confirm.)\n';

  printResult(flags, human, { triageResults });
  return 0;
}

function suggestFromContent(content: string, filename: string): string {
  const lower = content.toLowerCase();

  if (lower.includes('project') || lower.includes('sprint')) return 'Projects/';
  if (lower.includes('daily') || lower.includes('journal') || lower.includes('standup')) return 'Daily/';
  if (lower.includes('resource') || lower.includes('reference') || lower.includes('documentation')) return 'Resources/';
  if (lower.includes('meeting') || lower.includes('decision')) return 'Decisions/';

  // Check filename patterns
  if (/^\d{4}-\d{2}-\d{2}/.test(filename)) return 'Daily/';

  return 'Resources/ (default)';
}

// ---------------------------------------------------------------------------
// Migrate command — Story 12.2
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs migrate` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function migrateCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;

  // Check if already has .agentos
  try {
    await fs.access(path.join(vaultRoot, '.agentos'));
    printResult(flags, 'This vault already has .agentos/. Use `agentfs doctor` to check health.', { alreadyMigrated: true });
    return 0;
  } catch {
    // Expected — no .agentos yet
  }

  // Analyze existing vault
  let totalFiles = 0;
  let mdFiles = 0;
  let hasGit = false;
  let hasOpenClaw = false;
  let hasClaude = false;

  try {
    const files = await fs.readdir(vaultRoot, { recursive: true });
    for (const file of files) {
      totalFiles++;
      if (String(file).endsWith('.md')) mdFiles++;
    }
  } catch {
    // Can't enumerate
  }

  try { await fs.access(path.join(vaultRoot, '.git')); hasGit = true; } catch { /* */ }
  try { await fs.access(path.join(vaultRoot, '.openclaw')); hasOpenClaw = true; } catch { /* */ }
  try { await fs.access(path.join(vaultRoot, 'CLAUDE.md')); hasClaude = true; } catch { /* */ }

  let human = '\nMigration Analysis\n' + '═'.repeat(50) + '\n';
  human += `  Total files: ${totalFiles}\n`;
  human += `  Markdown files: ${mdFiles}\n`;
  human += `  Git repo: ${hasGit ? 'yes' : 'no'}\n`;
  human += `  OpenClaw config: ${hasOpenClaw ? 'yes' : 'no'}\n`;
  human += `  CLAUDE.md: ${hasClaude ? 'yes' : 'no'}\n\n`;
  human += '  To migrate, run: agentfs init\n';
  human += '  This will create .agentos/ without modifying existing files.\n';

  printResult(flags, human, {
    stats: { totalFiles, mdFiles, hasGit, hasOpenClaw, hasClaude }
  });

  return 0;
}
