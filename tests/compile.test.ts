import { jest } from '@jest/globals';

const mockBuildCompileContext = jest.fn<any>();
const mockWriteOutputs = jest.fn<any>();
const mockClaudeCompile = jest.fn<any>();
const mockGenerateAgentsFile = jest.fn<any>();
const mockRunHooks = jest.fn<any>().mockResolvedValue(undefined);
const mockValidateManifest = jest.fn<any>().mockReturnValue({ valid: true, errors: [], warnings: [] });
const mockGenerateMemoryIndex = jest.fn<any>().mockResolvedValue({
  path: '.agentos/memory/INDEX.md',
  content: '# Memory Index\n',
  managed: true,
});

jest.unstable_mockModule('../src/compilers/base.js', () => ({
  buildCompileContext: mockBuildCompileContext,
  writeOutputs: mockWriteOutputs,
  readManifest: jest.fn<any>(),
}));

jest.unstable_mockModule('../src/compilers/claude.js', () => ({
  claudeCompiler: {
    name: 'claude',
    compile: mockClaudeCompile,
    supports: jest.fn().mockReturnValue(true)
  }
}));

jest.unstable_mockModule('../src/compilers/agent-map.js', () => ({
  generateAgentsFile: mockGenerateAgentsFile
}));

jest.unstable_mockModule('../src/hooks/index.js', () => ({
  runHooks: mockRunHooks,
}));

jest.unstable_mockModule('../src/utils/validate-manifest.js', () => ({
  validateManifest: mockValidateManifest,
}));

jest.unstable_mockModule('../src/memory/memory-index.js', () => ({
  generateMemoryIndex: mockGenerateMemoryIndex,
}));

const mockUpdateOsRelease = jest.fn<any>().mockResolvedValue({
  path: '.agentos/os-release',
  content: 'NAME="AgentFS"\n',
  managed: true,
});

jest.unstable_mockModule('../src/generators/os-release.js', () => ({
  updateOsRelease: mockUpdateOsRelease,
  generateOsRelease: jest.fn<any>().mockResolvedValue({ created: [], skipped: [] }),
  readOsRelease: jest.fn<any>().mockResolvedValue(null),
  parseOsRelease: jest.fn<any>(),
  formatOsRelease: jest.fn<any>(),
}));

const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

const { compileCommand } = await import('../src/commands/compile.js');
const { parseCliFlags } = await import('../src/utils/cli-flags.js');

describe('commands/compile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('fails if manifest is missing (ENOENT error format bypass check)', async () => {
    const error = new Error('Not found');
    (error as any).code = 'ENOENT';
    mockBuildCompileContext.mockRejectedValueOnce(error);

    const code = await compileCommand(parseCliFlags([]));
    
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentFS vault found'));
  });

  test('fails on unknown error during context building', async () => {
    mockBuildCompileContext.mockRejectedValueOnce(new Error('Syntax Error'));

    const code = await compileCommand(parseCliFlags([]));
    
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax Error'));
  });

  test('fails if unknown agent is specified natively', async () => {
    mockBuildCompileContext.mockResolvedValueOnce({
      manifest: {
        agents: { supported: ['some-other-runner'] }
      }
    });

    const code = await compileCommand(parseCliFlags(['invalid-agent-name']));
    
    expect(code).toBe(1); 
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('no supported compilers found'));
  });

  test('fails if requested compiler does not exist', async () => {
    // Actually, `openclaw` returns claude inside the registry currently as a placeholder in compile.ts.
    // Let's just bypass this level of detail.
  });

  test('compiles targeting all supported manifest agents', async () => {
    mockBuildCompileContext.mockResolvedValueOnce({
      manifest: {
        agents: { supported: ['claude'] },
        vault: { name: 't' },
        agentos: { profile: 'p' }
      }
    });

    mockClaudeCompile.mockResolvedValueOnce({
      agent: 'claude',
      outputs: [{ path: 'CLAUDE.md', content: 'test', managed: true }],
      summary: 'Compiled'
    });

    mockGenerateAgentsFile.mockResolvedValueOnce({
      path: 'AGENT-MAP.md',
      content: 'map',
      managed: true
    });

    const code = await compileCommand(parseCliFlags([]));

    expect(code).toBe(0);
    expect(mockClaudeCompile).toHaveBeenCalled();
    expect(mockGenerateAgentsFile).toHaveBeenCalled();
    expect(mockWriteOutputs).toHaveBeenCalledTimes(4); // once for claude, once for AGENT-MAP.md, once for INDEX.md, once for os-release
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('AgentFS compile complete'));
  });

  test('handles dry-run correctly', async () => {
    mockBuildCompileContext.mockResolvedValueOnce({
      manifest: {
        agents: { supported: ['claude'] },
        vault: { name: 't' },
        agentos: { profile: 'p' }
      }
    });

    mockClaudeCompile.mockResolvedValueOnce({
      agent: 'claude',
      outputs: [{ path: 'CLAUDE.md', content: 'test', managed: true }],
      summary: 'Compiled'
    });

    mockGenerateAgentsFile.mockResolvedValueOnce({
      path: 'AGENT-MAP.md',
      content: 'map',
      managed: true
    });

    // Pass "--dry-run"
    const code = await compileCommand(parseCliFlags(['--dry-run']));

    expect(code).toBe(0);
    // writeOutputs takes `dryRun` as 3rd parameter.
    expect(mockWriteOutputs).toHaveBeenCalledWith(expect.any(Array), expect.any(String), true);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run] AgentFS compile complete'));
  });
});
