import { DEFAULT_CONFIDENCE } from '../src/types/index.js';
import type { Manifest, AgentCompiler, SecurityPolicy, SemanticEntry } from '../src/types/index.js';

describe('Core types', () => {
  test('DEFAULT_CONFIDENCE has correct initial values', () => {
    expect(DEFAULT_CONFIDENCE.initial).toBe(0.3);
    expect(DEFAULT_CONFIDENCE.confirmBoost).toBe(0.2);
    expect(DEFAULT_CONFIDENCE.denyPenalty).toBe(0.3);
    expect(DEFAULT_CONFIDENCE.decayRate).toBe(0.1);
    expect(DEFAULT_CONFIDENCE.decayDays).toBe(30);
    expect(DEFAULT_CONFIDENCE.supersededThreshold).toBe(0.1);
  });

  test('Manifest type is structurally valid', () => {
    const manifest: Manifest = {
      agentos: { version: '1.0.0', profile: 'personal' },
      vault: { name: 'test-vault', owner: 'tester', created: '2026-04-04' },
      agents: { primary: 'claude', supported: ['claude', 'cursor'] },
      paths: {
        tmp: 'Inbox',
        log: 'Daily',
        spool: 'Tasks',
        home: 'Projects',
        srv: 'Content',
        usr_share: 'Knowledge',
        proc_people: 'People',
        etc: '.agentos',
        archive: 'Archive',
      },
      boot: {
        sequence: [
          '.agentos/init.d/00-identity.md',
          '.agentos/init.d/10-memory.md',
        ],
      },
      frontmatter: {
        required: ['date', 'tags'],
      },
    };

    expect(manifest.agentos.profile).toBe('personal');
    expect(manifest.agents.primary).toBe('claude');
    expect(manifest.paths.tmp).toBe('Inbox');
  });

  test('SemanticEntry types are correct', () => {
    const entry: SemanticEntry = {
      type: 'PATTERN',
      content: 'more productive in the morning',
      status: 'active',
      confidence: 0.85,
    };

    expect(entry.type).toBe('PATTERN');
    expect(entry.confidence).toBe(0.85);

    const superseded: SemanticEntry = {
      type: 'FACT',
      content: 'old fact',
      status: 'superseded:2026-04-01',
    };

    expect(superseded.status).toBe('superseded:2026-04-01');
  });
});
