import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';

// Define a stable mock for inquirer
const promptMock = jest.fn<any>();
jest.unstable_mockModule('inquirer', () => ({
  default: { prompt: promptMock },
}));

// Import module after mock configuration for ESM
const { onboardCommand } = await import('../src/commands/onboard.js');
const { parseCliFlags } = await import('../src/utils/cli-flags.js');

describe('agentfs onboard', () => {

  let tmpVault: string;
  let cwdSpy: any;
  let stdoutSpy: any;
  let stderrSpy: any;

  beforeEach(async () => {
    // Setup temporary vault
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-onboard-'));
    
    // Spy on process methods to suppress output and redirect cwd
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tmpVault);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    
    // Reset inquirer mock
    jest.clearAllMocks();
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    
    // Cleanup temporary vault
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  test('fails if manifest is missing', async () => {
    const code = await onboardCommand(parseCliFlags([]));
    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No AgentFS vault found'));
  });

  test('runs full interview and creates files cleanly', async () => {
    // 1. Setup manifest
    await fs.mkdir(path.join(tmpVault, '.agentos'), { recursive: true });
    const manifestYaml = `
version: "1.0"
vault:
  name: "Test Vault"
  owner: "Alice"
profile: personal
paths:
  tmp: Inbox/
  daily: Daily/
agents:
  primary: claude
    `;
    await fs.writeFile(path.join(tmpVault, '.agentos', 'manifest.yaml'), manifestYaml);

    // 2. Mock inquirer answers
    promptMock.mockResolvedValueOnce({
      name: 'Alice Cooper',
      role: 'Platform Engineer',
      style: 'direct and technical',
      techStack: 'Kubernetes, Go',
      neverDo: 'no emojis',
      preferences: 'use spaces not tabs',
    });

    // 3. Run command
    const code = await onboardCommand(parseCliFlags([]));
    expect(code).toBe(0);

    // 4. Verify identity file
    const identityPath = path.join(tmpVault, '.agentos', 'init.d', '00-identity.md');
    const identityContent = await fs.readFile(identityPath, 'utf8');
    
    expect(identityContent).toContain('- Name: Alice Cooper');
    expect(identityContent).toContain('- Role: Platform Engineer');
    expect(identityContent).toContain('- Style: direct and technical');
    // It should include the paths generated from the manifest
    expect(identityContent).toContain('- tmp → Inbox/');
    expect(identityContent).toContain('<!-- custom -->');

    // 5. Verify semantic memory
    const semanticPath = path.join(tmpVault, '.agentos', 'memory', 'semantic.md');
    const semanticContent = await fs.readFile(semanticPath, 'utf8');

    // Expected lines
    expect(semanticContent).toContain('FACT: [active] role is Platform Engineer');
    expect(semanticContent).toContain('FACT: [active] primary stack is Kubernetes, Go');
    expect(semanticContent).toContain('PREF: communication style: direct and technical');
    expect(semanticContent).toContain('AVOID: no emojis');
    expect(semanticContent).toContain('PREF: use spaces not tabs');
  });

  test('preserves custom sections in identity file', async () => {
    // Setup manifest and an existing identity file with custom content
    await fs.mkdir(path.join(tmpVault, '.agentos', 'init.d'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos', 'manifest.yaml'), 'version: "1.0"\nvault:\n  owner: "Bob"\npaths: {}');

    const existingIdentity = `# Agent Identity\n\n<!-- custom -->\n## My Secret Rule\nDo not break testing.`;
    await fs.writeFile(path.join(tmpVault, '.agentos', 'init.d', '00-identity.md'), existingIdentity);

    promptMock.mockResolvedValueOnce({
      name: 'Bob',
      role: '',
      style: '',
      techStack: '',
      neverDo: '',
      preferences: '',
    });

    await onboardCommand(parseCliFlags([]));

    // Check that custom content is preserved
    const updatedIdentity = await fs.readFile(path.join(tmpVault, '.agentos', 'init.d', '00-identity.md'), 'utf8');
    expect(updatedIdentity).toContain('<!-- custom -->');
    expect(updatedIdentity).toContain('## My Secret Rule\nDo not break testing.');
    expect(updatedIdentity).toContain('- Name: Bob'); // Auto-generated section included too
  });

  test('deduplicates semantic memory and avoids redundant appending', async () => {
    // Setup manifest
    await fs.mkdir(path.join(tmpVault, '.agentos', 'memory'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos', 'manifest.yaml'), 'version: "1.0"\nvault:\n  owner: "Charlie"\npaths: {}');

    // Pre-seed memory with existing entries (should not be duplicated)
    await fs.writeFile(
      path.join(tmpVault, '.agentos', 'memory', 'semantic.md'), 
      '# Semantic Memory\n\nFACT: [active] role is Developer\n'
    );

    promptMock.mockResolvedValueOnce({
      name: 'Charlie',
      role: 'Developer',   // Already exists
      style: '',
      techStack: 'Node.js', // New
      neverDo: '',
      preferences: '',
    });

    await onboardCommand(parseCliFlags([]));

    const semanticContent = await fs.readFile(path.join(tmpVault, '.agentos', 'memory', 'semantic.md'), 'utf8');
    
    // Should have appended techStack
    expect(semanticContent).toContain('FACT: [active] primary stack is Node.js');
    
    // Should only have "role is Developer" once
    const matches = semanticContent.match(/role is Developer/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1); // Deduplicated correctly
  });

  test('handles blank answers by skipping entries', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos', 'manifest.yaml'), 'version: "1.0"\nvault:\n  owner: "Blank User"\npaths: {}');

    promptMock.mockResolvedValueOnce({
      name: 'Blank User',
      role: '   ',       // whitespace only
      style: '',
      techStack: '',
      neverDo: '',
      preferences: '',
    });

    await onboardCommand(parseCliFlags([]));

    const semanticPath = path.join(tmpVault, '.agentos', 'memory', 'semantic.md');
    // Since everything but name is blank, we shouldn't have created the explicit semantic.md from properties, or it'll be empty.
    let created = false;
    try {
      await fs.stat(semanticPath);
      created = true;
    } catch {}
    
    // Actually the function creates the semantic path directory anyway if derivation is valid? 
    // Wait, let's just assert our answers array was filtered. If filtered array is empty, it shouldn't even append anything.
    if (created) {
      const content = await fs.readFile(semanticPath, 'utf8');
      expect(content).not.toContain('FACT:');
      expect(content).not.toContain('PREF:');
    } else {
      expect(created).toBe(false);
    }
  });
});
