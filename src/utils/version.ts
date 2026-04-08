/**
 * Centralized CLI version — read from package.json at runtime.
 *
 * Single source of truth for the CLI version string.
 * Import this instead of duplicating createRequire + package.json reads.
 *
 * @module utils/version
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

/** CLI version string, e.g. "0.1.4" */
export const CLI_VERSION = pkg.version;
