/**
 * Test helper utilities
 */

import { testConfig } from '../config/test-config';

/**
 * Check if provider is configured for testing
 */
export function hasProvider(): boolean {
	return testConfig.hasProvider();
}

/**
 * Get provider configuration
 */
export function getProviderConfig() {
	return testConfig.providerConfig;
}

/**
 * Skip test if no provider is configured
 */
export function skipWithoutProvider(testFn: () => void) {
	if (hasProvider()) {
		testFn();
	} else {
		it.skip('Test requires LLM provider configuration', () => {});
	}
}

/**
 * Conditional test that only runs with provider
 */
export function testWithProvider(name: string, testFn: () => void | Promise<void>) {
	if (hasProvider()) {
		it(name, testFn);
	} else {
		it.skip(`${name} (requires provider)`, () => {});
	}
}

/**
 * Wait with exponential backoff
 */
export async function waitWithBackoff(
	condition: () => Promise<boolean>,
	maxAttempts: number = 5,
	initialDelay: number = 1000
): Promise<boolean> {
	let delay = initialDelay;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (await condition()) {
			return true;
		}

		await browser.pause(delay);
		delay *= 2; // Exponential backoff
	}

	return false;
}

/**
 * Take screenshot with timestamp
 */
export async function takeScreenshot(name: string) {
	const timestamp = Date.now();
	const filename = `${name}-${timestamp}.png`;
	await browser.saveScreenshot(`./test-results/screenshots/${filename}`);
	return filename;
}

/**
 * Assert element exists
 */
export async function assertExists(selector: string, message?: string) {
	const element = await $(selector);
	const exists = await element.isExisting();
	expect(exists).toBe(true);
	if (message && !exists) {
		throw new Error(message);
	}
}

/**
 * Assert element is displayed
 */
export async function assertDisplayed(selector: string, message?: string) {
	const element = await $(selector);
	const displayed = await element.isDisplayed();
	expect(displayed).toBe(true);
	if (message && !displayed) {
		throw new Error(message);
	}
}
