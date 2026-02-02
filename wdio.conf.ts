import * as path from 'path';
import type { Options } from '@wdio/types';
import { setupTestVault, cleanupTestVault } from './tests/e2e/config/setup';

// wdio-obsidian-service will download Obsidian into this directory
const cacheDir = path.resolve('.obsidian-cache');

// Default to latest Obsidian version
const obsidianVersion = process.env.OBSIDIAN_VERSION || 'latest';

export const config: Options.Testrunner = {
	runner: 'local',
	framework: 'mocha',

	// Test specs
	specs: ['./tests/e2e/specs/**/*.spec.ts'],

	// Exclude utility files
	exclude: [
		'./tests/e2e/fixtures/**',
		'./tests/e2e/utils/**',
		'./tests/e2e/config/**',
	],

	// Run tests sequentially
	maxInstances: 1,

	// Capabilities for Obsidian testing
	capabilities: [
		{
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion: obsidianVersion,
				installerVersion: obsidianVersion,
				// Load this plugin into the test vault
				plugins: ['.'],
				// Use a test vault
				vault: 'tests/e2e/test-vault',
			},
		},
	],

	// Services
	services: ['obsidian'],

	// Reporters
	reporters: ['spec'],

	// Mocha options
	mochaOpts: {
		ui: 'bdd',
		timeout: 90 * 1000, // 90 seconds
	},

	// Timeouts
	waitforInterval: 250,
	waitforTimeout: 10 * 1000,

	// Logging
	logLevel: 'info',

	// Cache directory for Obsidian downloads
	cacheDir: cacheDir,

	// TypeScript compilation
	autoCompileOpts: {
		autoCompile: true,
		tsNodeOpts: {
			transpileOnly: true,
			project: 'tsconfig.json',
		},
	},

	/**
	 * Hook that runs once before all tests
	 * Used to configure test vault with provider settings
	 */
	onPrepare: async function () {
		await setupTestVault();
	},

	/**
	 * Hook that runs before each test
	 * REMOVED: Mock fetch was not working properly and blocking real API calls
	 * Tests now use real API calls configured in .env.test
	 */
	beforeTest: async function () {
		// No mock needed - tests use real API calls
	},

	/**
	 * Hook that runs once after all tests complete
	 */
	onComplete: async function () {
		await cleanupTestVault();
	},

	/**
	 * Hook that runs after each test
	 * Catches and handles errors from missing features
	 * DISABLED: Let tests fail naturally so we can fix them properly
	 */
	afterTest: async function (test, context, { error, result, duration, passed, retries }) {
		// Disabled auto-pass logic to see real test failures
		// if (error && !passed) {
		// 	const errorMessage = error.message || '';
		// 	// Check if error is due to missing elements/features
		// 	if (
		// 		errorMessage.includes('element wasn\'t found') ||
		// 		errorMessage.includes('no such element') ||
		// 		errorMessage.includes('not displayed') ||
		// 		errorMessage.includes('not found') ||
		// 		errorMessage.includes('waitForDisplayed') ||
		// 		errorMessage.includes('Can\'t call')
		// 	) {
		// 		console.log(`⚠️  Test gracefully skipped: ${test.title}`);
		// 		console.log(`   Reason: Feature not available`);
		// 		// Mark test as passed
		// 		test.state = 'passed';
		// 		test.error = undefined;
		// 	}
		// }
	},
};
