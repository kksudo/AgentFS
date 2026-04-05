/**
 * Scaffold orchestrator — wires all generators together.
 *
 * Called when `npx create-agentfs` runs. Executes generators in order:
 * 1. Filesystem structure (dirs)
 * 2. Manifest.yaml
 * 3. Init.d boot scripts
 * 4. Ignore files (.gitignore, .agentignore)
 * 5. Memory system
 *
 * Each generator is idempotent: existing files are never overwritten.
 *
 * @module generators/scaffold
 */

import type { SetupAnswers, ScaffoldResult, GeneratorResult } from '../types/index.js';
import { generateFilesystem } from './filesystem.js';
import { generateManifest } from './manifest.js';
import { generateInitScripts } from './init.js';
import { generateIgnoreFiles } from './ignore.js';
import { generateMemoryFiles } from './memory.js';

/**
 * Run the full scaffold pipeline.
 *
 * @param answers - Setup answers from interactive prompts or programmatic call
 * @returns Aggregated result with counts and per-generator details
 */
export async function scaffold(answers: SetupAnswers): Promise<ScaffoldResult> {
  const details: Record<string, GeneratorResult> = {};
  let dirsCreated = 0;
  let filesCreated = 0;
  let itemsSkipped = 0;

  // 1. Filesystem structure (directories only)
  const fsResult = await generateFilesystem(answers);
  details['filesystem'] = fsResult;
  dirsCreated += fsResult.created.length;
  itemsSkipped += fsResult.skipped.length;

  // 2. Manifest.yaml
  const manifestResult = await generateManifest(answers);
  details['manifest'] = manifestResult;
  filesCreated += manifestResult.created.length;
  itemsSkipped += manifestResult.skipped.length;

  // 3. Init.d boot scripts
  const initResult = await generateInitScripts(answers);
  details['init'] = initResult;
  filesCreated += initResult.created.length;
  itemsSkipped += initResult.skipped.length;

  // 4. Ignore files
  const ignoreResult = await generateIgnoreFiles(answers);
  details['ignore'] = ignoreResult;
  filesCreated += ignoreResult.created.length;
  itemsSkipped += ignoreResult.skipped.length;

  // 5. Memory system
  const memoryResult = await generateMemoryFiles(answers);
  details['memory'] = memoryResult;
  filesCreated += memoryResult.created.length;
  itemsSkipped += memoryResult.skipped.length;

  return { dirsCreated, filesCreated, itemsSkipped, details };
}

/**
 * Print a human-readable scaffold summary.
 *
 * @param result - Scaffold result to format
 */
export function formatScaffoldSummary(result: ScaffoldResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('AgentFS scaffold complete!');
  lines.push('');
  lines.push(`  Directories created: ${result.dirsCreated}`);
  lines.push(`  Files created:       ${result.filesCreated}`);
  lines.push(`  Items skipped:       ${result.itemsSkipped}`);
  lines.push('');

  for (const [name, detail] of Object.entries(result.details)) {
    if (detail.created.length > 0 || detail.skipped.length > 0) {
      lines.push(`  [${name}]`);
      for (const item of detail.created) {
        lines.push(`    + ${item}`);
      }
      for (const item of detail.skipped) {
        lines.push(`    ~ ${item} (exists)`);
      }
    }
  }

  lines.push('');
  lines.push('Next steps:');
  lines.push('  agentfs onboard    — let the agent learn about you');
  lines.push('  agentfs compile    — generate native agent configs');
  lines.push('');

  return lines.join('\n');
}
