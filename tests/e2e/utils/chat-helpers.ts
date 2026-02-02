/**
 * Helper functions for Chat View E2E tests
 */

import { SELECTORS } from './selectors';

/**
 * Get the currently selected model in chat
 */
export async function getSelectedModel(): Promise<string> {
	const modelSelector = await $(SELECTORS.chat.modelSelector);
	await modelSelector.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Model selector not displayed' });
	return await modelSelector.getValue();
}

/**
 * Get all available models in the chat selector
 */
export async function getAvailableModels(): Promise<string[]> {
	const modelSelector = await $(SELECTORS.chat.modelSelector);
	await modelSelector.waitForDisplayed({ timeout: 10000, timeoutMsg: 'Model selector not displayed when getting available models' });
	const options = await modelSelector.$$('option');

	const models: string[] = [];
	for (const option of options) {
		const value = await option.getValue();
		if (value) {
			models.push(value);
		}
	}

	return models;
}

/**
 * Select a model in the chat view
 */
export async function selectModel(modelId: string) {
	const modelSelector = await $(SELECTORS.chat.modelSelector);
	await modelSelector.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Model selector not displayed for selection' });
	await modelSelector.selectByAttribute('value', modelId);
	await browser.pause(500);
}

/**
 * Get the number of messages in the chat
 */
export async function getMessageCount(): Promise<number> {
	const messages = await $$(SELECTORS.chat.message);
	return messages.length;
}

/**
 * Get all messages in the chat
 */
export async function getAllMessages(): Promise<Array<{role: string, content: string}>> {
	const messages = await $$(SELECTORS.chat.message);
	const result = [];

	for (const message of messages) {
		const className = await message.getAttribute('class');
		const role = className.includes('user') ? 'user' : 'assistant';

		const contentEl = await message.$(SELECTORS.chat.messageContent);
		const content = await contentEl.getText();

		result.push({ role, content });
	}

	return result;
}

/**
 * Get the last assistant message
 */
export async function getLastAssistantMessage(): Promise<string> {
	const messages = await $$(SELECTORS.chat.assistantMessage);
	if (messages.length === 0) {
		return '';
	}

	const lastMessage = messages[messages.length - 1];
	const contentEl = await lastMessage.$(SELECTORS.chat.messageContent);
	return await contentEl.getText();
}

/**
 * Get the last user message
 */
export async function getLastUserMessage(): Promise<string> {
	const messages = await $$(SELECTORS.chat.userMessage);
	if (messages.length === 0) {
		return '';
	}

	const lastMessage = messages[messages.length - 1];
	const contentEl = await lastMessage.$(SELECTORS.chat.messageContent);
	return await contentEl.getText();
}

/**
 * Check if chat is currently streaming
 */
export async function isStreaming(): Promise<boolean> {
	const streamingMessages = await $$(SELECTORS.chat.streamingMessage);
	return streamingMessages.length > 0;
}

/**
 * Wait for streaming to complete
 */
export async function waitForStreamingComplete(timeout: number = 30000) {
	await browser.waitUntil(
		async () => !(await isStreaming()),
		{
			timeout,
			timeoutMsg: 'Streaming did not complete within timeout',
		}
	);
}

/**
 * Stop generation (click stop button)
 */
export async function stopGeneration() {
	const stopButton = await $(SELECTORS.chat.stopButton);
	if (await stopButton.isDisplayed()) {
		await stopButton.click();
		await browser.pause(500);
	}
}

/**
 * Clear chat (click new chat button)
 */
export async function clearChat() {
	const newChatButton = await $(SELECTORS.chat.newChatButton);
	await newChatButton.click();
	await browser.pause(500);
}

/**
 * Get model count from badge
 */
export async function getModelCount(): Promise<string> {
	const badge = await $(SELECTORS.chat.modelCountBadge);
	await badge.waitForDisplayed({ timeout: 30000, timeoutMsg: 'Model count badge not displayed' });
	return await badge.getText();
}

/**
 * Get token usage summary
 */
export async function getTokenUsage(): Promise<string> {
	const tokenEl = await $(SELECTORS.chat.tokenSummary);
	await tokenEl.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Token summary not displayed' });
	if (await tokenEl.isExisting()) {
		return await tokenEl.getText();
	}
	return '';
}

/**
 * Check if an error message is displayed
 */
export async function hasError(): Promise<boolean> {
	const errorEl = await $(SELECTORS.chat.errorMessage);
	return await errorEl.isExisting() && await errorEl.isDisplayed();
}

/**
 * Get error message text
 */
export async function getErrorMessage(): Promise<string> {
	const errorEl = await $(SELECTORS.chat.errorMessage);
	if (await errorEl.isExisting()) {
		return await errorEl.getText();
	}
	return '';
}

/**
 * Check if empty state is displayed
 */
export async function hasEmptyState(): Promise<boolean> {
	const emptyState = await $(SELECTORS.chat.emptyState);
	return await emptyState.isExisting() && await emptyState.isDisplayed();
}

/**
 * Send message and wait for response
 */
export async function sendMessageAndWaitForResponse(
	message: string,
	timeout: number = 30000
): Promise<string> {
	const { sendChatMessage, waitForAssistantResponse } = await import('./actions');

	await sendChatMessage(message);
	await waitForAssistantResponse(timeout);

	return await getLastAssistantMessage();
}

/**
 * Wait for model selector to be populated
 */
export async function waitForModelsLoaded(minCount: number = 1, timeout: number = 10000) {
	await browser.waitUntil(
		async () => {
			const models = await getAvailableModels();
			return models.length >= minCount;
		},
		{
			timeout,
			timeoutMsg: `Expected at least ${minCount} models to be loaded`,
		}
	);
}

/**
 * Check if a specific model is available
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
	const models = await getAvailableModels();
	return models.some(m => m.includes(modelName));
}

/**
 * Select chat mode (if mode selector exists)
 */
export async function selectChatMode(mode: string) {
	const modeButton = await $(SELECTORS.chat.modeButton(mode));
	if (await modeButton.isExisting()) {
		await modeButton.click();
		await browser.pause(300);
	}
}

/**
 * Check if chat mode selector exists
 */
export async function hasModeSelector(): Promise<boolean> {
	const modeSelector = await $(SELECTORS.chat.modeSelector);
	await modeSelector.waitForDisplayed({ timeout: 5000, timeoutMsg: 'Mode selector not displayed' });
	return await modeSelector.isExisting();
}
