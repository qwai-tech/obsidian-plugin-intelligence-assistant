/**
 * Release E2E test configuration.
 * Uses real AI API calls — requires .env.test with API keys.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { config as baseConfig } from '../../../wdio.conf';

const cacheDir = path.resolve('.obsidian-cache');
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';

export const config: Options.Testrunner = {
	...baseConfig,

	specs: ['./tests/e2e/specs/release/**/*.spec.ts'],

	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: obsidianVersion,
				installerVersion: obsidianVersion,
				plugins: ['.'],
				vault: 'tests/e2e/test-vault',
			},
		},
	],

	logLevel: 'info',

	mochaOpts: {
		ui: 'bdd',
		timeout: 180 * 1000, // 3 minutes for real AI
	},

	onPrepare: async function () {
		// Verify that API keys are available
		const envTestPath = path.resolve('.env.test');
		const fs = await import('fs');
		if (!fs.existsSync(envTestPath)) {
			console.warn('WARNING: .env.test not found. Real API calls may fail.');
		}
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
