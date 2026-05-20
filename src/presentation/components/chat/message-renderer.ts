import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';
import type { Message } from '@/types';
import { marked } from 'marked';
import { getProviderMeta } from '@/presentation/components/components/provider-meta';
import { getModelDisplayName, resolveMessageProviderId } from '@/presentation/components/chat/utils';
import { createAgentExecutionTraceContainer, updateExecutionTrace, collapseExecutionTrace } from '@/presentation/components/chat/handlers/tool-call-handler';
import type { AgentExecutionStep as TraceStep } from '@/presentation/state/chat-view-state';

export interface MessageRendererContext {
	app: App;
	plugin: IntelligenceAssistantPlugin;
	mode: 'chat' | 'agent';
	messages: Message[];
}

export interface MessageRendererCallbacks {
	onRendered?: (element: HTMLElement, message: Message) => void;
	saveMessageToNewNote?: (message: Message) => Promise<void>;
	insertMessageToNote?: (message: Message) => Promise<void>;
	regenerateMessage?: (message: Message, element: HTMLElement) => Promise<void>;
	displayRagSources?: (container: HTMLElement, message: Message) => void;
	getProviderAvatar?: (message: Message) => string;
	getProviderColor?: (message: Message) => string;
}

interface AssistantMeta {
	modelLabel: string;
	providerLabel: string;
	isCliAgent?: boolean;
}

const CLI_PROVIDER_PREFIXES = ['claude-code', 'codex', 'qwen-code'];

const BUTTONS: Array<{
	key: keyof MessageRendererCallbacks;
	labelKey: string;
}> = [
	{ key: 'saveMessageToNewNote', labelKey: 'chat.message.save' },
	{ key: 'insertMessageToNote', labelKey: 'chat.message.insertToNotes' },
	{ key: 'regenerateMessage', labelKey: 'chat.message.regenerate' }
];

const ensureArray = <T>(value: T | T[] | undefined): T[] => {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
};

export function renderMessage(
	container: HTMLElement,
	message: Message,
	_context: MessageRendererContext,
	callbacks?: MessageRendererCallbacks,
	options?: { animate?: boolean }
): HTMLElement {
	const messageEl = container.createDiv('ia-chat-message');
	messageEl.addClass(`ia-chat-message--${message.role}`);
	messageEl.addClass('chat-message');
	messageEl.addClass(`message-${message.role}`);

	if (options?.animate) {
		messageEl.addClass('ia-chat-message--entering');
		messageEl.addEventListener('animationend', () => {
			messageEl.removeClass('ia-chat-message--entering');
		}, { once: true });
	}

	const messageRow = messageEl.createDiv('ia-chat-message__row');
	messageRow.addClass('message-row');

	const avatar = messageRow.createDiv('ia-chat-message__avatar');
	avatar.addClass('message-avatar');

	const body = messageRow.createDiv('ia-chat-message__body');
	body.addClass('message-body');
	body.setAttr('data-message-body', 'true');

	const header = body.createDiv('ia-chat-message__header');
	header.addClass('message-meta');

	const label = header.createDiv('ia-chat-message__label');
	label.addClass('message-name');
	const assistantMeta = applyAvatarAndLabel(avatar, label, message, _context, callbacks);

	const status = header.createSpan('ia-chat-message__status');
	status.setAttr('data-message-status', 'idle');
	status.addClass('ia-hidden');

	if (assistantMeta) {
		renderAssistantBadges(header, assistantMeta);
	}

	const timestampValue = typeof (message as unknown as { timestamp?: number }).timestamp === 'number' 
		? (message as unknown as { timestamp: number }).timestamp 
		: Date.now();
	const timestamp = header.createDiv('ia-chat-message__timestamp');
	timestamp.addClass('message-timestamp');
	timestamp.setText(new Date(timestampValue).toLocaleTimeString());

	if (message.agentExecutionSteps?.length) {
		renderExecutionTrace(body, message.agentExecutionSteps);
	}

	const content = body.createDiv('ia-chat-message__content');
	content.addClass('message-content');
	content.setAttr('data-message-content', 'true');
	renderMessageContent(content, message);

	if (message.attachments?.length) {
		renderListSection(body, t('chat.message.attachments'), message.attachments, att => `${att.name} (${att.path})`);
	}

	if (message.references?.length) {
		renderListSection(body, t('chat.message.references'), message.references, ref => `${ref.name} (${ref.path})`);
	}

	if (message.ragSources?.length) {
		if (callbacks?.displayRagSources) {
			callbacks.displayRagSources(body, message);
		} else {
			renderListSection(body, t('chat.message.ragSources'), message.ragSources, src => `${src.title || src.path}`);
		}
	}

	if (message.webSearchResults?.length) {
		const section = body.createDiv('ia-chat-message__section');
		section.createEl('h5', { text: t('chat.message.webResults') });
		const list = section.createEl('ul');
		message.webSearchResults.forEach(result => {
			const item = list.createEl('li');
			item.createEl('strong', { text: result.title });
			item.createDiv({ text: result.snippet });
			item.createDiv({ text: result.url, cls: 'ia-chat-message__muted' });
		});
	}

	if (message.reasoningSteps?.length || message.reasoningContent) {
		renderReasoning(body, message);
	}

	const actions = body.createDiv('ia-chat-message__actions');
	actions.addClass('message-actions');

	createCopyButtons(actions, content);

	if (message.role === 'assistant' && hasActionCallbacks(callbacks)) {
		BUTTONS.forEach(({ key, labelKey }) => {
			const actionLabel = t(labelKey);
			const handler = callbacks?.[key];
			if (!handler) return;
			const btn = actions.createEl('button', { cls: 'msg-action-btn', text: actionLabel });
			btn.addClass('ia-chat-message__action');
			btn.addEventListener('click', () => {
				void (async () => {
					btn.disabled = true;
					try {
						if (key === 'regenerateMessage') {
							await (handler as (message: Message, element: HTMLElement) => Promise<void>)(message, messageEl);
						} else {
							await (handler as (message: Message) => Promise<void>)(message);
						}
					} finally {
						btn.disabled = false;
					}
				})();
			});
		});
	}

	renderTokenUsageFooter(body, message.tokenUsage);

	callbacks?.onRendered?.(messageEl, message);
	return messageEl;
}

function applyAvatarAndLabel(
	avatar: HTMLElement,
	labelElement: HTMLElement,
	message: Message,
	context: MessageRendererContext,
	callbacks?: MessageRendererCallbacks
): AssistantMeta | null {
	const providerColorFallbacks: Record<string, string> = {
		'openai': '#10a37f',
		'anthropic': '#191919',
		'google': '#4285f4',
		'ollama': '#000000',
		'deepseek': '#0066cc',
		'openrouter': '#6366f1',
		'sap-ai-core': '#0070f2',
		'groq': '#f97316',
		'mistral': '#0d9488',
		'togetherai': '#ec4899'
	};

	const humanizeProvider = (providerId: string | null): string | null => {
		if (!providerId) return null;
		return providerId
			.split(/[-_]/)
			.map(part => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	};

	const setDefaultAvatar = (emoji: string, label: string) => {
		avatar.setText(emoji);
		avatar.setCssProps({
			'background': 'var(--background-modifier-border)'
		});
		labelElement.setText(label);
	};

	if (message.role === 'user') {
		setDefaultAvatar('🧑', 'You');
		return null;
	}

	const providerId = resolveMessageProviderId(message, context.plugin);
	const providerMeta = providerId ? getProviderMeta(providerId) : null;
	const fallbackColor = callbacks?.getProviderColor?.(message)
		|| (providerId ? providerColorFallbacks[providerId] : undefined)
		|| '#3f3f46';
	const fallbackAvatar = callbacks?.getProviderAvatar?.(message) ?? '🤖';
	// Detect CLI agent messages (model format: "claude-code:default", "codex:gpt-4o", etc.)
	const isCliAgent = typeof message.model === 'string'
		&& message.model.includes(':')
		&& CLI_PROVIDER_PREFIXES.includes(message.model.split(':')[0].toLowerCase());

	const providerLabel = providerMeta?.label || humanizeProvider(providerId) || 'Unknown Provider';
	const modelLabel = isCliAgent
		? providerLabel
		: (getModelDisplayName(message.model) || message.model || 'Unknown Model');

	avatar.addClass('ia-provider-avatar');
	if (providerMeta?.iconSvg) {
		// Create a wrapper div for the SVG
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(providerMeta.iconSvg, 'image/svg+xml');
		const svgElement = svgDoc.documentElement;
		if (svgElement instanceof SVGElement) {
			avatar.appendChild(svgElement);
		} else {
			avatar.setText(fallbackAvatar);
		}
	} else {
		avatar.setText(fallbackAvatar);
	}
	avatar.setCssProps({
		'background': fallbackColor
	});
	avatar.setAttr('title', providerLabel);

	labelElement.addClass('ia-chat-message__model-label');
	labelElement.setText('Assistant');

	return {
		modelLabel,
		providerLabel,
		isCliAgent
	};
}

function renderAssistantBadges(header: HTMLElement, meta: AssistantMeta) {
	const badgeRow = header.createDiv('ia-chat-message__badges');
	badgeRow.addClass('message-meta-badges');
	if (meta.isCliAgent) {
		createMetaBadge(badgeRow, 'Provider', meta.providerLabel);
	} else {
		createMetaBadge(badgeRow, 'Model', meta.modelLabel);
		createMetaBadge(badgeRow, 'Provider', meta.providerLabel);
	}
}

function createMetaBadge(container: HTMLElement, label: string, value: string) {
	const badge = container.createSpan('ia-chat-message__badge');
	badge.createSpan({ cls: 'ia-chat-message__badge-label', text: label });
	badge.createSpan({ cls: 'ia-chat-message__badge-value', text: value });
}

function renderMessageContent(target: HTMLElement, message: Message) {
	if (message.role !== 'assistant') {
		target.setText(message.content);
		return;
	}

	try {
		const cleanedContent = (message.content || '').replace(/\n{3,}/g, '\n\n');
		const html = marked.parse(cleanedContent) as string;
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		target.empty();
		Array.from(doc.body.childNodes).forEach(node => {
			target.appendChild(node.cloneNode(true));
		});

		// Post-process code blocks: add language label + copy button
		target.querySelectorAll('pre').forEach(pre => {
			const code = pre.querySelector('code');
			if (!code) return;

			// Extract language from class (e.g. "language-typescript")
			const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
			const lang = langClass ? langClass.replace('language-', '') : '';

			// Wrap pre in a container
			const wrapper = createEl('div');
			wrapper.className = 'ia-code-block';
			pre.parentNode?.insertBefore(wrapper, pre);
			wrapper.appendChild(pre);

			// Add header bar
			const header = createEl('div');
			header.className = 'ia-code-block__header';

			const langLabel = createEl('span');
			langLabel.className = 'ia-code-block__lang';
			langLabel.textContent = lang || 'code';
			header.appendChild(langLabel);

			const copyBtn = createEl('button');
			copyBtn.className = 'ia-code-block__copy';
			copyBtn.textContent = t('chat.message.copy');
			copyBtn.addEventListener('click', () => {
				const text = code.textContent || '';
				void navigator.clipboard.writeText(text).then(() => {
					copyBtn.textContent = t('chat.message.copied');
					copyBtn.classList.add('is-copied');
					activeWindow.setTimeout(() => {
						copyBtn.textContent = t('chat.message.copy');
						copyBtn.classList.remove('is-copied');
					}, 1500);
				});
			});
			header.appendChild(copyBtn);

			wrapper.insertBefore(header, pre);
		});
	} catch (error) {
		console.error('[MessageRenderer] Markdown render error', error);
		target.setText(message.content);
	}
}

function renderListSection<T>(root: HTMLElement, title: string, items: T[], formatter: (item: T) => string) {
	const section = root.createDiv('ia-chat-message__section');
	section.createEl('h5', { text: title });
	const list = section.createEl('ul');
	items.forEach(item => list.createEl('li', { text: formatter(item) }));
}

function renderReasoning(container: HTMLElement, message: Message) {
	const section = container.createDiv('ia-chat-message__section');
	const details = section.createEl('details');
	const summary = details.createEl('summary', { text: t('chat.message.reasoning') });
	summary.addClass('ia-chat-message__summary');
	const content = details.createDiv('ia-chat-message__reasoning');

	if (message.reasoningContent) {
		content.createEl('p', { text: message.reasoningContent });
	}

	ensureArray(message.reasoningSteps).forEach(step => {
		const stepEl = content.createDiv('ia-chat-message__reasoning-step');
		stepEl.createEl('strong', { text: `${step.step}. ${step.description}` });
		stepEl.createDiv({ text: step.content });
	});
}

function renderExecutionTrace(container: HTMLElement, steps: Message['agentExecutionSteps']) {
	if (!steps || steps.length === 0) return;
	const traceContentEl = createAgentExecutionTraceContainer(container, steps.length);
	updateExecutionTrace(traceContentEl, steps as unknown as TraceStep[]);
	collapseExecutionTrace(traceContentEl);
}

function hasActionCallbacks(callbacks?: MessageRendererCallbacks): boolean {
	if (!callbacks) return false;
	return BUTTONS.some(({ key }) => typeof callbacks[key] === 'function');
}

function createCopyButtons(actions: HTMLElement, contentEl: HTMLElement | null) {
	const copyGroup = actions.createDiv('ia-chat-message__copy-group');
	copyGroup.addClass('ia-chat-copy-group');

	const copyAllBtn = copyGroup.createEl('button', { text: t('chat.message.copy') });
	copyAllBtn.classList.add('ia-chat-copy-btn');
	copyAllBtn.title = 'Copy entire message';
	copyAllBtn.disabled = !contentEl;
	copyAllBtn.addEventListener('click', () => {
		void (async () => {
			if (!contentEl) return;
			try {
				await copyMessageContent(contentEl);
				new Notice(t('chat.message.copied'));
			} catch (error) {
				console.error('Copy failed:', error);
				new Notice(t('chat.message.copyFailed'));
			}
		})();
	});
}

async function copyMessageContent(contentEl: HTMLElement) {
	const text = contentEl.innerText.trim();
	if (!text) {
		throw new Error('Message is empty');
	}
	await writeTextToClipboard(text);
}

async function writeTextToClipboard(text: string) {
	// Use the modern Clipboard API
	if (navigator?.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	// If Clipboard API is not available, throw an error
	// Modern browsers all support the Clipboard API
	throw new Error('Clipboard API not available');
}

function renderTokenUsageFooter(container: HTMLElement, usage?: Message['tokenUsage']) {
	if (!usage) return;
	const summary: string[] = [];
	if (usage.promptTokens) summary.push(`${t('chat.message.tokenUsagePrompt')}: ${usage.promptTokens}`);
	if (usage.completionTokens) summary.push(`${t('chat.message.tokenUsageCompletion')}: ${usage.completionTokens}`);
	if (usage.totalTokens) summary.push(`${t('chat.message.tokenUsageTotal')}: ${usage.totalTokens}`);
	if (summary.length === 0) return;

	const footer = container.createDiv('ia-chat-message__footer');
	footer.addClass('ia-chat-message__annotation');
	footer.setAttr('data-exclude-from-copy', 'true');
	footer.setText(`${t('chat.message.tokenUsage')} · ${summary.join(' · ')}`);
}
