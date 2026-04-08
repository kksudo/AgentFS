import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic imports
// ---------------------------------------------------------------------------

const mockBuildCompileContext = jest.fn<any>();

jest.unstable_mockModule('../src/compilers/base.js', () => ({
  buildCompileContext: mockBuildCompileContext,
}));

const mockReadSecurityPolicy = jest.fn<any>();

jest.unstable_mockModule('../src/security/parser.js', () => ({
  readSecurityPolicy: mockReadSecurityPolicy,
}));

const mockParseSemanticMemory = jest.fn<any>();
const mockListEpisodicDates = jest.fn<any>();
const mockListProceduralSkills = jest.fn<any>();

jest.unstable_mockModule('../src/memory/index.js', () => ({
  parseSemanticMemory: mockParseSemanticMemory,
  listEpisodicDates: mockListEpisodicDates,
  listProceduralSkills: mockListProceduralSkills,
}));

const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

const { infoCommand } = await import('../src/commands/info.js');
const { parseCliFlags } = await import('../src/utils/cli-flags.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      vault: { name: 'my-vault', owner: 'Kirill' },
      agentos: { profile: 'personal' },
      modules: ['career', 'engineering'],
      paths: { tmp: 'Inbox/', log: 'Daily/' },
      boot: { sequence: [] },
      frontmatter: { required: [] },
    },
    initScripts: {
      '00-identity.md': '# identity',
      '10-memory.md': '# memory',
      '20-today.md': '# today',
    },
    semanticMemory: 'FACT: [active] uses TypeScript\nFACT: [active] loves testing\nPREF: no emoji',
    corrections: '# header\nCorrection A\nCorrection B\n',
    vaultRoot: '/tmp/vault',
    dryRun: false,
    initScriptWarnings: [],
    ...overrides,
  };
}

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    policy: {
      default_mode: 'complain',
      file_access: {
        deny_read: ['.agentos/secrets/**', '.env', '**/*.pem', '**/*.key'],
        deny_write: ['.git/**', 'node_modules/**'],
        allow_write: [],
        ask_write: [],
        default: 'rw',
      },
      input_validation: { enabled: true, scan_on_read: [], action: 'warn', quarantine_path: '' },
      network: { deny_exfil_patterns: [], allowed_domains: [] },
      commands: { blocked: [], ask_before: [] },
      version: '1.0',
      ...overrides,
    },
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commands/info', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseSemanticMemory.mockReturnValue([
      { type: 'FACT', content: 'uses TypeScript', status: 'active' },
      { type: 'FACT', content: 'loves testing', status: 'active' },
      { type: 'PREF', content: 'no emoji', status: 'active' },
    ]);
    mockListEpisodicDates.mockResolvedValue(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
    mockListProceduralSkills.mockResolvedValue(['skill-a', 'skill-b', 'skill-c']);
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('returns 1 and prints error when vault not found (ENOENT)', async () => {
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockBuildCompileContext.mockRejectedValueOnce(err);

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentFS vault found'));
  });

  test('returns 1 and prints error on unknown build failure', async () => {
    mockBuildCompileContext.mockRejectedValueOnce(new Error('Disk read error'));

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Disk read error'));
  });

  test('returns 0 and human output contains all sections', async () => {
    mockBuildCompileContext.mockResolvedValueOnce(makeContext());
    mockReadSecurityPolicy.mockResolvedValueOnce(makePolicy());

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(0);

    const output = (stdoutSpy.mock.calls.flat() as string[]).join('');
    expect(output).toContain('AgentFS Info');
    expect(output).toContain('my-vault');
    expect(output).toContain('personal');
    expect(output).toContain('Kirill');
    expect(output).toContain('3 semantic');
    expect(output).toContain('5 episodic');
    expect(output).toContain('3 procedural');
    expect(output).toContain('complain mode');
    expect(output).toContain('4 deny-read');
    expect(output).toContain('2 deny-write');
    expect(output).toContain('00-identity.md');
    expect(output).toContain('10-memory.md');
    expect(output).toContain('20-today.md');
    expect(output).toContain('career');
    expect(output).toContain('engineering');
    expect(output).toContain('2 active');   // corrections: 2 non-empty non-comment lines
    expect(output).toContain('Inbox/');
    expect(output).toContain('Daily/');
  });

  test('--output json produces valid JSON with expected keys', async () => {
    mockBuildCompileContext.mockResolvedValueOnce(makeContext());
    mockReadSecurityPolicy.mockResolvedValueOnce(makePolicy());

    const code = await infoCommand(parseCliFlags(['--output', 'json']));

    expect(code).toBe(0);

    const raw = (stdoutSpy.mock.calls.flat() as string[]).join('');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(parsed.status).toBe('success');
    expect(parsed.vault).toBe('my-vault');
    expect(parsed.owner).toBe('Kirill');
    expect(parsed.profile).toBe('personal');
    expect((parsed.memory as Record<string, number>).semantic).toBe(3);
    expect((parsed.memory as Record<string, number>).episodic).toBe(5);
    expect((parsed.memory as Record<string, number>).procedural).toBe(3);
    expect((parsed.security as Record<string, unknown>).mode).toBe('complain');
    expect((parsed.security as Record<string, number>).denyRead).toBe(4);
    expect((parsed.security as Record<string, number>).denyWrite).toBe(2);
    expect(parsed.corrections).toBe(2);
    expect(Array.isArray(parsed.boot)).toBe(true);
    expect(Array.isArray(parsed.modules)).toBe(true);
  });

  test('handles missing semanticMemory gracefully (null)', async () => {
    mockBuildCompileContext.mockResolvedValueOnce(makeContext({ semanticMemory: null }));
    mockReadSecurityPolicy.mockResolvedValueOnce(makePolicy());

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(0);
    const output = (stdoutSpy.mock.calls.flat() as string[]).join('');
    expect(output).toContain('0 semantic');
    // parseSemanticMemory should NOT be called when semanticMemory is null
    expect(mockParseSemanticMemory).not.toHaveBeenCalled();
  });

  test('handles empty modules and paths', async () => {
    const ctx = makeContext();
    (ctx.manifest as Record<string, unknown>).modules = [];
    (ctx.manifest as Record<string, unknown>).paths = {};
    mockBuildCompileContext.mockResolvedValueOnce(ctx);
    mockReadSecurityPolicy.mockResolvedValueOnce(makePolicy());

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(0);
    const output = (stdoutSpy.mock.calls.flat() as string[]).join('');
    expect(output).toContain('(none)');
  });

  test('handles null corrections gracefully', async () => {
    mockBuildCompileContext.mockResolvedValueOnce(makeContext({ corrections: null }));
    mockReadSecurityPolicy.mockResolvedValueOnce(makePolicy());

    const code = await infoCommand(parseCliFlags([]));

    expect(code).toBe(0);
    const output = (stdoutSpy.mock.calls.flat() as string[]).join('');
    expect(output).toContain('0 active');
  });
});
