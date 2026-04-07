/**
 * Security policy parser — reads policy.yaml into SecurityPolicy.
 *
 * Story 7.1: Parse `.agentos/security/policy.yaml` into a structured
 * SecurityPolicy object that the compile pipeline can use to generate
 * native enforcement rules.
 *
 * @module security/parser
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SecurityPolicy } from '../types/index.js';

const POLICY_PATH = '.agentos/security/policy.yaml';

/**
 * Default security policy used when no policy.yaml exists.
 */
export const DEFAULT_POLICY: SecurityPolicy = {
  version: '1.0',
  default_mode: 'complain',
  file_access: {
    default: 'rw',
    allow_write: ['**/*.md', '**/*.yaml', '**/*.json'],
    ask_write: ['.agentos/**', '.claude/**'],
    deny_read: ['.agentos/secrets/**', '.env', '**/*.pem', '**/*.key'],
    deny_write: ['.git/**', 'node_modules/**'],
  },
  input_validation: {
    enabled: true,
    scan_on_read: [
      { pattern: 'ignore previous instructions' },
      { pattern: 'system prompt override' },
      { pattern: 'you are now' },
    ],
    action: 'warn',
    quarantine_path: '.agentos/security/quarantine/',
  },
  network: {
    deny_exfil_patterns: [
      { regex: '(api_key|secret|password|token)\\s*[:=]' },
    ],
    allowed_domains: [],
  },
  commands: {
    blocked: ['rm -rf /', 'curl | sh', 'wget | sh'],
    ask_before: ['npm install', 'pip install', 'brew install'],
  },
};

/**
 * Result of reading a security policy, including any advisory warnings.
 */
export interface SecurityPolicyResult {
  policy: SecurityPolicy;
  warnings: string[];
}

/**
 * Read and parse the security policy from a vault.
 *
 * @param vaultRoot - Absolute path to vault root
 * @returns Parsed SecurityPolicy plus any advisory warnings
 */
export async function readSecurityPolicy(
  vaultRoot: string,
): Promise<SecurityPolicyResult> {
  const policyPath = path.join(vaultRoot, POLICY_PATH);

  try {
    const content = await fs.readFile(policyPath, 'utf8');
    const parsed = yaml.load(content) as Partial<SecurityPolicy>;
    const policy = mergeWithDefaults(parsed);
    const warnings = validateSecurityPolicy(policy);
    return { policy, warnings };
  } catch {
    return {
      policy: DEFAULT_POLICY,
      warnings: [
        'policy.yaml not found — using defaults, security is advisory only',
      ],
    };
  }
}

/**
 * Write a security policy to disk.
 *
 * @param vaultRoot - Absolute path to vault root
 * @param policy    - SecurityPolicy to persist
 */
export async function writeSecurityPolicy(
  vaultRoot: string,
  policy: SecurityPolicy,
): Promise<void> {
  const policyPath = path.join(vaultRoot, POLICY_PATH);
  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  const content = yaml.dump(policy, { lineWidth: 120 });
  await fs.writeFile(policyPath, content, 'utf8');
}

/**
 * Merge a partial policy with defaults.
 */
function mergeWithDefaults(partial: Partial<SecurityPolicy>): SecurityPolicy {
  return {
    version: partial.version ?? DEFAULT_POLICY.version,
    default_mode: partial.default_mode ?? DEFAULT_POLICY.default_mode,
    file_access: {
      ...DEFAULT_POLICY.file_access,
      ...partial.file_access,
    },
    input_validation: {
      ...DEFAULT_POLICY.input_validation,
      ...partial.input_validation,
    },
    network: {
      ...DEFAULT_POLICY.network,
      ...partial.network,
    },
    commands: {
      ...DEFAULT_POLICY.commands,
      ...partial.commands,
    },
  };
}

/**
 * Validate a security policy and return advisory warnings for any issues found.
 *
 * @param policy - SecurityPolicy to validate
 * @returns Array of warning strings (empty means policy is valid)
 */
export function validateSecurityPolicy(policy: SecurityPolicy): string[] {
  const warnings: string[] = [];

  // Check deny_read has at least secrets patterns
  const hasSecretsPattern = policy.file_access.deny_read.some(
    (p) => p.includes('secret') || p.includes('.env') || p.includes('.pem') || p.includes('.key'),
  );
  if (!hasSecretsPattern) {
    warnings.push('deny_read does not include secrets patterns — sensitive files may be readable');
  }

  // Check deny_write has at least manifest/policy patterns
  const hasManifestOrPolicyPattern = policy.file_access.deny_write.some(
    (p) => p.includes('.git') || p.includes('manifest') || p.includes('policy'),
  );
  if (!hasManifestOrPolicyPattern) {
    warnings.push('deny_write does not include manifest/policy patterns — kernel files may be writable');
  }

  // Check default_mode is a valid SecurityMode
  const validModes = ['enforce', 'complain', 'disabled'] as const;
  if (!validModes.includes(policy.default_mode as (typeof validModes)[number])) {
    warnings.push(`default_mode "${policy.default_mode}" is not valid — must be one of: ${validModes.join(', ')}`);
  }

  return warnings;
}

/**
 * Validate content against input validation patterns.
 *
 * Story 7.3: Scans content for prompt injection patterns and returns matches.
 *
 * @param content - Text to scan
 * @param policy  - Security policy with patterns
 * @returns Array of matched pattern strings
 */
export function scanForInjections(
  content: string,
  policy: SecurityPolicy,
): string[] {
  if (!policy.input_validation.enabled) return [];

  const lower = content.toLowerCase();
  return policy.input_validation.scan_on_read
    .filter((p) => lower.includes(p.pattern.toLowerCase()))
    .map((p) => p.pattern);
}

/**
 * Check if a command is blocked by policy.
 *
 * @param command - Command string to check
 * @param policy  - Security policy
 * @returns 'blocked' | 'ask' | 'allowed'
 */
export function checkCommand(
  command: string,
  policy: SecurityPolicy,
): 'blocked' | 'ask' | 'allowed' {
  const lower = command.toLowerCase();
  
  if (policy.commands.blocked.some((b) => lower.includes(b.toLowerCase()))) {
    return 'blocked';
  }
  
  if (policy.commands.ask_before.some((a) => lower.startsWith(a.toLowerCase()))) {
    return 'ask';
  }

  return 'allowed';
}
