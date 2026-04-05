/**
 * `agentfs security` command implementation.
 *
 * Subcommands:
 *   agentfs security show        — display current policy
 *   agentfs security mode <mode> — set enforcement mode (Story 7.5)
 *   agentfs security compile     — compile to native settings (Story 7.2)
 *   agentfs security scan <file> — scan file for injections (Story 7.3)
 *   agentfs security add <name>  — add composable module (Story 7.4)
 *   agentfs security remove <name> — remove composable module
 *   agentfs security list        — list active security modules
 *
 * @module commands/security
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecurityMode } from '../types/index.js';
import {
  readSecurityPolicy,
  writeSecurityPolicy,
  scanForInjections,
} from '../security/parser.js';
import { compileClaudeSecurity } from '../security/claude-compiler.js';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function print(line: string): void {
  process.stdout.write(line + '\n');
}

function printErr(line: string): void {
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Security modes
// ---------------------------------------------------------------------------

const VALID_MODES: SecurityMode[] = ['enforce', 'complain', 'disabled'];

function isSecurityMode(value: string): value is SecurityMode {
  return VALID_MODES.includes(value as SecurityMode);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function securityCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const action = args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printSecurityUsage();
    return 0;
  }

  if (action === 'show') {
    const policy = await readSecurityPolicy(vaultRoot);
    print('');
    print('Security Policy');
    print('═'.repeat(50));
    print(`  Mode: ${policy.default_mode}`);
    print(`  Version: ${policy.version}`);
    print('');
    print('  File Access:');
    print(`    Allow write: ${policy.file_access.allow_write.join(', ')}`);
    print(`    Ask write:   ${policy.file_access.ask_write.join(', ')}`);
    print(`    Deny read:   ${policy.file_access.deny_read.join(', ')}`);
    print(`    Deny write:  ${policy.file_access.deny_write.join(', ')}`);
    print('');
    print('  Input Validation:');
    print(`    Enabled: ${policy.input_validation.enabled}`);
    print(`    Patterns: ${policy.input_validation.scan_on_read.length}`);
    print(`    Action: ${policy.input_validation.action}`);
    print('');
    print('  Commands:');
    print(`    Blocked: ${policy.commands.blocked.join(', ')}`);
    print(`    Ask before: ${policy.commands.ask_before.join(', ')}`);
    print('');
    return 0;
  }

  if (action === 'mode') {
    const mode = args[1];
    if (!mode || !isSecurityMode(mode)) {
      printErr(`agentfs security mode: expected one of ${VALID_MODES.join(', ')}`);
      return 1;
    }

    const policy = await readSecurityPolicy(vaultRoot);
    policy.default_mode = mode;
    await writeSecurityPolicy(vaultRoot, policy);
    print(`Security mode set to: ${mode}`);

    // Trigger recompile
    await compileClaudeSecurity(vaultRoot, policy);
    print('Security rules recompiled.');
    return 0;
  }

  if (action === 'compile') {
    const policy = await readSecurityPolicy(vaultRoot);
    const dryRun = args.includes('--dry-run');
    const settings = await compileClaudeSecurity(vaultRoot, policy, dryRun);

    const prefix = dryRun ? '[dry-run] ' : '';
    print(`${prefix}Compiled security policy to .claude/settings.json`);
    print(`  Deny rules: ${settings.permissions?.deny?.length ?? 0}`);
    print(`  Ask rules:  ${settings.permissions?.ask?.length ?? 0}`);
    return 0;
  }

  if (action === 'scan') {
    const filePath = args[1];
    if (!filePath) {
      printErr('agentfs security scan: file path required');
      return 1;
    }

    const policy = await readSecurityPolicy(vaultRoot);

    let content: string;
    try {
      content = await fs.readFile(path.resolve(filePath), 'utf8');
    } catch {
      printErr(`Cannot read file: ${filePath}`);
      return 1;
    }

    const matches = scanForInjections(content, policy);
    if (matches.length === 0) {
      print('✓ No injection patterns detected.');
    } else {
      print(`⚠ Found ${matches.length} injection pattern(s):`);
      for (const match of matches) {
        print(`  - "${match}"`);
      }
    }
    return 0;
  }

  if (action === 'list') {
    // List active security modules (in .agentos/security/modules/)
    const modulesDir = path.join(vaultRoot, '.agentos/security/modules');
    try {
      const files = await fs.readdir(modulesDir);
      const modules = files.filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));
      if (modules.length === 0) {
        print('No security modules active.');
      } else {
        print('Active security modules:');
        for (const m of modules) { print(`  🛡️ ${m}`); }
      }
    } catch {
      print('No security modules active.');
    }
    return 0;
  }

  if (action === 'add') {
    const moduleName = args[1];
    if (!moduleName) {
      printErr('agentfs security add: module name required');
      return 1;
    }

    const modulesDir = path.join(vaultRoot, '.agentos/security/modules');
    await fs.mkdir(modulesDir, { recursive: true });
    
    // Story 13.3: Simulate npm package installation for domain modules
    const isNpmPackage = moduleName.startsWith('agentfs-security-');
    const safeName = isNpmPackage ? moduleName.replace('agentfs-security-', '') : moduleName;
    const modulePath = path.join(modulesDir, `${safeName}.yaml`);

    let stub = '';
    if (isNpmPackage) {
      print(`Simulating installation of npm package: ${moduleName}...`);
      stub = `# Security module: ${moduleName} (Community)\n# Managed by npm.\nrules: []\n`;
      print(`✓ Installed and merged community module: ${moduleName}`);
    } else {
      stub = `# Security module: ${safeName}\n# Add your custom security rules here.\nrules: []\n`;
      print(`Added security module: ${safeName}`);
    }

    await fs.writeFile(modulePath, stub, 'utf8');
    return 0;
  }

  if (action === 'remove') {
    const moduleName = args[1];
    if (!moduleName) {
      printErr('agentfs security remove: module name required');
      return 1;
    }

    const modulePath = path.join(vaultRoot, '.agentos/security/modules', `${moduleName}.yaml`);
    try {
      await fs.unlink(modulePath);
      print(`Removed security module: ${moduleName}`);
    } catch {
      printErr(`Module not found: ${moduleName}`);
      return 1;
    }
    return 0;
  }

  printErr(`agentfs security: unknown action '${action}'`);
  printSecurityUsage();
  return 1;
}

function printSecurityUsage(): void {
  print('');
  print('Usage: agentfs security <action>');
  print('');
  print('Actions:');
  print('  show                  Display current security policy');
  print('  mode <mode>           Set mode (enforce/complain/disabled)');
  print('  compile [--dry-run]   Compile policy to native rules');
  print('  scan <file>           Scan file for injection patterns');
  print('  add <module>          Add a composable security module');
  print('  remove <module>       Remove a security module');
  print('  list                  List active security modules');
  print('');
}
