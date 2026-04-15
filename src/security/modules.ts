/**
 * Built-in security module definitions and merge logic.
 *
 * Story 13/14: Named composable security modules that can be layered on top
 * of a base SecurityPolicy via `agentfs security add <module>`.
 *
 * @module security/modules
 */

import type {
  SecurityPolicy,
  FileAccessPolicy,
  InputValidationPolicy,
  NetworkPolicy,
  CommandPolicy,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Deep-partial type for composable module definitions
// ---------------------------------------------------------------------------

/**
 * A module may override any subset of the policy's sub-sections,
 * and within each sub-section only the array fields it cares about.
 */
export interface SecurityModule {
  file_access?: Partial<FileAccessPolicy>;
  input_validation?: Partial<InputValidationPolicy>;
  network?: Partial<NetworkPolicy>;
  commands?: Partial<CommandPolicy>;
}

// ---------------------------------------------------------------------------
// Built-in module definitions
// ---------------------------------------------------------------------------

export const BUILTIN_MODULES: Record<string, SecurityModule> = {
  crypto: {
    file_access: {
      deny_read: [
        '**/*.pem',
        '**/*.key',
        '**/*.p12',
        '**/*.pfx',
        '**/*.crt',
        '**/*.cer',
        '**/.gnupg/**',
        '**/.ssh/id_*',
      ],
      deny_write: ['**/*.pem', '**/*.key'],
    },
    network: {
      deny_exfil_patterns: [
        { regex: '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' },
        { regex: 'PRIVATE KEY' },
      ],
    },
  },

  web: {
    file_access: {
      deny_read: [
        '**/*.cookie',
        '**/cookies.sqlite',
        '**/.netrc',
        '**/credentials.json',
      ],
    },
    network: {
      deny_exfil_patterns: [
        { regex: '(Authorization|Cookie|Set-Cookie):\\s*Bearer\\s+\\S+' },
        { regex: 'access_token\\s*[:=]\\s*["\']?[A-Za-z0-9._-]{20,}' },
      ],
    },
    input_validation: {
      scan_on_read: [
        { pattern: 'document.cookie' },
        { pattern: 'localStorage.getItem' },
        { pattern: 'sessionStorage' },
      ],
    },
  },

  infra: {
    file_access: {
      deny_read: [
        '**/*.tfstate',
        '**/*.tfstate.backup',
        '**/kubeconfig',
        '**/.kube/config',
        '**/terraform.tfvars',
      ],
      deny_write: ['**/*.tfstate'],
    },
    input_validation: {
      scan_on_read: [
        { pattern: 'kubectl exec' },
        { pattern: 'terraform destroy' },
      ],
    },
    commands: {
      blocked: [
        'kubectl delete namespace',
        'terraform destroy -auto-approve',
      ],
      ask_before: [
        'terraform apply',
        'kubectl apply',
        'kubectl delete',
      ],
    },
  },

  cloud: {
    file_access: {
      deny_read: [
        '**/.aws/credentials',
        '**/.azure/credentials',
        '**/.gcloud/credentials.db',
        '**/service-account*.json',
      ],
    },
    network: {
      deny_exfil_patterns: [
        { regex: 'AKIA[0-9A-Z]{16}' },
        { regex: '(aws_access_key_id|aws_secret_access_key)\\s*[:=]' },
      ],
    },
  },

  'ci-cd': {
    file_access: {
      deny_read: [
        '**/.github/secrets/**',
        '**/.env.ci',
        '**/deploy_key*',
      ],
      deny_write: ['**/.github/workflows/**'],
    },
    network: {
      deny_exfil_patterns: [
        { regex: 'GITHUB_TOKEN\\s*[:=]\\s*[A-Za-z0-9_-]{20,}' },
        { regex: 'CI_JOB_TOKEN' },
      ],
    },
    commands: {
      ask_before: ['gh release create', 'docker push', 'npm publish'],
    },
  },
};

export const BUILTIN_MODULE_NAMES: string[] = Object.keys(BUILTIN_MODULES);

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Check if a name is a known built-in module.
 */
export function isBuiltinModule(name: string): name is keyof typeof BUILTIN_MODULES {
  return name in BUILTIN_MODULES;
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Merge an array of security modules into a base SecurityPolicy.
 * Arrays are deduplicated and merged. Scalar values take last-wins semantics.
 */
export function mergeModules(
  base: SecurityPolicy,
  modules: SecurityModule[],
): SecurityPolicy {
  const result = JSON.parse(JSON.stringify(base)) as SecurityPolicy;

  for (const mod of modules) {
    if (mod.file_access) {
      for (const key of ['deny_read', 'deny_write', 'allow_write', 'ask_write'] as const) {
        const arr = mod.file_access[key];
        if (arr) {
          result.file_access[key] = dedupe([...result.file_access[key], ...arr]);
        }
      }
    }

    if (mod.input_validation?.scan_on_read) {
      result.input_validation.scan_on_read = dedupe([
        ...result.input_validation.scan_on_read.map((p) => p.pattern),
        ...mod.input_validation.scan_on_read.map((p) => p.pattern),
      ]).map((pattern) => ({ pattern }));
    }

    if (mod.network?.deny_exfil_patterns) {
      result.network.deny_exfil_patterns = dedupe([
        ...result.network.deny_exfil_patterns.map((p) => p.regex),
        ...mod.network.deny_exfil_patterns.map((p) => p.regex),
      ]).map((regex) => ({ regex }));
    }

    if (mod.commands) {
      if (mod.commands.blocked) {
        result.commands.blocked = dedupe([...result.commands.blocked, ...mod.commands.blocked]);
      }
      if (mod.commands.ask_before) {
        result.commands.ask_before = dedupe([
          ...result.commands.ask_before,
          ...mod.commands.ask_before,
        ]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
