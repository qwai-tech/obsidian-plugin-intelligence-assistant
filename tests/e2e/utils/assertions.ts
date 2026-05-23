/**
 * Shared E2E assertion helpers.
 */
import { expect } from '@wdio/globals';

/** Assert an element exists and is displayed. */
export async function assertVisible(selector: string): Promise<void> {
	const el = await $(selector);
	await expect(el).toBeDisplayed();
}

/** Assert an element has the expected text content. */
export async function assertText(selector: string, expected: string): Promise<void> {
	const el = await $(selector);
	await expect(el).toHaveText(expected);
}

/** Assert an element's value (for inputs). */
export async function assertValue(selector: string, expected: string): Promise<void> {
	const el = await $(selector);
	await expect(el).toHaveValue(expected);
}

/** Wait for an element to appear, then assert it exists. */
export async function waitForElement(selector: string, timeout = 10_000): Promise<WebdriverIO.Element> {
	const el = await $(selector);
	await el.waitForDisplayed({ timeout });
	return el;
}

/** Assert a button is enabled (not disabled). */
export async function assertEnabled(selector: string): Promise<void> {
	const el = await $(selector);
	await expect(el).toBeEnabled();
}
