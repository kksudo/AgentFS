/**
 * AgentFS public API barrel.
 *
 * Re-exports everything from the CLI entry point so that the package can also
 * be used programmatically:
 *
 * ```ts
 * import { main, VERSION } from 'create-agentfs';
 * const code = await main(['node', 'agentfs', 'status']);
 * ```
 */
export { main, VERSION } from './cli.js';
export type { Subcommand } from './cli.js';
