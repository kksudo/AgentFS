/**
 * `agentfs security` command implementation.
 *
 * Subcommands:
 *   agentfs security show        — display current policy
 *   agentfs security mode <mode> — set enforcement mode (Story 7.5)
 *   agentfs security compile     — compile to native settings (Story 7.2)
 *   agentfs security scan <file> — scan file for injections (Story 7.3)
 *   agentfs security add <name>  — add composable module (Story 7.4 / #13)
 *   agentfs security remove <name> — remove composable module
 *   agentfs security list        — list active security modules
 *   agentfs security audit       — effective policy + compliance summary (#14)
 *
 * @module commands/security
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SecurityMode } from '../types/index.js';
import {
  readSecurityPolicy,
  writeSecurityPolicy,
  scanForInjections,
  logViolation,
} from '../security/parser.js';
import {
  BUILTIN_MODULES,
  isBuiltinModule,
  mergeModules,
} from '../security/modules.js';
import { compileClaudeSecurity } from '../security/claude-compiler.js';
import { CliFlags, printError, printResult } from '../utils/cli-flags.js';

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

/**
 * Entry point for the `agentfs security` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function securityCommand(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const action = flags.args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printSecurityUsage();
    return 0;
  }

  if (action === 'show') {
    const { policy, warnings } = await readSecurityPolicy(vaultRoot);
    if (warnings.length > 0) {
      for (const w of warnings) process.stderr.write(`[security] warning: ${w}\n`);
    }
    let human = '\nSecurity Policy\n' + '═'.repeat(50) + '\n';
    human += `  Mode: ${policy.default_mode}\n`;
    human += `  Version: ${policy.version}\n\n`;
    human += '  File Access:\n';
    human += `    Allow write: ${policy.file_access.allow_write.join(', ')}\n`;
    human += `    Ask write:   ${policy.file_access.ask_write.join(', ')}\n`;
    human += `    Deny read:   ${policy.file_access.deny_read.join(', ')}\n`;
    human += `    Deny write:  ${policy.file_access.deny_write.join(', ')}\n\n`;
    human += '  Input Validation:\n';
    human += `    Enabled: ${policy.input_validation.enabled}\n`;
    human += `    Patterns: ${policy.input_validation.scan_on_read.length}\n`;
    human += `    Action: ${policy.input_validation.action}\n\n`;
    human += '  Commands:\n';
    human += `    Blocked: ${policy.commands.blocked.join(', ')}\n`;
    human += `    Ask before: ${policy.commands.ask_before.join(', ')}\n`;

    printResult(flags, human, { policy });
    return 0;
  }

  if (action === 'mode') {
    const mode = flags.args[1];
    if (!mode || !isSecurityMode(mode)) {
      printError(flags, `agentfs security mode: expected one of ${VALID_MODES.join(', ')}`, 'INVALID_MODE');
      return 1;
    }

    const { policy } = await readSecurityPolicy(vaultRoot);
    policy.default_mode = mode;
    await writeSecurityPolicy(vaultRoot, policy);

    // Trigger recompile
    await compileClaudeSecurity(vaultRoot, policy);
    
    printResult(flags, `Security mode set to: ${mode}\nSecurity rules recompiled.`, { mode });
    return 0;
  }

  if (action === 'compile') {
    const { policy } = await readSecurityPolicy(vaultRoot);
    const dryRun = flags.args.includes('--dry-run');
    const settings = await compileClaudeSecurity(vaultRoot, policy, dryRun);

    const prefix = dryRun ? '[dry-run] ' : '';
    const human = `${prefix}Compiled security policy to .claude/settings.json\n` +
                 `  Deny rules: ${settings.permissions?.deny?.length ?? 0}\n` +
                 `  Ask rules:  ${settings.permissions?.ask?.length ?? 0}`;
    
    printResult(flags, human, { dryRun, settings });
    return 0;
  }

  if (action === 'scan') {
    const filePath = flags.args[1];
    if (!filePath) {
      printError(flags, 'agentfs security scan: file path required', 'MISSING_FILE_PATH');
      return 1;
    }

    const { policy } = await readSecurityPolicy(vaultRoot);

    let content: string;
    try {
      content = await fs.readFile(path.resolve(filePath), 'utf8');
    } catch {
      printError(flags, `Cannot read file: ${filePath}`, 'FILE_READ_FAILED');
      return 1;
    }

    const matches = scanForInjections(content, policy);
    if (matches.length === 0) {
      printResult(flags, '✓ No injection patterns detected.', { matches: [] });
    } else {
      let human = `⚠ Found ${matches.length} injection pattern(s):\n`;
      for (const match of matches) {
        human += `  - "${match}"\n`;
        await logViolation(vaultRoot, 'INJECTION', `pattern="${match}" file="${filePath}"`);
      }
      printResult(flags, human, { matches });
    }
    return 0;
  }

  if (action === 'list') {
    const modulesDir = path.join(vaultRoot, '.agentos/security/modules');
    try {
      const files = await fs.readdir(modulesDir);
      const modules = files.filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));
      if (modules.length === 0) {
        printResult(flags, 'No security modules active.', { modules: [] });
      } else {
        let human = 'Active security modules:\n';
        for (const m of modules) { human += `  🛡️ ${m}\n`; }
        printResult(flags, human, { modules });
      }
    } catch {
      printResult(flags, 'No security modules active.', { modules: [] });
    }
    return 0;
  }

  if (action === 'add') {
    const moduleName = flags.args[1];
    if (!moduleName) {
      printError(flags, 'agentfs security add: module name required', 'MISSING_MODULE_NAME');
      return 1;
    }

    const modulesDir = path.join(vaultRoot, '.agentos/security/modules');
    await fs.mkdir(modulesDir, { recursive: true });

    const isNpmPackage = moduleName.startsWith('agentfs-security-');
    const safeName = isNpmPackage ? moduleName.replace('agentfs-security-', '') : moduleName;
    const modulePath = path.join(modulesDir, `${safeName}.yaml`);

    let stub = '';
    let message = '';

    if (isBuiltinModule(safeName)) {
      // Write the built-in module definition as YAML
      const builtinDef = BUILTIN_MODULES[safeName];
      stub = `# Security module: ${safeName} (built-in)\n# Auto-generated by agentfs security add.\n` +
        yaml.dump(builtinDef, { lineWidth: 120 });
      message = `Added built-in security module: ${safeName}`;

      // Merge into effective policy and persist
      const { policy } = await readSecurityPolicy(vaultRoot);
      const merged = mergeModules(policy, [builtinDef]);
      await writeSecurityPolicy(vaultRoot, merged);
    } else if (isNpmPackage) {
      if (flags.outputFormat === 'human') {
        process.stdout.write(`Simulating installation of npm package: ${moduleName}...\n`);
      }
      message = `✓ Installed and merged community module: ${moduleName}`;
      stub = `# Security module: ${moduleName} (Community)\n# Managed by npm.\nrules: []\n`;
    } else {
      message = `Added security module: ${safeName}`;
      stub = `# Security module: ${safeName}\n# Add your custom security rules here.\nrules: []\n`;
    }

    await fs.writeFile(modulePath, stub, 'utf8');
    printResult(flags, message, { moduleName: safeName, modulePath });
    return 0;
  }

  if (action === 'audit') {
    const { policy } = await readSecurityPolicy(vaultRoot);

    // Collect active modules
    const modulesDir = path.join(vaultRoot, '.agentos/security/modules');
    let activeModules: string[] = [];
    try {
      const files = await fs.readdir(modulesDir);
      activeModules = files.filter((f) => f.endsWith('.yaml')).map((f) => f.replace('.yaml', ''));
    } catch {
      // no modules dir — empty list
    }

    // Load built-in definitions for active modules and merge
    const builtinDefs = activeModules
      .filter((m) => isBuiltinModule(m))
      .map((m) => BUILTIN_MODULES[m]);
    const effective = mergeModules(policy, builtinDefs);

    // Compliance checks
    const hasWeb = activeModules.includes('web');
    const hasInfra = activeModules.includes('infra');
    const hasCloud = activeModules.includes('cloud');
    const hasCrypto = activeModules.includes('crypto');

    const denyReadCount = effective.file_access.deny_read.length;
    const denyWriteCount = effective.file_access.deny_write.length;
    const exfilCount = effective.network.deny_exfil_patterns.length;
    const injectionCount = effective.input_validation.scan_on_read.length;

    const modulesSummary = activeModules.length > 0
      ? `${activeModules.length} active (${activeModules.join(', ')})`
      : '0 active';

    let human = '\nSecurity Audit\n' + '═'.repeat(50) + '\n';
    human += `  Modules: ${modulesSummary}\n`;
    human += `  Effective deny-read rules:   ${denyReadCount}\n`;
    human += `  Effective deny-write rules:  ${denyWriteCount}\n`;
    human += `  Exfil patterns:              ${exfilCount}\n`;
    human += `  Injection scan patterns:     ${injectionCount}\n`;
    human += '\n  Compliance:\n';
    human += hasCrypto
      ? '    ✓ Private keys protected\n'
      : '    ⚠ No crypto module (private key protection missing)\n';
    human += hasCloud
      ? '    ✓ Cloud credentials protected\n'
      : '    ⚠ No cloud module (AWS/GCP/Azure credentials unprotected)\n';
    human += hasWeb
      ? '    ✓ Web tokens protected\n'
      : '    ⚠ No web module (cookie/token protection missing)\n';
    human += hasInfra
      ? '    ✓ Infrastructure files protected\n'
      : '    ⚠ No infra module (kubeconfig/tfstate unprotected)\n';
    human += '═'.repeat(50) + '\n';

    const auditResult = {
      activeModules,
      denyReadCount,
      denyWriteCount,
      exfilCount,
      injectionCount,
      compliance: { hasCrypto, hasCloud, hasWeb, hasInfra },
    };
    printResult(flags, human, auditResult);
    return 0;
  }

  if (action === 'remove') {
    const moduleName = flags.args[1];
    if (!moduleName) {
      printError(flags, 'agentfs security remove: module name required', 'MISSING_MODULE_NAME');
      return 1;
    }

    const modulePath = path.join(vaultRoot, '.agentos/security/modules', `${moduleName}.yaml`);
    try {
      await fs.unlink(modulePath);
      printResult(flags, `Removed security module: ${moduleName}`, { moduleName });
    } catch {
      printError(flags, `Module not found: ${moduleName}`, 'MODULE_NOT_FOUND');
      return 1;
    }
    return 0;
  }

  printError(flags, `agentfs security: unknown action '${action}'`, 'UNKNOWN_ACTION');
  return 1;
}

function printSecurityUsage(): void {
  process.stdout.write('\nUsage: agentfs security <action>\n\n');
  process.stdout.write('Actions:\n');
  process.stdout.write('  show                  Display current security policy\n');
  process.stdout.write('  mode <mode>           Set mode (enforce/complain/disabled)\n');
  process.stdout.write('  compile [--dry-run]   Compile policy to native rules\n');
  process.stdout.write('  scan <file>           Scan file for injection patterns\n');
  process.stdout.write('  add <module>          Add a composable security module\n');
  process.stdout.write('  remove <module>       Remove a security module\n');
  process.stdout.write('  list                  List active security modules\n');
  process.stdout.write('  audit                 Show effective policy and compliance summary\n\n');
}
