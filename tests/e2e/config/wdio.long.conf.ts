/**
 * Long-running endurance config — real LLM, single Obsidian session, no retries,
 * very long mocha timeout. Runs ONLY the opt-in long-task endurance spec.
 * Usage: RUN_LONG_TASK=1 + release LLM env, then:
 *   npx wdio run tests/e2e/config/wdio.long.conf.ts
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { config as releaseConfig } from './wdio.release.conf';

export const config: Options.Testrunner = {
	...releaseConfig,
	specs: [path.resolve('tests/e2e/specs/release/long-task.spec.ts')],
	// One continuous endurance run — never retry a 20+ minute spec.
	specFileRetries: 0,
	mochaOpts: {
		ui: 'bdd',
		timeout: 30 * 60 * 1000,
	},
};
