import * as path from 'path';
import type { Capabilities, Options } from '@wdio/types';
import type { ObsidianCapabilityOptions } from 'wdio-obsidian-service';
import { captureE2EDiagnostics } from './tests/e2e/support/diagnostics';

type TestrunnerConfig = Options.Testrunner & Capabilities.WithRequestedTestrunnerCapabilities;

function formatHookError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error) ?? 'unknown error';
	} catch {
		return 'unknown error';
	}
}

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

	reporters: [
		'spec',
		['junit', {
			outputDir: path.resolve('tests/e2e/reports/junit'),
			outputFileFormat: ({ cid }: { cid: string }) => `wdio-${cid}.xml`,
		}],
	],

	mochaOpts: {
		ui: 'bdd',
		timeout: 90 * 1000,
	},

	waitforInterval: 250,
	waitforTimeout: 10 * 1000,

	logLevel: 'warn',

	async afterTest(test, _context, result) {
		if (result.passed) return;

		try {
			await captureE2EDiagnostics(test, result);
		} catch (error) {
			console.warn(`Failed to capture E2E diagnostics: ${formatHookError(error)}`);
		}
	},

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
