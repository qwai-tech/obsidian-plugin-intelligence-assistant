import * as path from 'path';
import type { Capabilities, Options } from '@wdio/types';
import type { ObsidianCapabilityOptions } from 'wdio-obsidian-service';

type TestrunnerConfig = Options.Testrunner & Capabilities.WithRequestedTestrunnerCapabilities;

const cacheDir = path.resolve('.obsidian-cache');
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';
const obsidianOptions: ObsidianCapabilityOptions = {
	appVersion: obsidianVersion,
	installerVersion: obsidianVersion,
	plugins: [path.resolve('.')],
	vault: path.resolve('tests/e2e/test-vault'),
};

/**
 * Base WDIO config shared by the CI and Release suites.
 * Per-suite configs supply `specs`, `onPrepare`, `onComplete`, and
 * any suite-specific timeouts.
 */
export const baseConfig: TestrunnerConfig = {
	runner: 'local',
	framework: 'mocha',

	exclude: [
		path.resolve('tests/e2e/fixtures/**'),
		path.resolve('tests/e2e/support/**'),
		path.resolve('tests/e2e/pages/**'),
		path.resolve('tests/e2e/config/**'),
	],

	maxInstances: 1,

	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': obsidianOptions,
		},
	],

	services: ['obsidian'],

	reporters: ['spec'],

	mochaOpts: {
		ui: 'bdd',
		timeout: 90 * 1000,
	},

	waitforInterval: 250,
	waitforTimeout: 10 * 1000,

	logLevel: 'warn',

	cacheDir,

	tsConfigPath: 'tsconfig.json',
};

// Default export so `wdio run wdio.conf.ts` fails fast rather than silently
// picking up the base config and running zero specs.
export const config: TestrunnerConfig = {
	...baseConfig,
	specs: [],
	onPrepare() {
		throw new Error(
			'Do not run wdio.conf.ts directly. Use:\n' +
			'  npm run test:e2e:ci\n' +
			'  npm run test:e2e:release'
		);
	},
};
