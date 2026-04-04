/**
 * `agentfs memory` command implementation.
 *
 * Subcommands:
 *   agentfs memory show                  — display semantic memory with confidence
 *   agentfs memory show episodic [date]  — display episodic entries
 *   agentfs memory show procedural [name]— display procedural skills
 *   agentfs memory consolidate           — run manual consolidation
 *
 * @module commands/memory
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseSemanticMemory,
  isSuperseded,
  listEpisodicDates,
  readEpisodicEntry,
  listProceduralSkills,
  readProceduralEntry,
} from '../memory/index.js';

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
// Show semantic memory
// ---------------------------------------------------------------------------

async function showSemantic(vaultRoot: string): Promise<number> {
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    printErr('No semantic memory found. Run `agentfs onboard` first.');
    return 1;
  }

  const entries = parseSemanticMemory(content);

  if (entries.length === 0) {
    print('Semantic memory is empty.');
    return 0;
  }

  print('');
  print('Semantic Memory');
  print('═'.repeat(50));

  let activeCount = 0;
  let supersededCount = 0;

  for (const entry of entries) {
    const superseded = isSuperseded(entry);
    if (superseded) {
      supersededCount++;
    } else {
      activeCount++;
    }

    const statusTag = superseded ? ' [superseded]' : '';
    const confidenceTag =
      entry.type === 'PATTERN' && entry.confidence !== undefined
        ? ` (${(entry.confidence * 100).toFixed(0)}%)`
        : '';

    const marker = superseded ? '  ○' : '  ●';
    print(`${marker} ${entry.type}: ${entry.content}${confidenceTag}${statusTag}`);
  }

  print('');
  print(`  Active: ${activeCount}  |  Superseded: ${supersededCount}  |  Total: ${entries.length}`);
  print('');

  return 0;
}

// ---------------------------------------------------------------------------
// Show episodic memory
// ---------------------------------------------------------------------------

async function showEpisodic(vaultRoot: string, date?: string): Promise<number> {
  if (date) {
    const content = await readEpisodicEntry(vaultRoot, date);
    if (content === null) {
      printErr(`No episodic entry found for ${date}.`);
      return 1;
    }
    print('');
    print(content);
    return 0;
  }

  // List all dates
  const dates = await listEpisodicDates(vaultRoot);
  if (dates.length === 0) {
    print('No episodic memories recorded yet.');
    return 0;
  }

  print('');
  print('Episodic Memory — Session History');
  print('═'.repeat(50));
  for (const d of dates) {
    print(`  📅 ${d}`);
  }
  print('');
  print(`  Total: ${dates.length} entries`);
  print('  Use: agentfs memory show episodic <date> for details');
  print('');

  return 0;
}

// ---------------------------------------------------------------------------
// Show procedural memory
// ---------------------------------------------------------------------------

async function showProcedural(vaultRoot: string, name?: string): Promise<number> {
  if (name) {
    const content = await readProceduralEntry(vaultRoot, name);
    if (content === null) {
      printErr(`No procedural skill found for "${name}".`);
      return 1;
    }
    print('');
    print(content);
    return 0;
  }

  // List all skills
  const skills = await listProceduralSkills(vaultRoot);
  if (skills.length === 0) {
    print('No procedural skills learned yet.');
    return 0;
  }

  print('');
  print('Procedural Memory — Learned Skills');
  print('═'.repeat(50));
  for (const s of skills) {
    print(`  🔧 ${s}`);
  }
  print('');
  print(`  Total: ${skills.length} skills`);
  print('  Use: agentfs memory show procedural <name> for details');
  print('');

  return 0;
}

// ---------------------------------------------------------------------------
// Consolidate
// ---------------------------------------------------------------------------

async function consolidate(vaultRoot: string): Promise<number> {
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    printErr('No semantic memory found. Nothing to consolidate.');
    return 1;
  }

  const entries = parseSemanticMemory(content);
  const active = entries.filter((e) => !isSuperseded(e));
  const superseded = entries.filter((e) => isSuperseded(e));

  print('');
  print('Memory Consolidation');
  print('═'.repeat(50));
  print(`  Semantic entries: ${entries.length}`);
  print(`    Active:     ${active.length}`);
  print(`    Superseded: ${superseded.length}`);

  // List episodic dates
  const dates = await listEpisodicDates(vaultRoot);
  print(`  Episodic entries: ${dates.length}`);

  // List procedural skills
  const skills = await listProceduralSkills(vaultRoot);
  print(`  Procedural skills: ${skills.length}`);

  print('');
  print('  Consolidation complete. No entries were modified.');
  print('  (Future: auto-decay stale PATTERN entries here.)');
  print('');

  return 0;
}

// ---------------------------------------------------------------------------
// Main command entry
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs memory` subcommand.
 *
 * @param args - Arguments after the `memory` subcommand token
 * @returns 0 on success, 1 on error
 */
export async function memoryCommand(args: string[]): Promise<number> {
  const vaultRoot = process.cwd();
  const action = args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printMemoryUsage();
    return 0;
  }

  if (action === 'show') {
    const target = args[1];

    if (target === 'episodic') {
      return showEpisodic(vaultRoot, args[2]);
    }

    if (target === 'procedural') {
      return showProcedural(vaultRoot, args[2]);
    }

    // Default: show semantic (includes optional `target === 'semantic'`)
    return showSemantic(vaultRoot);
  }

  if (action === 'consolidate') {
    return consolidate(vaultRoot);
  }

  printErr(`agentfs memory: unknown action '${action}'`);
  printMemoryUsage();
  return 1;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printMemoryUsage(): void {
  print('');
  print('Usage: agentfs memory <action>');
  print('');
  print('Actions:');
  print('  show                          Show semantic memory');
  print('  show episodic [date]          Show episodic memory (list or by date)');
  print('  show procedural [name]        Show procedural skills (list or by name)');
  print('  consolidate                   Run memory consolidation');
  print('');
}
