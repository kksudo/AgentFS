/**
 * Tests for src/utils/fhs-mapping.ts
 *
 * Covers:
 * - Default path generation for all three profiles (personal, company, shared)
 * - FHS_DESCRIPTIONS completeness and shape
 * - resolveFhsPath happy path and error branch
 */

import { getDefaultPaths, resolveFhsPath, FHS_DESCRIPTIONS } from '../src/utils/fhs-mapping.js';
import type { FhsPaths, Profile } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// FHS_DESCRIPTIONS
// ---------------------------------------------------------------------------

describe('FHS_DESCRIPTIONS', () => {
  it('contains an entry for every key in the FhsPaths interface', () => {
    const requiredKeys: Array<keyof Required<FhsPaths>> = [
      'tmp',
      'log',
      'spool',
      'home',
      'srv',
      'usr_share',
      'proc_people',
      'etc',
      'archive',
      'home_contracts',
      'usr_local_career',
      'home_user',
      'usr_share_media',
    ];

    for (const key of requiredKeys) {
      expect(FHS_DESCRIPTIONS).toHaveProperty(key);
    }
  });

  it('every entry has a non-empty linuxPath starting with /', () => {
    for (const [key, meta] of Object.entries(FHS_DESCRIPTIONS)) {
      expect(typeof meta.linuxPath).toBe('string');
      expect(meta.linuxPath.length).toBeGreaterThan(0);
      expect(meta.linuxPath.startsWith('/')).toBe(true);
    }
  });

  it('every entry has a non-empty description string', () => {
    for (const [key, meta] of Object.entries(FHS_DESCRIPTIONS)) {
      expect(typeof meta.description).toBe('string');
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it('tmp maps to /tmp', () => {
    expect(FHS_DESCRIPTIONS.tmp.linuxPath).toBe('/tmp');
  });

  it('etc maps to /etc', () => {
    expect(FHS_DESCRIPTIONS.etc.linuxPath).toBe('/etc');
  });
});

// ---------------------------------------------------------------------------
// getDefaultPaths — personal profile
// ---------------------------------------------------------------------------

describe('getDefaultPaths("personal")', () => {
  let paths: FhsPaths;

  beforeEach(() => {
    paths = getDefaultPaths('personal');
  });

  it('tmp → Inbox', () => expect(paths.tmp).toBe('Inbox'));
  it('log → Daily', () => expect(paths.log).toBe('Daily'));
  it('spool → Tasks', () => expect(paths.spool).toBe('Tasks'));
  it('home → Projects', () => expect(paths.home).toBe('Projects'));
  it('srv → Content', () => expect(paths.srv).toBe('Content'));
  it('usr_share → Knowledge', () => expect(paths.usr_share).toBe('Knowledge'));
  it('proc_people → People', () => expect(paths.proc_people).toBe('People'));
  it('etc → .agentos', () => expect(paths.etc).toBe('.agentos'));
  it('archive → Archive', () => expect(paths.archive).toBe('Archive'));
  it('home_contracts → Work', () => expect(paths.home_contracts).toBe('Work'));
  it('usr_local_career → Career', () => expect(paths.usr_local_career).toBe('Career'));
  it('home_user → Engineering', () => expect(paths.home_user).toBe('Engineering'));
  it('usr_share_media → assets', () => expect(paths.usr_share_media).toBe('assets'));

  it('returns an object with all required core keys', () => {
    const coreKeys: Array<keyof FhsPaths> = [
      'tmp', 'log', 'spool', 'home', 'srv', 'usr_share', 'proc_people', 'etc', 'archive',
    ];
    for (const key of coreKeys) {
      expect(paths[key]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// getDefaultPaths — company profile
// ---------------------------------------------------------------------------

describe('getDefaultPaths("company")', () => {
  let paths: FhsPaths;

  beforeEach(() => {
    paths = getDefaultPaths('company');
  });

  it('tmp → Inbox', () => expect(paths.tmp).toBe('Inbox'));
  it('log → Daily', () => expect(paths.log).toBe('Daily'));
  it('spool → Tasks', () => expect(paths.spool).toBe('Tasks'));
  // /home → Teams (team workspaces, not personal projects)
  it('home → Teams', () => expect(paths.home).toBe('Teams'));
  // /srv → Clients (client-facing content)
  it('srv → Clients', () => expect(paths.srv).toBe('Clients'));
  it('usr_share → Knowledge', () => expect(paths.usr_share).toBe('Knowledge'));
  it('proc_people → People', () => expect(paths.proc_people).toBe('People'));
  it('etc → .agentos', () => expect(paths.etc).toBe('.agentos'));
  it('archive → Archive', () => expect(paths.archive).toBe('Archive'));
  it('usr_share_media → assets', () => expect(paths.usr_share_media).toBe('assets'));

  it('does not include personal-only optional paths', () => {
    expect(paths.home_contracts).toBeUndefined();
    expect(paths.usr_local_career).toBeUndefined();
    expect(paths.home_user).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDefaultPaths — shared profile
// ---------------------------------------------------------------------------

describe('getDefaultPaths("shared")', () => {
  let paths: FhsPaths;

  beforeEach(() => {
    paths = getDefaultPaths('shared');
  });

  it('tmp → Inbox', () => expect(paths.tmp).toBe('Inbox'));
  it('log → Daily', () => expect(paths.log).toBe('Daily'));
  it('spool → Tasks', () => expect(paths.spool).toBe('Tasks'));
  // /home → Spaces (per-user namespaced areas)
  it('home → Spaces', () => expect(paths.home).toBe('Spaces'));
  // /srv → Shared
  it('srv → Shared', () => expect(paths.srv).toBe('Shared'));
  // /usr/share → Shared (shared knowledge collapses here)
  it('usr_share → Shared', () => expect(paths.usr_share).toBe('Shared'));
  it('proc_people → People', () => expect(paths.proc_people).toBe('People'));
  it('etc → .agentos', () => expect(paths.etc).toBe('.agentos'));
  it('archive → Archive', () => expect(paths.archive).toBe('Archive'));
  it('usr_share_media → assets', () => expect(paths.usr_share_media).toBe('assets'));

  it('does not include personal-only optional paths', () => {
    expect(paths.home_contracts).toBeUndefined();
    expect(paths.usr_local_career).toBeUndefined();
    expect(paths.home_user).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveFhsPath
// ---------------------------------------------------------------------------

describe('resolveFhsPath', () => {
  it('resolves a required key from personal paths', () => {
    const paths = getDefaultPaths('personal');
    expect(resolveFhsPath('tmp', paths)).toBe('Inbox');
    expect(resolveFhsPath('log', paths)).toBe('Daily');
    expect(resolveFhsPath('spool', paths)).toBe('Tasks');
    expect(resolveFhsPath('home', paths)).toBe('Projects');
    expect(resolveFhsPath('srv', paths)).toBe('Content');
    expect(resolveFhsPath('usr_share', paths)).toBe('Knowledge');
    expect(resolveFhsPath('proc_people', paths)).toBe('People');
    expect(resolveFhsPath('etc', paths)).toBe('.agentos');
    expect(resolveFhsPath('archive', paths)).toBe('Archive');
  });

  it('resolves personal-only optional keys when present', () => {
    const paths = getDefaultPaths('personal');
    expect(resolveFhsPath('home_contracts', paths)).toBe('Work');
    expect(resolveFhsPath('usr_local_career', paths)).toBe('Career');
    expect(resolveFhsPath('home_user', paths)).toBe('Engineering');
    expect(resolveFhsPath('usr_share_media', paths)).toBe('assets');
  });

  it('resolves company-specific keys', () => {
    const paths = getDefaultPaths('company');
    expect(resolveFhsPath('home', paths)).toBe('Teams');
    expect(resolveFhsPath('srv', paths)).toBe('Clients');
  });

  it('resolves shared-specific keys', () => {
    const paths = getDefaultPaths('shared');
    expect(resolveFhsPath('home', paths)).toBe('Spaces');
    expect(resolveFhsPath('srv', paths)).toBe('Shared');
    expect(resolveFhsPath('usr_share', paths)).toBe('Shared');
  });

  it('throws a descriptive error when an optional key is absent', () => {
    // company profile does not define home_contracts
    const companyPaths = getDefaultPaths('company');
    expect(() => resolveFhsPath('home_contracts', companyPaths)).toThrow(
      /home_contracts.*not defined/,
    );
  });

  it('throws a descriptive error for another missing optional key', () => {
    const sharedPaths = getDefaultPaths('shared');
    expect(() => resolveFhsPath('usr_local_career', sharedPaths)).toThrow(
      /usr_local_career.*not defined/,
    );
  });

  it('works with a custom paths object', () => {
    const custom: FhsPaths = {
      tmp: 'Drops',
      log: 'Journal',
      spool: 'Queue',
      home: 'Work',
      srv: 'Publish',
      usr_share: 'Library',
      proc_people: 'Contacts',
      etc: '.config',
      archive: 'Vault',
    };
    expect(resolveFhsPath('tmp', custom)).toBe('Drops');
    expect(resolveFhsPath('home', custom)).toBe('Work');
    expect(resolveFhsPath('usr_share', custom)).toBe('Library');
  });

  it('all profiles share the same core keys with consistent values', () => {
    const profiles: Profile[] = ['personal', 'company', 'shared'];
    const sharedCoreKeys: Array<keyof FhsPaths> = ['tmp', 'log', 'spool', 'etc', 'archive'];

    for (const profile of profiles) {
      const paths = getDefaultPaths(profile);
      expect(resolveFhsPath('tmp', paths)).toBe('Inbox');
      expect(resolveFhsPath('log', paths)).toBe('Daily');
      expect(resolveFhsPath('spool', paths)).toBe('Tasks');
      expect(resolveFhsPath('etc', paths)).toBe('.agentos');
      expect(resolveFhsPath('archive', paths)).toBe('Archive');
    }
  });
});
