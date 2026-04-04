/**
 * `agentfs doctor` command — Story 12.1.
 * `agentfs migrate` command — Story 12.2.
 * `agentfs triage` command — Story 12.3.
 *
 * @module commands/doctor
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { scanForInjections, readSecurityPolicy } from '../security/parser.js';

function print(line: string): void {
  process.stdout.write(line + '\n');
}

function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Doctor command — Story 12.1
// ---------------------------------------------------------------------------

interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
}

export async function doctorCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
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

  // Check 3: init.d/ exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos/init.d'));
    checks.push({ name: 'Init scripts', passed: true, message: 'init.d/ exists' });
  } catch {
    checks.push({ name: 'Init scripts', passed: false, message: 'init.d/ not found' });
  }

  // Check 4: memory directory exists
  try {
    await fs.access(path.join(vaultRoot, '.agentos/memory'));
    checks.push({ name: 'Memory system', passed: true, message: 'memory/ exists' });
  } catch {
    checks.push({ name: 'Memory system', passed: false, message: 'memory/ not found' });
  }

  // Check 5: Security policy
  const policy = await readSecurityPolicy(vaultRoot);
  checks.push({
    name: 'Security policy',
    passed: true,
    message: `Mode: ${policy.default_mode}, ${policy.input_validation.scan_on_read.length} injection patterns`,
  });

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

  // Print results
  print('');
  print('AgentFS Doctor');
  print('═'.repeat(50));

  let failures = 0;
  for (const check of checks) {
    const icon = check.passed ? '✓' : '✗';
    print(`  ${icon} ${check.name}: ${check.message}`);
    if (!check.passed) failures++;
  }

  print('');
  if (failures === 0) {
    print('  All checks passed! Vault is healthy.');
  } else {
    print(`  ${failures} check(s) failed. Run \`agentfs init\` to fix.`);
  }
  print('');

  return failures > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Triage command — Story 12.3
// ---------------------------------------------------------------------------

export async function triageCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const inboxDir = path.join(vaultRoot, 'Inbox');

  let files: string[];
  try {
    const entries = await fs.readdir(inboxDir);
    files = entries.filter((f) => f.endsWith('.md'));
  } catch {
    print('No Inbox/ directory found. Nothing to triage.');
    return 0;
  }

  if (files.length === 0) {
    print('Inbox is empty. Nothing to triage.');
    return 0;
  }

  print('');
  print('Inbox Triage');
  print('═'.repeat(50));

  for (const file of files) {
    const content = await fs.readFile(path.join(inboxDir, file), 'utf8');
    const suggestion = suggestFromContent(content, file);
    print(`  📄 ${file}`);
    print(`     → Suggested: ${suggestion}`);
    print('');
  }

  print('  Use `mv` to move files to their suggested locations.');
  print('  (Automatic moving is disabled by design — user must confirm.)');
  print('');

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

export async function migrateCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();

  // Check if already has .agentos
  try {
    await fs.access(path.join(vaultRoot, '.agentos'));
    print('This vault already has .agentos/. Use `agentfs doctor` to check health.');
    return 0;
  } catch {
    // Expected — no .agentos yet
  }

  // Analyze existing vault
  print('');
  print('Migration Analysis');
  print('═'.repeat(50));

  let totalFiles = 0;
  let mdFiles = 0;
  let hasGit = false;
  let hasOmc = false;
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
  try { await fs.access(path.join(vaultRoot, '.omc')); hasOmc = true; } catch { /* */ }
  try { await fs.access(path.join(vaultRoot, 'CLAUDE.md')); hasClaude = true; } catch { /* */ }

  print(`  Total files: ${totalFiles}`);
  print(`  Markdown files: ${mdFiles}`);
  print(`  Git repo: ${hasGit ? 'yes' : 'no'}`);
  print(`  OpenClaw config: ${hasOmc ? 'yes' : 'no'}`);
  print(`  CLAUDE.md: ${hasClaude ? 'yes' : 'no'}`);
  print('');
  print('  To migrate, run: agentfs init');
  print('  This will create .agentos/ without modifying existing files.');
  print('');

  return 0;
}
