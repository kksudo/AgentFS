import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseSemanticMemory,
  isSuperseded,
  listEpisodicDates,
  readEpisodicEntry,
  listProceduralSkills,
  readProceduralEntry,
  appendSemanticEntry,
  writeEpisodicEntry,
  writeProceduralEntry,
} from '../memory/index.js';
import { CliFlags, printError, printResult, resolveInput } from '../utils/cli-flags.js';
import type { SemanticEntryType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Show semantic memory
// ---------------------------------------------------------------------------

async function showSemantic(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    printError(flags, 'No semantic memory found. Run `agentfs onboard` first.', 'MEMORY_NOT_FOUND');
    return 1;
  }

  const entries = parseSemanticMemory(content);

  if (entries.length === 0) {
    printResult(flags, 'Semantic memory is empty.', { entries: [] });
    return 0;
  }

  let human = '\nSemantic Memory\n' + '═'.repeat(50) + '\n';
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
    human += `${marker} ${entry.type}: ${entry.content}${confidenceTag}${statusTag}\n`;
  }

  human += `\n  Active: ${activeCount}  |  Superseded: ${supersededCount}  |  Total: ${entries.length}\n`;

  printResult(flags, human, {
    entries,
    stats: { active: activeCount, superseded: supersededCount, total: entries.length }
  });

  return 0;
}

// ---------------------------------------------------------------------------
// Show episodic memory
// ---------------------------------------------------------------------------

async function showEpisodic(flags: CliFlags, date?: string): Promise<number> {
  const vaultRoot = flags.targetDir;
  if (date) {
    const content = await readEpisodicEntry(vaultRoot, date);
    if (content === null) {
      printError(flags, `No episodic entry found for ${date}.`, 'EPISODIC_NOT_FOUND');
      return 1;
    }
    printResult(flags, `\n${content}`, { date, content });
    return 0;
  }

  // List all dates
  const dates = await listEpisodicDates(vaultRoot);
  if (dates.length === 0) {
    printResult(flags, 'No episodic memories recorded yet.', { dates: [] });
    return 0;
  }

  let human = '\nEpisodic Memory — Session History\n' + '═'.repeat(50) + '\n';
  for (const d of dates) {
    human += `  📅 ${d}\n`;
  }
  human += `\n  Total: ${dates.length} entries\n  Use: agentfs memory show episodic <date> for details\n`;

  printResult(flags, human, { dates });
  return 0;
}

// ---------------------------------------------------------------------------
// Show procedural memory
// ---------------------------------------------------------------------------

async function showProcedural(flags: CliFlags, name?: string): Promise<number> {
  const vaultRoot = flags.targetDir;
  if (name) {
    const content = await readProceduralEntry(vaultRoot, name);
    if (content === null) {
      printError(flags, `No procedural skill found for "${name}".`, 'PROCEDURAL_NOT_FOUND');
      return 1;
    }
    printResult(flags, `\n${content}`, { name, content });
    return 0;
  }

  // List all skills
  const skills = await listProceduralSkills(vaultRoot);
  if (skills.length === 0) {
    printResult(flags, 'No procedural skills learned yet.', { skills: [] });
    return 0;
  }

  let human = '\nProcedural Memory — Learned Skills\n' + '═'.repeat(50) + '\n';
  for (const s of skills) {
    human += `  🔧 ${s}\n`;
  }
  human += `\n  Total: ${skills.length} skills\n  Use: agentfs memory show procedural <name> for details\n`;

  printResult(flags, human, { skills });
  return 0;
}

// ---------------------------------------------------------------------------
// Add memory
// ---------------------------------------------------------------------------

async function addMemory(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const input = await resolveInput(flags);
  const target = flags.args[0]; // semantic, episodic, procedural

  if (input === null) {
    printError(flags, 'agentfs memory add requires --json or --config input.', 'INPUT_REQUIRED');
    return 1;
  }

  if (target === 'semantic' || target === undefined) {
    const { type, content, confidence, status } = input;
    if (!type || !content) {
      printError(flags, 'Semantic entry requires type and content.', 'INVALID_INPUT');
      return 1;
    }
    const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');
    await appendSemanticEntry(semanticPath, {
      type: type as SemanticEntryType,
      content: content as string,
      confidence: confidence as number | undefined,
      status: (status as any) || 'active',
    });
    printResult(flags, `Added semantic entry: ${type}: ${content}`, { type, content });
    return 0;
  }

  if (target === 'episodic') {
    const { date, content, events, decisions, lessons } = input;
    if (!date || (!content && !events)) {
      printError(flags, 'Episodic entry requires date and at least one event or content.', 'INVALID_INPUT');
      return 1;
    }
    await writeEpisodicEntry(vaultRoot, {
      date: date as string,
      events: (events as string[]) || (content ? [content as string] : []),
      decisions: (decisions as string[]) || [],
      lessons: (lessons as string[]) || [],
    });
    printResult(flags, `Recorded episodic entry for ${date}`, { date });
    return 0;
  }

  if (target === 'procedural') {
    const { name, content, description, steps, context, triggers } = input;
    if (!name || (!content && !steps)) {
      printError(flags, 'Procedural entry requires name and at least one step or content.', 'INVALID_INPUT');
      return 1;
    }
    await writeProceduralEntry(vaultRoot, {
      name: name as string,
      description: (description as string) || (name as string),
      steps: (steps as string[]) || (content ? [content as string] : []),
      context: (context as string) || '',
      triggers: (triggers as string[]) || [],
    });
    printResult(flags, `Learned procedural skill: ${name}`, { name });
    return 0;
  }

  printError(flags, `Unknown memory target '${target}'`, 'INVALID_TARGET');
  return 1;
}

// ---------------------------------------------------------------------------
// Consolidate
// ---------------------------------------------------------------------------

async function consolidate(flags: CliFlags): Promise<number> {
  const vaultRoot = flags.targetDir;
  const semanticPath = path.join(vaultRoot, '.agentos/memory/semantic.md');

  let content: string;
  try {
    content = await fs.readFile(semanticPath, 'utf8');
  } catch {
    printError(flags, 'No semantic memory found. Nothing to consolidate.', 'MEMORY_NOT_FOUND');
    return 1;
  }

  const entries = parseSemanticMemory(content);
  const active = entries.filter((e) => !isSuperseded(e));
  const superseded = entries.filter((e) => isSuperseded(e));

  const dates = await listEpisodicDates(vaultRoot);
  const skills = await listProceduralSkills(vaultRoot);

  let human = '\nMemory Consolidation\n' + '═'.repeat(50) + '\n';
  human += `  Semantic entries: ${entries.length}\n`;
  human += `    Active:     ${active.length}\n`;
  human += `    Superseded: ${superseded.length}\n`;
  human += `  Episodic entries: ${dates.length}\n`;
  human += `  Procedural skills: ${skills.length}\n`;
  human += '\n  Consolidation complete. No entries were modified.\n';

  printResult(flags, human, {
    stats: {
      semantic: { total: entries.length, active: active.length, superseded: superseded.length },
      episodic: { total: dates.length },
      procedural: { total: skills.length }
    }
  });

  return 0;
}

// ---------------------------------------------------------------------------
// Main command entry
// ---------------------------------------------------------------------------

/**
 * Entry point for the `agentfs memory` subcommand.
 *
 * @param flags - Parsed CLI flags
 * @returns 0 on success, 1 on error
 */
export async function memoryCommand(flags: CliFlags): Promise<number> {
  const action = flags.args[0];

  if (action === undefined || action === '--help' || action === '-h') {
    printMemoryUsage();
    return 0;
  }

  // Remove the action name from args so subhandlers see only their own args.
  // e.g. ['show', 'episodic', '2026-04-01'] → ['episodic', '2026-04-01']
  flags.args.shift();

  if (action === 'show') {
    const target = flags.args[0];

    if (target === 'episodic') {
      return showEpisodic(flags, flags.args[1]);
    }

    if (target === 'procedural') {
      return showProcedural(flags, flags.args[1]);
    }

    return showSemantic(flags);
  }

  if (action === 'add') {
    return addMemory(flags);
  }

  if (action === 'consolidate') {
    return consolidate(flags);
  }

  printError(flags, `agentfs memory: unknown action '${action}'`, 'UNKNOWN_ACTION');
  return 1;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printMemoryUsage(): void {
  process.stdout.write('\nUsage: agentfs memory <action>\n\n');
  process.stdout.write('Actions:\n');
  process.stdout.write('  show                          Show semantic memory\n');
  process.stdout.write('  show episodic [date]          Show episodic memory (list or by date)\n');
  process.stdout.write('  show procedural [name]        Show procedural skills (list or by name)\n');
  process.stdout.write('  add [target] --json <data>    Add memory entry (semantic/episodic/procedural)\n');
  process.stdout.write('  consolidate                   Run memory consolidation\n\n');
}
