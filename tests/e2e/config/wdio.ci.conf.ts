/**
 * CI E2E config — mocked LLM, mocked MCP subprocess, real persistence.
 * No API keys required; runs offline.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { baseConfig } from '../../../wdio.conf';
import { resetVaultTemplate } from '../support/vault-fixture';

export const config: Options.Testrunner = {
	...baseConfig,

	specs: [path.resolve('tests/e2e/specs/**/*.spec.ts')],

	exclude: [
		...(baseConfig.exclude ?? []),
		path.resolve('tests/e2e/specs/release/**'),
	],

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
	},

	async onPrepare() {
		await resetVaultTemplate();
	},
};
