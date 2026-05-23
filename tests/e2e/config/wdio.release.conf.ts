/**
 * Release E2E config — real LLM + real MCP subprocess.
 * Requires .env.test with E2E_TEST_PROVIDER, E2E_TEST_API_KEY, E2E_TEST_MODEL.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate, seedReleaseProvider } from '../support/vault-fixture';

export const config: Options.Testrunner = {
	...baseConfig,

	specs: [path.resolve('tests/e2e/specs/release/**/*.spec.ts')],

	mochaOpts: {
		ui: 'bdd',
		timeout: 180 * 1000,
	},

	async onPrepare() {
		await resetVaultTemplate();
		await seedReleaseProvider();
	},
};
