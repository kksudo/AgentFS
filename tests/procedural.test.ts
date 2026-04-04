import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  writeProceduralEntry,
  readProceduralEntry,
  listProceduralSkills,
  slugify,
} from '../src/memory/procedural.js';

describe('memory/procedural', () => {
  let tmpVault: string;

  beforeEach(async () => {
    tmpVault = await fs.mkdtemp(path.join(os.tmpdir(), 'agentfs-procedural-'));
  });

  afterEach(async () => {
    await fs.rm(tmpVault, { recursive: true, force: true });
  });

  describe('slugify', () => {
    test('lowercases and replaces spaces with hyphens', () => {
      expect(slugify('Deploy Kubernetes')).toBe('deploy-kubernetes');
    });

    test('strips special characters', () => {
      expect(slugify('CI/CD Pipeline!')).toBe('cicd-pipeline');
    });

    test('handles empty string', () => {
      expect(slugify('')).toBe('');
    });
  });

  test('creates a new procedural skill file', async () => {
    await writeProceduralEntry(tmpVault, {
      name: 'Deploy K8s',
      description: 'How to deploy to Kubernetes',
      steps: ['Build image', 'Push to registry', 'Apply manifests'],
      context: 'Production cluster',
    });

    const content = await readProceduralEntry(tmpVault, 'Deploy K8s');
    expect(content).not.toBeNull();
    expect(content).toContain('# Deploy K8s');
    expect(content).toContain('How to deploy to Kubernetes');
    expect(content).toContain('1. Build image');
    expect(content).toContain('2. Push to registry');
    expect(content).toContain('3. Apply manifests');
    expect(content).toContain('Production cluster');
  });

  test('overwrites existing skill file on re-write', async () => {
    await writeProceduralEntry(tmpVault, {
      name: 'Test Skill',
      description: 'Version 1',
      steps: ['Step A'],
      context: '',
    });

    await writeProceduralEntry(tmpVault, {
      name: 'Test Skill',
      description: 'Version 2',
      steps: ['Step B', 'Step C'],
      context: 'Updated context',
    });

    const content = await readProceduralEntry(tmpVault, 'Test Skill');
    expect(content).not.toBeNull();
    expect(content).toContain('Version 2');
    expect(content).not.toContain('Version 1');
    expect(content).toContain('Step B');
  });

  test('returns null for non-existent skill', async () => {
    const content = await readProceduralEntry(tmpVault, 'nonexistent');
    expect(content).toBeNull();
  });

  test('listProceduralSkills returns sorted skill names', async () => {
    await writeProceduralEntry(tmpVault, {
      name: 'Zebra Skill',
      description: 'Z',
      steps: [],
      context: '',
    });
    await writeProceduralEntry(tmpVault, {
      name: 'Alpha Skill',
      description: 'A',
      steps: [],
      context: '',
    });

    const skills = await listProceduralSkills(tmpVault);
    expect(skills).toEqual(['alpha-skill', 'zebra-skill']);
  });

  test('listProceduralSkills returns empty array if directory missing', async () => {
    const skills = await listProceduralSkills(tmpVault);
    expect(skills).toEqual([]);
  });
});
