import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { generateCompanyProfile, generateSharedProfile } from '../src/generators/profiles.js';
import { doctorCommand, triageCommand, migrateCommand } from '../src/commands/doctor.js';

describe('epics 11-12', () => {
  let tmpVault: string;
  let origCwd: string;
  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-e11-12-'));
    origCwd = process.cwd();
    process.chdir(tmpVault);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('company profile generates team dirs and RBAC', async () => {
    const created = await generateCompanyProfile(tmpVault);
    expect(created).toContain('Teams');
    expect(created).toContain('Decisions');
    expect(created).toContain('Postmortems');
    expect(created).toContain('.agentos/rbac/roles.yaml');
    expect(created).toContain('.agentos/rbac/policies.yaml');

    const roles = await fs.readFile(path.join(tmpVault, '.agentos/rbac/roles.yaml'), 'utf8');
    expect(roles).toContain('admin');
    expect(roles).toContain('developer');
  });

  test('shared profile generates per-user spaces', async () => {
    const created = await generateSharedProfile(tmpVault, ['alice', 'bob']);
    expect(created).toContain('Shared/Projects');
    expect(created).toContain('Shared/Knowledge');
    expect(created).toContain('Spaces/alice');
    expect(created).toContain('Spaces/bob');
    expect(created).toContain('.agentos/users/alice.yaml');

    const aliceConfig = await fs.readFile(
      path.join(tmpVault, '.agentos/users/alice.yaml'), 'utf8'
    );
    expect(aliceConfig).toContain('alice');
  });

  test('doctor reports missing .agentos', async () => {
    const code = await doctorCommand([]);
    expect(code).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  test('doctor reports healthy vault', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos/init.d'), { recursive: true });
    await fs.mkdir(path.join(tmpVault, '.agentos/memory'), { recursive: true });
    await fs.writeFile(path.join(tmpVault, '.agentos/manifest.yaml'), 'version: "1.0"\n');

    const code = await doctorCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('All checks passed'));
  });

  test('triage with no inbox', async () => {
    const code = await triageCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('No Inbox'));
  });

  test('triage with empty inbox', async () => {
    await fs.mkdir(path.join(tmpVault, 'Inbox'));
    const code = await triageCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('empty'));
  });

  test('triage suggests folders for inbox files', async () => {
    await fs.mkdir(path.join(tmpVault, 'Inbox'));
    await fs.writeFile(path.join(tmpVault, 'Inbox/project-notes.md'), 'Notes about project sprint');
    await fs.writeFile(path.join(tmpVault, 'Inbox/2026-04-04.md'), 'Daily standup');

    const code = await triageCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('project-notes.md'));
  });

  test('migrate reports already migrated vault', async () => {
    await fs.mkdir(path.join(tmpVault, '.agentos'));
    const code = await migrateCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('already has .agentos'));
  });

  test('migrate analyzes unmigrated vault', async () => {
    await fs.writeFile(path.join(tmpVault, 'notes.md'), '# Notes');
    const code = await migrateCommand([]);
    expect(code).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Migration Analysis'));
  });
});
