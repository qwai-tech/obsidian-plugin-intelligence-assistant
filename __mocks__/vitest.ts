/**
 * vitest -> jest shim.
 *
 * `@agentic-kernel/conformance` ships its contract suites importing the test
 * primitives from `vitest`. This project runs on jest, whose `describe`/`it`/
 * `expect` are API-compatible for the matchers the contracts use
 * (`resolves`/`rejects`/`toMatchObject`/`toContainEqual`/`toBeGreaterThan`/
 * `toHaveLength`/`toEqual`). Mapped in via jest `moduleNameMapper`.
 */
import { describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

export { describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach };
export const vi = undefined;
