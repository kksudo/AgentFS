/**
 * Hooks runner — executes lifecycle hook scripts defined in manifest.yaml.
 *
 * Hook scripts are shell commands listed under `hooks.<event>` in the manifest.
 * Scripts run sequentially; failure of one does not block subsequent scripts.
 *
 * @module hooks/runner
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readManifest } from '../compilers/base.js';

const execAsync = promisify(exec);

/** Default timeout for hook scripts (10 seconds). */
const HOOK_TIMEOUT_MS = 10_000;

export interface HookEvent {
  name: string; // 'pre-compile' | 'post-compile' | 'on-boot' | etc.
  context: Record<string, unknown>;
}

export interface HookResult {
  event: string;
  scripts: string[];
  results: { script: string; success: boolean; output?: string }[];
}

/**
 * Run all hook scripts registered for the given event.
 *
 * Reads hooks config from manifest.yaml `hooks` section.
 * If no hooks are configured for the event, returns empty results (not an error).
 *
 * @param vaultRoot - Root directory of the vault
 * @param event - Hook event to fire
 * @returns Results for each script (success/failure + output)
 */
export async function runHooks(vaultRoot: string, event: HookEvent): Promise<HookResult> {
  const emptyResult: HookResult = { event: event.name, scripts: [], results: [] };

  // Read manifest — if it fails (vault not initialised), silently return empty.
  let manifest;
  try {
    manifest = await readManifest(vaultRoot);
  } catch {
    return emptyResult;
  }

  const hooks = manifest.hooks;
  if (!hooks) return emptyResult;

  const scripts = hooks[event.name];
  if (!scripts || scripts.length === 0) return emptyResult;

  const hooksDir = path.join(vaultRoot, '.agentos', 'hooks');
  const scriptResults: HookResult['results'] = [];

  for (const script of scripts) {
    const scriptPath = path.resolve(hooksDir, script);

    // Guard against path traversal — script must stay inside .agentos/hooks/.
    if (!scriptPath.startsWith(hooksDir + path.sep) && scriptPath !== hooksDir) {
      scriptResults.push({ script, success: false, output: 'Rejected: path traversal outside .agentos/hooks/' });
      continue;
    }

    try {
      const { stdout, stderr } = await execAsync(scriptPath, {
        cwd: vaultRoot,
        timeout: HOOK_TIMEOUT_MS,
        env: {
          ...process.env,
          AGENTFS_VAULT_ROOT: vaultRoot,
          AGENTFS_HOOK_EVENT: event.name,
        },
      });
      const output = (stdout + stderr).trim();
      scriptResults.push({ script, success: true, output: output || undefined });
    } catch (err) {
      const output = err instanceof Error ? err.message : String(err);
      scriptResults.push({ script, success: false, output });
    }
  }

  return { event: event.name, scripts, results: scriptResults };
}
