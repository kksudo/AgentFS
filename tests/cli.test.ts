import { jest } from '@jest/globals';

const mockPrint = jest.fn<any>((line: string) => {});
const mockPrintErr = jest.fn<any>((line: string) => {});
const mockCompileCommand = jest.fn<any>().mockResolvedValue(0);
const mockOnboardCommand = jest.fn<any>().mockResolvedValue(0);
const mockRunSetupPrompts = jest.fn<any>();
const mockCreateDefaultAnswers = jest.fn<any>().mockReturnValue({ targetDir: 'def' });
const mockScaffold = jest.fn<any>().mockResolvedValue({ details: {} });
const mockFormatScaffoldSummary = jest.fn<any>().mockReturnValue('scaffold_summary');

jest.unstable_mockModule('../src/commands/compile.js', () => ({
  compileCommand: mockCompileCommand
}));

jest.unstable_mockModule('../src/commands/onboard.js', () => ({
  onboardCommand: mockOnboardCommand
}));

jest.unstable_mockModule('../src/generators/prompts.js', () => ({
  runSetupPrompts: mockRunSetupPrompts,
  createDefaultAnswers: mockCreateDefaultAnswers
}));

jest.unstable_mockModule('../src/generators/scaffold.js', () => ({
  scaffold: mockScaffold,
  formatScaffoldSummary: mockFormatScaffoldSummary
}));

// We must bypass process.stdout.write BEFORE we import CLI, but 
// since in cli.ts `print` is locally scoped, we spy on process.stdout and process.stderr directly.
const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

const { main, VERSION } = await import('../src/cli.js');

describe('agentfs cli', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('prints version when --version is given', async () => {
    const code = await main(['node', 'cli.js', '--version']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(VERSION + '\n');
  });

  test('prints usage when --help is given', async () => {
    const code = await main(['node', 'cli.js', '--help']);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  test('prints error for unknown subcommand', async () => {
    const code = await main(['node', 'cli.js', 'unknown_cmd']);
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("unknown subcommand 'unknown_cmd'"));
  });

  test('dispatches to compile command', async () => {
    const code = await main(['node', 'cli.js', 'compile', '--some-flag']);
    expect(mockCompileCommand).toHaveBeenCalledWith(['--some-flag']);
    expect(code).toBe(0);
  });

  test('dispatches to onboard command', async () => {
    const code = await main(['node', 'cli.js', 'onboard']);
    expect(mockOnboardCommand).toHaveBeenCalledWith([]);
    expect(code).toBe(0);
  });

  test('runs interactive scaffold when no args are provided', async () => {
    mockRunSetupPrompts.mockResolvedValueOnce({ profile: 'company', targetDir: '/tmp' });
    const code = await main(['node', 'cli.js']);
    expect(mockRunSetupPrompts).toHaveBeenCalledWith(process.cwd());
    expect(mockScaffold).toHaveBeenCalledWith({ profile: 'company', targetDir: '/tmp' });
    expect(stdoutSpy).toHaveBeenCalledWith('scaffold_summary\n');
    expect(code).toBe(0);
  });

  test('runs interactive scaffold with init alias', async () => {
    mockRunSetupPrompts.mockResolvedValueOnce({ profile: 'company', targetDir: '/tmp' });
    const code = await main(['node', 'cli.js', 'init']);
    expect(mockRunSetupPrompts).toHaveBeenCalledWith(process.cwd());
    expect(mockScaffold).toHaveBeenCalledWith({ profile: 'company', targetDir: '/tmp' });
    expect(code).toBe(0);
  });

  test('runs non-interactive scaffold with --non-interactive flag', async () => {
    mockCreateDefaultAnswers.mockReturnValueOnce({ generated: true });

    // Non-interactive mode now goes through resolveSetupAnswers → createDefaultAnswers
    const code = await main(['node', 'cli.js', '--non-interactive']);

    expect(mockScaffold).toHaveBeenCalled();
    expect(code).toBe(0);
  });

  test('runs non-interactive scaffold with positional target dir', async () => {
    mockCreateDefaultAnswers.mockReturnValueOnce({ positional: true });

    const code = await main(['node', 'create-agentfs', 'my-vault', '--non-interactive']);

    expect(mockScaffold).toHaveBeenCalled();
    expect(code).toBe(0);
  });

  test('handles scaffold errors gracefully', async () => {
    mockRunSetupPrompts.mockResolvedValueOnce({ targetDir: '/fail' });
    mockScaffold.mockRejectedValueOnce(new Error('Permission denied'));
    
    const code = await main(['node', 'cli.js']); // Interactive mode but mockScaffold will throw
    
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Scaffolding failed: Permission denied'));
  });
  
  test('dispatches to memory command (no longer a stub)', async () => {
    const code = await main(['node', 'cli.js', 'memory']);
    expect(code).toBe(0);
    // memory with no args prints usage
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: agentfs memory'));
  });
});
