/**
 * wdio config for promotional screenshot capture.
 * Extends base config — adds --start-fullscreen so Obsidian fills the entire screen.
 */
import * as path from 'path';
import type { Options } from '@wdio/types';
import { config as base } from './wdio.conf';
import { setupTestVault, cleanupTestVault } from './tests/e2e/config/setup';

const cacheDir = path.resolve('.obsidian-cache');
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';

export const config: Options.Testrunner = {
	...base,
	specs: ['./tests/e2e/specs/screenshots/promotional-screenshots.spec.ts'],

	// Full-screen window so screenshots fill the entire display
	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: obsidianVersion,
				installerVersion: obsidianVersion,
				plugins: ['.'],
				vault: 'tests/e2e/test-vault',
			},
			'goog:chromeOptions': {
				// --start-fullscreen triggers macOS native full-screen (hides menu bar,
				// fills 100% of display area) — ideal for promotional screenshots
				args: ['--start-fullscreen'],
			},
		},
	],

	cacheDir,

	onPrepare: async function () {
		await setupTestVault();
	},

	onComplete: async function () {
		await cleanupTestVault();
	},
};
