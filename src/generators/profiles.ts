/**
 * Company & Shared profile generators — Epic 11.
 *
 * Story 11.1: Company profile with team directories and RBAC
 * Story 11.2: Shared profile with per-user spaces
 *
 * @module generators/profiles
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Generate company profile directories and RBAC scaffolding.
 *
 * @param vaultRoot - Vault root path
 */
export async function generateCompanyProfile(
  vaultRoot: string,
): Promise<string[]> {
  const dirs = [
    'Teams',
    'Decisions',
    'Postmortems',
    'Projects',
    'Resources',
    'Archive',
    '.agentos/rbac',
  ];

  const created: string[] = [];
  for (const dir of dirs) {
    await fs.mkdir(path.join(vaultRoot, dir), { recursive: true });
    created.push(dir);
  }

  // Generate RBAC files
  const rolesYaml = `# RBAC Roles — Company Profile
version: "1.0"
roles:
  admin:
    description: Full access to all vault areas
    permissions: ["*"]
  developer:
    description: Access to projects and resources
    permissions: ["Projects/*", "Resources/*", "Daily/*"]
  viewer:
    description: Read-only access
    permissions: ["read:*"]
`;
  await fs.writeFile(path.join(vaultRoot, '.agentos/rbac/roles.yaml'), rolesYaml, 'utf8');
  created.push('.agentos/rbac/roles.yaml');

  const policiesYaml = `# RBAC Policies — Company Profile
version: "1.0"
policies:
  - role: admin
    users: []
  - role: developer
    users: []
  - role: viewer
    users: []
`;
  await fs.writeFile(path.join(vaultRoot, '.agentos/rbac/policies.yaml'), policiesYaml, 'utf8');
  created.push('.agentos/rbac/policies.yaml');

  return created;
}

/**
 * Generate shared profile with per-user spaces.
 *
 * @param vaultRoot - Vault root path
 * @param users     - List of user names
 */
export async function generateSharedProfile(
  vaultRoot: string,
  users: string[] = ['default'],
): Promise<string[]> {
  const created: string[] = [];

  // Shared directories
  const sharedDirs = [
    'Shared/Projects',
    'Shared/Knowledge',
    'Shared/Templates',
  ];
  for (const dir of sharedDirs) {
    await fs.mkdir(path.join(vaultRoot, dir), { recursive: true });
    created.push(dir);
  }

  // Per-user spaces
  await fs.mkdir(path.join(vaultRoot, '.agentos/users'), { recursive: true });

  for (const user of users) {
    const userDir = `Spaces/${user}`;
    await fs.mkdir(path.join(vaultRoot, userDir, 'Daily'), { recursive: true });
    await fs.mkdir(path.join(vaultRoot, userDir, 'Inbox'), { recursive: true });
    created.push(userDir);

    const userConfig = `# User: ${user}\nname: ${user}\nrole: developer\n`;
    await fs.writeFile(
      path.join(vaultRoot, `.agentos/users/${user}.yaml`),
      userConfig,
      'utf8'
    );
    created.push(`.agentos/users/${user}.yaml`);
  }

  return created;
}
