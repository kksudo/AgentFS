import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic imports.
// ---------------------------------------------------------------------------

const mockReadOsRelease = jest.fn<any>();
const mockGenerateOsRelease = jest.fn<any>().mockResolvedValue({ created: ['.agentos/os-release'], skipped: [] });
const mockFormatOsRelease = jest.fn<any>().mockReturnValue('NAME="AgentFS"\n');

jest.unstable_mockModule('../src/generators/os-release.js', () => ({
  readOsRelease: mockReadOsRelease,
  generateOsRelease: mockGenerateOsRelease,
  formatOsRelease: mockFormatOsRelease,
  updateOsRelease: jest.fn<any>().mockResolvedValue({ path: '.agentos/os-release', content: '', managed: true }),
  parseOsRelease: jest.fn<any>(),
}));

const mockGetMigrationsForRange = jest.fn<any>().mockReturnValue([]);

jest.unstable_mockModule('../src/migrations/index.js', () => ({
  CURRENT_SCHEMA_VERSION: 1,
  MIGRATIONS: [],
  getMigrationsForRange: mockGetMigrationsForRange,
}));

// Mock fs — controlled per-test via mockImplementation
const mockAccess = jest.fn<any>();
const mockMkdir = jest.fn<any>().mockResolvedValue(undefined);
const mockWriteFile = jest.fn<any>().mockResolvedValue(undefined);

jest.unstable_mockModule('node:fs/promises', () => ({
  default: {
    access: mockAccess,
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: jest.fn<any>(),
  },
}));

// Mock dynamic imports used in upgradeV0Vault
const mockGenerateMemoryIndex = jest.fn<any>().mockResolvedValue({
  path: '.agentos/memory/INDEX.md',
  content: '# Memory Index\n',
  managed: true,
});
const mockWriteOutputs = jest.fn<any>().mockResolvedValue(undefined);

jest.unstable_mockModule('../src/memory/memory-index.js', () => ({
  generateMemoryIndex: mockGenerateMemoryIndex,
}));

jest.unstable_mockModule('../src/compilers/base.js', () => ({
  writeOutputs: mockWriteOutputs,
  buildCompileContext: jest.fn<any>(),
  readManifest: jest.fn<any>(),
}));

const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

const { upgradeCommand } = await import('../src/commands/upgrade.js');
const { parseCliFlags } = await import('../src/utils/cli-flags.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make mockAccess resolve (path exists) for all calls. */
function accessAlwaysExists(): void {
  mockAccess.mockResolvedValue(undefined);
}

/** Make mockAccess reject with ENOENT (path does not exist) for all calls. */
function accessNeverExists(): void {
  const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  mockAccess.mockRejectedValue(err);
}

/**
 * Make mockAccess resolve for .agentos/ dir (first call) but reject for all
 * subsequent paths (os-release, kernel dirs, memory index).
 */
function accessOnlyAgentosDir(): void {
  const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  mockAccess
    .mockResolvedValueOnce(undefined)  // .agentos/ exists
    .mockRejectedValue(err);           // everything else missing
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commands/upgrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mockGenerateOsRelease so it resolves to something readable
    mockGenerateOsRelease.mockResolvedValue({ created: ['.agentos/os-release'], skipped: [] });
    mockFormatOsRelease.mockReturnValue('NAME="AgentFS"\n');
    mockGetMigrationsForRange.mockReturnValue([]);
    mockWriteOutputs.mockResolvedValue(undefined);
    mockGenerateMemoryIndex.mockResolvedValue({
      path: '.agentos/memory/INDEX.md',
      content: '# Memory Index\n',
      managed: true,
    });
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // No vault
  // -------------------------------------------------------------------------

  test('returns 1 with VAULT_NOT_FOUND when .agentos/ does not exist', async () => {
    accessNeverExists();
    mockReadOsRelease.mockResolvedValue(null);

    const code = await upgradeCommand(parseCliFlags([]));

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No vault found'));
  });

  // -------------------------------------------------------------------------
  // v0 vault (no os-release)
  // -------------------------------------------------------------------------

  test('v0 vault: creates os-release and missing dirs, returns 0', async () => {
    // .agentos/ exists but everything else is missing
    accessOnlyAgentosDir();
    mockReadOsRelease
      .mockResolvedValueOnce(null)   // first read: no os-release → v0 path
      .mockResolvedValueOnce({       // second read: after generateOsRelease
        NAME: 'AgentFS',
        VERSION: '0.1.4',
        SCHEMA_VERSION: 1,
        VAULT_CREATED: '2024-01-01',
      });

    const code = await upgradeCommand(parseCliFlags([]));

    expect(code).toBe(0);
    expect(mockGenerateOsRelease).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('upgrade complete'));
  });

  test('v0 vault with --check: returns 1 (needs upgrade)', async () => {
    // .agentos/ exists
    mockAccess.mockResolvedValueOnce(undefined); // .agentos/ check
    mockReadOsRelease.mockResolvedValue(null);

    const code = await upgradeCommand(parseCliFlags(['--check']));

    expect(code).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('needs upgrade'));
    // generateOsRelease must NOT be called in check mode
    expect(mockGenerateOsRelease).not.toHaveBeenCalled();
  });

  test('v0 vault with --dry-run: no files written', async () => {
    accessOnlyAgentosDir();
    mockReadOsRelease.mockResolvedValue(null);

    const code = await upgradeCommand(parseCliFlags(['--dry-run']));

    expect(code).toBe(0);
    // In dry-run, mkdir and writeFile must not be called
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
  });

  // -------------------------------------------------------------------------
  // Up-to-date vault
  // -------------------------------------------------------------------------

  test('up-to-date vault: prints "up to date" message and returns 0', async () => {
    accessAlwaysExists();
    mockReadOsRelease.mockResolvedValue({
      NAME: 'AgentFS',
      VERSION: '0.1.4',
      SCHEMA_VERSION: 1,
      VAULT_CREATED: '2024-01-01',
    });

    const code = await upgradeCommand(parseCliFlags([]));

    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('up to date'));
  });

  test('up-to-date vault with --check: returns 0', async () => {
    accessAlwaysExists();
    mockReadOsRelease.mockResolvedValue({
      NAME: 'AgentFS',
      VERSION: '0.1.4',
      SCHEMA_VERSION: 1,
      VAULT_CREATED: '2024-01-01',
    });

    const code = await upgradeCommand(parseCliFlags(['--check']));

    expect(code).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Vault with newer schema than CLI
  // -------------------------------------------------------------------------

  test('vault schema newer than CLI: returns 1 with SCHEMA_TOO_NEW error', async () => {
    accessAlwaysExists();
    mockReadOsRelease.mockResolvedValue({
      NAME: 'AgentFS',
      VERSION: '0.2.0',
      SCHEMA_VERSION: 99,
      VAULT_CREATED: '2024-01-01',
    });

    const code = await upgradeCommand(parseCliFlags([]));

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('newer than CLI'));
  });

  // -------------------------------------------------------------------------
  // JSON output
  // -------------------------------------------------------------------------

  test('up-to-date vault with --output json: prints JSON', async () => {
    accessAlwaysExists();
    mockReadOsRelease.mockResolvedValue({
      NAME: 'AgentFS',
      VERSION: '0.1.4',
      SCHEMA_VERSION: 1,
      VAULT_CREATED: '2024-01-01',
    });

    const code = await upgradeCommand(parseCliFlags(['--output', 'json']));

    expect(code).toBe(0);
    const output = (stdoutSpy.mock.calls[0][0] as string);
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('success');
    expect(parsed.needsUpgrade).toBe(false);
  });
});
