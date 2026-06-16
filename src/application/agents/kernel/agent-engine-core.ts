/**
 * Internal import boundary for the AgentEngine kernel.
 *
 * Consumes the public npm package @agentic-kernel/core (Apache-2.0), which
 * superseded the in-repo vendored snapshot. Keeping the boundary as a one-line
 * re-export means call sites keep importing from a stable local path.
 */
export * from '@agentic-kernel/core';
