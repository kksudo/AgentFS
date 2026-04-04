/**
 * Memory module — barrel export.
 *
 * Re-exports the semantic memory parser and confidence scoring engine so
 * consumers can import from a single path:
 *
 * ```ts
 * import { parseSemanticMemory, confirmPattern } from './memory/index.js';
 * ```
 *
 * @module memory
 */

export {
  parseSemanticMemory,
  serializeSemanticEntry,
  appendSemanticEntry,
} from './parser.js';

export {
  confirmPattern,
  denyPattern,
  decayPattern,
  isSuperseded,
} from './confidence.js';

export {
  writeEpisodicEntry,
  readEpisodicEntry,
  listEpisodicDates,
} from './episodic.js';

export {
  writeProceduralEntry,
  readProceduralEntry,
  listProceduralSkills,
  slugify,
} from './procedural.js';
