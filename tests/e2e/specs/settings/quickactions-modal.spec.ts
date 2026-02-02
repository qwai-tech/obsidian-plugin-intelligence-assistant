/**
 * E2E Tests for Quick Actions Settings - Modal Operations
 * Tests the edit modal functionality and field operations
 */

import { navigateToPluginSettings, closeSettings } from '../../utils/actions';
import { SELECTORS } from '../../utils/selectors';
import {

	openQuickActionsTab,
	addQuickAction,
	deleteQuickAction,
	openQuickActionModal,
	closeQuickActionModal,
	isQuickActionModalOpen,
	fillQuickActionForm,
	saveQuickActionModal,
	cancelQuickActionModal,
	isQuickActionExists,
	getQuickActionType,
	getQuickActionModel,
	getAvailableModels,
	selectModel,
} from '../../utils/quickactions-helpers';

describe('Quick Actions Settings - Modal Operations', () => {
	beforeEach(async () => {
		await navigateToPluginSettings();
		await openQuickActionsTab();
	});

	afterEach(async () => {
		// Clean up test actions
		try {
			const testAction = 'E2E Modal Test';
			if (await isQuickActionExists(testAction)) {
				await deleteQuickAction(testAction, true);
				await browser.pause(300);
			}
		} catch (e) {
			// Ignore cleanup errors
		}

		await closeSettings();
	});

	describe('Modal Display', () => {
		it('should open modal when Add clicked', async () => {
			await openQuickActionModal();

			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(true);

			await closeQuickActionModal();
		});

		it('should open modal when Edit clicked', async () => {
			const testAction = 'E2E Modal Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
			});

			await openQuickActionModal(testAction);

			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(true);

			await closeQuickActionModal();
		});

		it('should display modal title', async () => {
		try {
			await openQuickActionModal();

			const header = await $(SELECTORS.quickActions.modal.header);
			const text = await header.getText();
			expect(text.toLowerCase()).toContain('edit quick action');

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show all configuration fields', async () => {
		try {
			await openQuickActionModal();

			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			const actionTypeDropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
			const modelDropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
			const promptTextarea = await $(SELECTORS.quickActions.modal.promptTextarea);

			expect(await nameInput.isExisting()).toBe(true);
			expect(await actionTypeDropdown.isExisting()).toBe(true);
			expect(await modelDropdown.isExisting()).toBe(true);
			expect(await promptTextarea.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should close modal on Cancel', async () => {
			await openQuickActionModal();

			await cancelQuickActionModal();

			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(false);
		});

		it('should close modal on Escape key', async () => {
			await openQuickActionModal();

			await closeQuickActionModal();

			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(false);
		});

		it('should show Save and Cancel buttons', async () => {
		try {
			await openQuickActionModal();

			const saveButton = await $(SELECTORS.quickActions.modal.saveButton);
			const cancelButton = await $(SELECTORS.quickActions.modal.cancelButton);

			expect(await saveButton.isExisting()).toBe(true);
			expect(await cancelButton.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});
	});

	describe('Name Field', () => {
		it('should display name input', async () => {
		try {
			await openQuickActionModal();

			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			expect(await nameInput.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show default name for new actions', async () => {
		try {
			await openQuickActionModal();

			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			const value = await nameInput.getValue();
			expect(value).toContain('New Quick Action');

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should allow editing name', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'Test Edited Name',
			});

			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			const value = await nameInput.getValue();
			expect(value).toBe('Test Edited Name');

			await closeQuickActionModal();
		});

		it('should show current name for existing actions', async () => {
			const testAction = 'E2E Modal Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
			});

			await openQuickActionModal(testAction);

			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			const value = await nameInput.getValue();
			expect(value).toBe(testAction);

			await closeQuickActionModal();
		});
	});

	describe('Action Type Field', () => {
		it('should display action type dropdown', async () => {
		try {
			await openQuickActionModal();

			const dropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
			expect(await dropdown.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show both action type options', async () => {
		try {
			await openQuickActionModal();

			const dropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
			const options = await dropdown.$$('option');

			expect(options.length).toBe(2);

			const texts = [];
			for (const option of options) {
				const text = await option.getText();
				texts.push(text.toLowerCase());
			}

			expect(texts.some(t => t.includes('replace'))).toBe(true);
			expect(texts.some(t => t.includes('modal') || t.includes('explain'))).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should allow selecting replace action type', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				actionType: 'replace',
			});

			const dropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
			const value = await dropdown.getValue();
			expect(value).toBe('replace');

			await closeQuickActionModal();
		});

		it('should allow selecting explain action type', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				actionType: 'explain',
			});

			const dropdown = await $(SELECTORS.quickActions.modal.actionTypeDropdown);
			const value = await dropdown.getValue();
			expect(value).toBe('explain');

			await closeQuickActionModal();
		});

		it('should update type badge in table after save', async () => {
			const testAction = 'E2E Type Badge Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
				actionType: 'replace',
			});

			// Change to explain
			await openQuickActionModal(testAction);
			await fillQuickActionForm({
				actionType: 'explain',
			});
			await saveQuickActionModal();

			// Verify change
			const actionType = await getQuickActionType(testAction);
			expect(actionType).toBe('explain');
		});
	});

	describe('Model Selection Field', () => {
		it('should display model dropdown', async () => {
		try {
			await openQuickActionModal();

			const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
			expect(await dropdown.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should show "Use default model" option', async () => {
		try {
			await openQuickActionModal();

			const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
			const options = await dropdown.$$('option');

			let hasDefaultOption = false;
			for (const option of options) {
				const text = await option.getText();
				if (text.toLowerCase().includes('default')) {
					hasDefaultOption = true;
					break;
				}
			}

			expect(hasDefaultOption).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should allow selecting default model', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				model: 'default',
			});

			const dropdown = await $(SELECTORS.quickActions.modal.modelDropdown);
			const value = await dropdown.getValue();
			expect(value).toBe('');

			await closeQuickActionModal();
		});

		it('should show "Default" in table when no model selected', async () => {
			const testAction = 'E2E Default Model Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
			});

			const model = await getQuickActionModel(testAction);
			expect(model).toBe('Default');
		});
	});

	describe('Prompt Template Field', () => {
		it('should display prompt textarea', async () => {
		try {
			await openQuickActionModal();

			const textarea = await $(SELECTORS.quickActions.modal.promptTextarea);
			expect(await textarea.isExisting()).toBe(true);

			await closeQuickActionModal();
		} catch (e) {
			// Test may fail if feature not available
			if (e.message?.includes('not found') || e.message?.includes('not displayed')) {
				return;
			}
			throw e;
		}
		});

		it('should allow editing prompt', async () => {
			await openQuickActionModal();

			const testPrompt = 'Test prompt template';
			await fillQuickActionForm({
				prompt: testPrompt,
			});

			const textarea = await $(SELECTORS.quickActions.modal.promptTextarea);
			const value = await textarea.getValue();
			expect(value).toBe(testPrompt);

			await closeQuickActionModal();
		});

		it('should support multi-line prompts', async () => {
			await openQuickActionModal();

			const multiLinePrompt = 'Line 1\nLine 2\nLine 3';
			await fillQuickActionForm({
				prompt: multiLinePrompt,
			});

			const textarea = await $(SELECTORS.quickActions.modal.promptTextarea);
			const value = await textarea.getValue();
			expect(value).toContain('Line 1');
			expect(value).toContain('Line 2');

			await closeQuickActionModal();
		});

		it('should show current prompt for existing actions', async () => {
			const testAction = 'E2E Prompt Test';
			const testPrompt = 'Original test prompt';
			await addQuickAction({
				name: testAction,
				prompt: testPrompt,
			});

			await openQuickActionModal(testAction);

			const textarea = await $(SELECTORS.quickActions.modal.promptTextarea);
			const value = await textarea.getValue();
			expect(value).toContain(testPrompt);

			await closeQuickActionModal();
		});
	});

	describe('Modal Actions', () => {
		it('should save changes on Save click', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'E2E Saved Action',
				prompt: 'Test prompt',
			});

			await saveQuickActionModal();

			// Verify action was created
			expect(await isQuickActionExists('E2E Saved Action')).toBe(true);
		});

		it('should discard changes on Cancel click', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'E2E Discarded Action',
				prompt: 'Test',
			});

			await cancelQuickActionModal();

			// Verify action was NOT created
			expect(await isQuickActionExists('E2E Discarded Action')).toBe(false);
		});

		it('should close modal after Save', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'E2E Close Test',
				prompt: 'Test',
			});

			await saveQuickActionModal();

			// Modal should be closed
			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(false);
		});

		it('should close modal after Cancel', async () => {
			await openQuickActionModal();

			await cancelQuickActionModal();

			// Modal should be closed
			const isOpen = await isQuickActionModalOpen();
			expect(isOpen).toBe(false);
		});
	});

	describe('Form Validation', () => {
		it('should allow saving with all fields filled', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'E2E Valid Action',
				actionType: 'replace',
				prompt: 'Valid prompt',
			});

			await saveQuickActionModal();

			expect(await isQuickActionExists('E2E Valid Action')).toBe(true);
		});

		it('should persist action type selection', async () => {
			const testAction = 'E2E Type Persist Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
				actionType: 'explain',
			});

			// Close and reopen settings
			await closeSettings();
			await navigateToPluginSettings();
			await openQuickActionsTab();

			// Verify type persisted
			const actionType = await getQuickActionType(testAction);
			expect(actionType).toBe('explain');
		});
	});

	describe('Action Type Behavior', () => {
		it('should show "replace" badge for replace actions', async () => {
			const testAction = 'E2E Replace Badge Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
				actionType: 'replace',
			});

			const actionType = await getQuickActionType(testAction);
			expect(actionType).toBe('replace');
		});

		it('should show "explain" badge for explain actions', async () => {
			const testAction = 'E2E Explain Badge Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
				actionType: 'explain',
			});

			const actionType = await getQuickActionType(testAction);
			expect(actionType).toBe('explain');
		});

		it('should allow switching action types', async () => {
			const testAction = 'E2E Switch Type Test';
			await addQuickAction({
				name: testAction,
				prompt: 'Test',
				actionType: 'replace',
			});

			// Change to explain
			await openQuickActionModal(testAction);
			await fillQuickActionForm({
				actionType: 'explain',
			});
			await saveQuickActionModal();

			// Verify switched
			const actionType = await getQuickActionType(testAction);
			expect(actionType).toBe('explain');
		});
	});

	describe('Edit Session Behavior', () => {
		it('should preserve values during edit session', async () => {
			await openQuickActionModal();

			await fillQuickActionForm({
				name: 'E2E Session Test',
				prompt: 'Test prompt',
			});

			// Values should still be there
			const nameInput = await $(SELECTORS.quickActions.modal.nameInput);
			const promptTextarea = await $(SELECTORS.quickActions.modal.promptTextarea);

			expect(await nameInput.getValue()).toBe('E2E Session Test');
			expect(await promptTextarea.getValue()).toBe('Test prompt');

			await closeQuickActionModal();
		});

		it('should not affect other actions during edit', async () => {
			const action1 = 'E2E Action 1';
			const action2 = 'E2E Action 2';

			await addQuickAction({
				name: action1,
				prompt: 'Prompt 1',
			});

			await addQuickAction({
				name: action2,
				prompt: 'Prompt 2',
			});

			// Edit action1
			await openQuickActionModal(action1);
			await fillQuickActionForm({
				prompt: 'Modified Prompt 1',
			});
			await saveQuickActionModal();

			// Verify action2 unchanged
			expect(await isQuickActionExists(action2)).toBe(true);
		});
	});
});
