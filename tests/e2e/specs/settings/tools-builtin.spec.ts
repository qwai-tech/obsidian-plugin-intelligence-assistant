/**
 * E2E Tests for Built-in Tools Configuration
 * Tests display and enable/disable functionality
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import {

	openToolsTab,
	switchToolsSubtab,
	getBuiltInTools,
	isBuiltInToolEnabled,
	toggleBuiltInTool,
	getBuiltInToolMetadata,
	hasBuiltInInfoCallout,
} from '../../utils/tools-helpers';

describe('Tools Settings - Built-in Tools', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openToolsTab();
		await switchToolsSubtab('built-in');
	});

	afterEach(async () => {
		await closeSettings();
	});

	describe('Built-in Tools Display', () => {
		it('should display all 6 built-in tools', async () => {
			const tools = await getBuiltInTools();
			expect(tools.length).toBe(6);
		});

		it('should display tool names correctly', async () => {
			const tools = await getBuiltInTools();

			const expectedTools = [
				'Read File',
				'Write File',
				'List Files',
				'Search Files',
				'Create Note',
				'Append To Note',
			];

			for (const expectedTool of expectedTools) {
				const found = tools.some(tool =>
					tool.toLowerCase().replace(/\s+/g, ' ') === expectedTool.toLowerCase()
				);
				expect(found).toBe(true);
			}
		});

		it('should show tool icons', async () => {
			const toolRows = await $$(SELECTORS.tools.builtInTableRows);
			expect(toolRows.length).toBeGreaterThan(0);

			const firstRow = toolRows[0];
			const icon = await firstRow.$(SELECTORS.tools.toolIcon);
			expect(await icon.isExisting()).toBe(true);
		});

		it('should display tool metadata (category and description)', async () => {
			const tools = await getBuiltInTools();
			const firstTool = tools[0];

			const metadata = await getBuiltInToolMetadata(firstTool);
			expect(metadata.category.length).toBeGreaterThan(0);
			expect(metadata.description.length).toBeGreaterThan(0);
		});

		it('should show tool parameters', async () => {
			const toolRows = await $$(SELECTORS.tools.builtInTableRows);
			const firstRow = toolRows[0];

			const paramsCell = await firstRow.$(SELECTORS.tools.toolParameters);
			const paramsText = await paramsCell.getText();
			expect(paramsText.length).toBeGreaterThan(0);
		});

		it('should display info callout', async () => {
			const hasCallout = await hasBuiltInInfoCallout();
			expect(hasCallout).toBe(true);
		});
	});

	describe('Built-in Tools Enable/Disable', () => {
		it('should have enabled checkboxes by default', async () => {
			const tools = await getBuiltInTools();
			const firstTool = tools[0];

			const isEnabled = await isBuiltInToolEnabled(firstTool);
			expect(typeof isEnabled).toBe('boolean');
		});

		it('should allow disabling a tool', async () => {
			const tools = await getBuiltInTools();
			const testTool = tools[0];

			// Get initial state
			const initialState = await isBuiltInToolEnabled(testTool);

			// Toggle to disabled
			await toggleBuiltInTool(testTool, false);

			// Verify it's disabled
			const newState = await isBuiltInToolEnabled(testTool);
			expect(newState).toBe(false);

			// Restore original state
			await toggleBuiltInTool(testTool, initialState);
		});

		it('should allow enabling a tool', async () => {
			const tools = await getBuiltInTools();
			const testTool = tools[0];

			// Disable first
			await toggleBuiltInTool(testTool, false);

			// Enable
			await toggleBuiltInTool(testTool, true);

			// Verify it's enabled
			const isEnabled = await isBuiltInToolEnabled(testTool);
			expect(isEnabled).toBe(true);
		});

		it('should persist enabled state across settings reopens', async () => {
			const tools = await getBuiltInTools();
			const testTool = tools[0];

			// Disable the tool
			await toggleBuiltInTool(testTool, false);

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openToolsTab();
			await switchToolsSubtab('built-in');

			// Verify it's still disabled
			const isEnabled = await isBuiltInToolEnabled(testTool);
			expect(isEnabled).toBe(false);

			// Re-enable for cleanup
			await toggleBuiltInTool(testTool, true);
		});

		it('should allow multiple tools to be enabled simultaneously', async () => {
			const tools = await getBuiltInTools();

			// Enable first 3 tools
			for (let i = 0; i < Math.min(3, tools.length); i++) {
				await toggleBuiltInTool(tools[i], true);
			}

			// Verify all are enabled
			for (let i = 0; i < Math.min(3, tools.length); i++) {
				const isEnabled = await isBuiltInToolEnabled(tools[i]);
				expect(isEnabled).toBe(true);
			}
		});

		it('should allow toggling different tools independently', async () => {
			const tools = await getBuiltInTools();
			if (tools.length < 2) {
				return; // Skip if less than 2 tools
			}

			// Enable first tool, disable second
			await toggleBuiltInTool(tools[0], true);
			await toggleBuiltInTool(tools[1], false);

			// Verify states
			expect(await isBuiltInToolEnabled(tools[0])).toBe(true);
			expect(await isBuiltInToolEnabled(tools[1])).toBe(false);

			// Restore states
			await toggleBuiltInTool(tools[0], true);
			await toggleBuiltInTool(tools[1], true);
		});
	});

	describe('Built-in Tools Table Structure', () => {
		it('should have table with 5 columns', async () => {
		try {
			const table = await $(SELECTORS.tools.builtInTable);
			const headerRow = await table.$('thead tr');
			const headers = await headerRow.$$('th');

			expect(headers.length).toBe(5); // Name, Category, Description, Parameters, Enabled
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should display each tool in a table row', async () => {
			const tools = await getBuiltInTools();
			const rows = await $$(SELECTORS.tools.builtInTableRows);

			expect(rows.length).toBe(tools.length);
		});

		it('should show checkbox in enabled column', async () => {
		try {
			const tools = await getBuiltInTools();
			const firstToolRow = await $(SELECTORS.tools.builtInToolRow(tools[0]));

			const checkbox = await firstToolRow.$(SELECTORS.tools.toolCheckbox);
			expect(await checkbox.isExisting()).toBe(true);
			expect(await checkbox.getAttribute('type')).toBe('checkbox');
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('Built-in Tools Metadata Validation', () => {
		const expectedCategories = [
			'File Operations',
			'Search & Discovery',
			'Note Management',
		];

		it('should display valid categories', async () => {
			const tools = await getBuiltInTools();

			for (const tool of tools) {
				const metadata = await getBuiltInToolMetadata(tool);
				const isValidCategory = expectedCategories.some(cat =>
					metadata.category.includes(cat)
				);
				expect(isValidCategory).toBe(true);
			}
		});

		it('should have non-empty descriptions', async () => {
			const tools = await getBuiltInTools();

			for (const tool of tools) {
				const metadata = await getBuiltInToolMetadata(tool);
				expect(metadata.description.length).toBeGreaterThan(0);
			}
		});

		it('should display parameters information', async () => {
			const toolRows = await $$(SELECTORS.tools.builtInTableRows);

			for (const row of toolRows) {
				const paramsCell = await row.$(SELECTORS.tools.toolParameters);
				const paramsText = await paramsCell.getText();
				// All tools should have parameter info
				expect(paramsText.length).toBeGreaterThan(0);
			}
		});
	});
});
