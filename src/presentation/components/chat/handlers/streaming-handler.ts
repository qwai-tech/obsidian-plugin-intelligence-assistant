/**
 * Streaming Handler
 * Manages real-time streaming of LLM responses with reasoning content support
 */

import { marked } from 'marked';
import type { Message } from '@/types';
import type { ILLMProvider } from '@/types';

const MESSAGE_CONTENT_SELECTORS = ['[data-message-content]', '.ia-chat-message__content', '.message-content'];
const MESSAGE_STATUS_SELECTORS = ['[data-message-status]', '.ia-chat-message__status'];

export interface StreamingHandlerOptions {
	chatContainer: HTMLElement;
	stopBtn: HTMLElement | null;
	sendHint: HTMLElement | null;
	onStopRequested: () => boolean;
	estimateTokens: (text: string) => number;
}

export interface StreamingResult {
	fullContent: string;
	fullReasoning: string;
	tokenCount: number;
	duration: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

/**
 * Handles streaming chat responses with real-time UI updates
 */
export async function handleStreamingChat(
	messageEl: HTMLElement,
	provider: ILLMProvider,
	streamParams: {
		messages: Message[];
		model: string;
		temperature: number;
		maxTokens: number;
	},
	options: StreamingHandlerOptions
): Promise<StreamingResult> {
	const contentEl = getRequiredElement(messageEl, MESSAGE_CONTENT_SELECTORS, 'message content');
	const statusEl = getOptionalElement(messageEl, MESSAGE_STATUS_SELECTORS);

	// Add thinking indicator
	const thinkingIndicator = contentEl.createDiv('thinking-indicator');
	thinkingIndicator.style.display = 'flex';
	thinkingIndicator.style.alignItems = 'center';
	thinkingIndicator.style.gap = '8px';
	thinkingIndicator.style.color = 'var(--text-muted)';
	thinkingIndicator.style.fontStyle = 'italic';
	thinkingIndicator.innerHTML = `
		<div class="typing-dots">
			<span style="animation: typing 1.4s infinite; animation-delay: 0s;">●</span>
			<span style="animation: typing 1.4s infinite; animation-delay: 0.2s;">●</span>
			<span style="animation: typing 1.4s infinite; animation-delay: 0.4s;">●</span>
		</div>
		<span>Thinking...</span>
	`;

	// Show stop button, hide send hint
	if (options.stopBtn) options.stopBtn.style.display = 'flex';
	if (options.sendHint) options.sendHint.style.display = 'none';

	messageEl.classList.add('ia-chat-message--streaming');
	setStreamingStatus(statusEl, 'streaming');

	let fullContent = '';
	let fullReasoning = '';
	let tokenCount = 0;
	const startTime = Date.now();

	console.log('[Chat] Starting stream chat...');

	// Create reasoning container (hidden initially)
	let reasoningContainer: HTMLElement | null = null;

	// Stream response with parameters
	let streamError: Error | null = null;
	try {
		await provider.streamChat(
			streamParams,
			(chunk) => {
				// Check if stop was requested
				if (options.onStopRequested()) {
					throw new Error('Generation stopped by user');
				}

				if (!chunk.done) {
					// Remove thinking indicator on first chunk
					if (fullContent === '' && fullReasoning === '' && thinkingIndicator.parentElement) {
						thinkingIndicator.remove();
					}

					// Handle reasoning content (DeepSeek R1)
					if (chunk.reasoning) {
						fullReasoning += chunk.reasoning;

						// Create reasoning container if not exists
						if (!reasoningContainer) {
							reasoningContainer = messageEl.querySelector('.message-body')?.createDiv('reasoning-container') || null;
							if (reasoningContainer) {
								const reasoningHeader = reasoningContainer.createDiv('reasoning-header');
								reasoningHeader.innerHTML = '💭 Reasoning Process';
								reasoningHeader.style.cursor = 'pointer';

								const reasoningContent = reasoningContainer.createDiv('reasoning-content');
								reasoningContent.style.display = 'block'; // Show by default

								// Toggle on click
								reasoningHeader.addEventListener('click', () => {
									if (reasoningContent.style.display === 'none') {
										reasoningContent.style.display = 'block';
										reasoningHeader.innerHTML = '💭 Reasoning Process';
									} else {
										reasoningContent.style.display = 'none';
										reasoningHeader.innerHTML = '💭 Reasoning Process (click to expand)';
									}
								});
							}
						}

						// Update reasoning display
						if (reasoningContainer) {
							const reasoningContent = reasoningContainer.querySelector('.reasoning-content') as HTMLElement;
							if (reasoningContent) {
								reasoningContent.setText(fullReasoning);

								// Add streaming cursor to reasoning
								const cursor = reasoningContent.createEl('span', { cls: 'streaming-cursor' });
								cursor.style.animation = 'blink 1s infinite';
								cursor.innerHTML = '▊';
							}
						}
					}

					// Handle regular content
					if (chunk.content) {
						fullContent += chunk.content;
						tokenCount++;

						// Render markdown during streaming
						try {
							// Clean up excessive newlines before rendering
							const cleanedContent = fullContent.replace(/\n{3,}/g, '\n\n');
							const html = marked.parse(cleanedContent) as string;
							contentEl.innerHTML = html;

							// Add streaming cursor to content
							const cursor = contentEl.createEl('span', { cls: 'streaming-cursor' });
							cursor.style.animation = 'blink 1s infinite';
							cursor.innerHTML = '▊';
						} catch (error) {
							contentEl.setText(fullContent);
						}

						setStreamingStatus(statusEl, 'streaming', `${tokenCount} tokens`);
					}

					options.chatContainer.scrollTop = options.chatContainer.scrollHeight;
				} else {
					// Remove cursors when done
					const contentCursor = contentEl.querySelector('.streaming-cursor');
					if (contentCursor) contentCursor.remove();

					if (reasoningContainer) {
						const reasoningContent = reasoningContainer.querySelector('.reasoning-content') as HTMLElement;
						const reasoningCursor = reasoningContent?.querySelector('.streaming-cursor');
						if (reasoningCursor) reasoningCursor.remove();
					}
				}
			}
		);
	} catch (error) {
		streamError = error as Error;
		throw error;
	} finally {
		// Hide stop button, show send hint
		if (options.stopBtn) options.stopBtn.style.display = 'none';
		if (options.sendHint) options.sendHint.style.display = 'block';

		messageEl.classList.remove('ia-chat-message--streaming');

		// Remove thinking indicator if still present
		if (thinkingIndicator.parentElement) {
			thinkingIndicator.remove();
		}

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		setStreamingStatus(
			statusEl,
			streamError ? 'error' : 'complete',
			streamError ? streamError.message : `${duration.toFixed(1)}s · ${tokenCount} tokens`
		);

		const tokensPerSecond = tokenCount / duration;
		console.log(`[Chat] Streaming complete: ${tokenCount} tokens in ${duration.toFixed(2)}s (${tokensPerSecond.toFixed(1)} tokens/s)`);
	}

	// Estimate token usage
	const completionTokens = options.estimateTokens(fullContent);
	const promptTokens = options.estimateTokens(streamParams.messages.map(m => m.content).join(' '));
	const totalTokens = completionTokens + promptTokens;

	return {
		fullContent,
		fullReasoning,
		tokenCount,
		duration: (Date.now() - startTime) / 1000,
		promptTokens,
		completionTokens,
		totalTokens
	};
}

type StreamingStatusState = 'streaming' | 'complete' | 'error';

function getOptionalElement(root: HTMLElement, selectors: string[]): HTMLElement | null {
	for (const selector of selectors) {
		const el = root.querySelector(selector) as HTMLElement | null;
		if (el) {
			return el;
		}
	}
	return null;
}

function getRequiredElement(root: HTMLElement, selectors: string[], description: string): HTMLElement {
	const el = getOptionalElement(root, selectors);
	if (!el) {
		throw new Error(`Unable to locate ${description} element for streaming output`);
	}
	return el;
}

function setStreamingStatus(el: HTMLElement | null, state: StreamingStatusState, details?: string) {
	if (!el) return;
	el.style.display = 'inline-flex';
	el.classList.add('is-visible');
	el.setAttr('data-state', state);
	if (state === 'error') {
		el.addClass('is-error');
	} else {
		el.removeClass('is-error');
	}

	let label = 'Streaming';
	if (state === 'complete') {
		label = 'Completed';
	} else if (state === 'error') {
		label = 'Error';
	}

	el.setText(details ? `${label} · ${details}` : label);
}
