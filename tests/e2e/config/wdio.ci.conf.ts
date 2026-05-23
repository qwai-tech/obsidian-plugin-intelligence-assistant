/**
 * CI E2E test configuration.
 * Uses mock AI responses — no real API calls, no API keys needed.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { config as baseConfig } from '../../../wdio.conf';

const cacheDir = path.resolve('.obsidian-cache');
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';

export const config: Options.Testrunner = {
	...baseConfig,

	specs: [path.resolve('tests/e2e/specs/ci/**/*.spec.ts')],

	exclude: [
		path.resolve('tests/e2e/fixtures/**'),
		path.resolve('tests/e2e/utils/**'),
		path.resolve('tests/e2e/config/**'),
		path.resolve('tests/e2e/mocks/**'),
		path.resolve('tests/e2e/pages/**'),
	],

	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: obsidianVersion,
				installerVersion: obsidianVersion,
				plugins: ['.'],
				vault: path.resolve('tests/e2e/test-vault'),
			},
		},
	],

	logLevel: 'warn',

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
	},

	/**
	 * Inject mock AI intercepts before tests start.
	 */
	onPrepare: async function () {
		if (baseConfig.onPrepare) {
			await baseConfig.onPrepare();
		}
	},

	onComplete: async function () {
		if (baseConfig.onComplete) {
			await baseConfig.onComplete();
		}
	},
};
