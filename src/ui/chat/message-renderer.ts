import { setIcon, type App } from 'obsidian';
import { t } from '@/i18n';
import type { PluginHost } from '@/ui/plugin-host';
import type { Message } from '@/features/conversations';
import { marked } from 'marked';
import { enhanceRichMarkdown } from '@/ui/chat/rich-markdown';
import { protectMath, typesetMath } from '@/ui/chat/chat-math';
import { getProviderMeta } from '@/ui/provider-meta';
import { getModelDisplayName, resolveMessageProviderId } from '@/ui/chat/utils/provider-utils';
import { renderExecutionTrace } from '@/ui/chat/agent-trace-view';
import { renderWriteProposalCards, type ApplyProposal } from '@/ui/chat/write-proposal-cards';
import { renderCopyButton, renderTokenUsageFooter } from '@/ui/chat/message-footer';
import { TestIds } from '@/ui/utils/test-ids';
import { ModelManager, connectionLabel } from '@qwai/obsidian-llm';

export interface MessageRendererContext {
	app: App;
	plugin: PluginHost;
	mode: 'chat' | 'agent';
	messages: Message[];
}

export interface MessageRendererCallbacks {
	onRendered?: (element: HTMLElement, message: Message) => void;
	saveMessageToNewNote?: (message: Message) => Promise<void>;
	insertMessageToNote?: (message: Message) => Promise<void>;
	regenerateMessage?: (message: Message, element: HTMLElement) => Promise<void>;
	displayRagSources?: (container: HTMLElement, message: Message) => void;
	getProviderColor?: (message: Message) => string;
	applyWriteProposal?: ApplyProposal;
}

interface AssistantMeta {
	modelLabel: string;
	providerLabel: string;
}

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
	messageEl.setAttribute('data-testid', TestIds.chat.message);
	messageEl.setAttribute('data-role', message.role);
	// container.children includes messageEl itself (already inserted by createDiv);
	// the new message is at index length-1.
	messageEl.setAttribute('data-msg-id', String(container.children.length - 1));

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
	if (message.stopped) {
		status.removeClass('ia-hidden');
		status.setText(t('ux.stopped'));
		status.setAttr('data-message-status', 'stopped');
	} else if (message.role === 'assistant' && !message.content && !message.agentExecutionSteps?.length) {
		status.removeClass('ia-hidden');
		status.setText(t('ux.generating'));
		status.setAttr('data-message-status', 'generating');
	}

	if (assistantMeta) {
		renderAssistantBadges(header, assistantMeta);
	}

	if (message.timestamp !== undefined) {
		header.createDiv({ cls: 'ia-chat-message__timestamp message-timestamp', text: new Date(message.timestamp).toLocaleTimeString() });
	}

	if (message.agentExecutionSteps?.length || message.reasoningContent || message.reasoningSteps?.length) {
		if (_context.mode === 'agent') {
			renderExecutionTrace(body, message.agentExecutionSteps, message.reasoningContent, message.reasoningSteps);
		} else {
			renderReasoning(body, message);
		}
		renderWriteProposalCards(body, message.agentExecutionSteps, callbacks?.applyWriteProposal);
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

	const actions = body.createDiv('ia-chat-message__actions');
	actions.addClass('message-actions');

	renderCopyButton(actions, content);

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

	const setDefaultAvatar = (icon: string, label: string) => {
		setIcon(avatar, icon);
		avatar.removeClass('ia-chat-avatar--provider-bg');
		avatar.addClass('ia-chat-avatar--default-bg');
		labelElement.setText(label);
	};

	if (message.role === 'user') {
		setDefaultAvatar('user', 'You');
		return null;
	}

	const providerId = resolveMessageProviderId(message, context.plugin);
	const providerMeta = providerId ? getProviderMeta(providerId) : null;
	const fallbackColor = callbacks?.getProviderColor?.(message)
		|| (providerId ? providerColorFallbacks[providerId] : undefined)
		|| '#3f3f46';

	const connection = message.model ? ModelManager.findConfigForModelByProvider(message.model, context.plugin.settings.llmConfigs) : null;
	const providerLabel = message.providerLabel || (connection?.provider === 'custom' ? connectionLabel(connection) : null) || providerMeta?.label || humanizeProvider(providerId) || 'Unknown Provider';
	const modelLabel = getModelDisplayName(message.model) || message.model || 'Unknown Model';

	avatar.addClass('ia-provider-avatar');
	if (providerMeta?.iconSvg) {
		// Create a wrapper div for the SVG
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(providerMeta.iconSvg, 'image/svg+xml');
		const svgElement = svgDoc.documentElement;
		if (svgElement.instanceOf(SVGElement)) {
			avatar.appendChild(svgElement);
		} else {
			setIcon(avatar, 'bot');
		}
	} else {
		setIcon(avatar, 'bot');
	}
	avatar.setCssProps({ '--ia-avatar-bg': fallbackColor });
	avatar.addClass('ia-chat-avatar--provider-bg');
	avatar.setAttr('title', providerLabel);

	labelElement.addClass('ia-chat-message__model-label');
	labelElement.setText(t('chat.message.assistant'));

	return {
		modelLabel,
		providerLabel
	};
}

function renderAssistantBadges(header: HTMLElement, meta: AssistantMeta) {
	const badgeRow = header.createDiv('ia-chat-message__badges');
	badgeRow.addClass('message-meta-badges');
	createMetaBadge(badgeRow, 'Model', meta.modelLabel);
	createMetaBadge(badgeRow, 'Provider', meta.providerLabel);
}

function createMetaBadge(container: HTMLElement, label: string, value: string) {
	const badge = container.createSpan('ia-chat-message__badge');
	badge.createSpan({ cls: 'ia-chat-message__badge-label', text: label });
	badge.createSpan({ cls: 'ia-chat-message__badge-value', text: value });
}

function renderMarkdownInto(target: HTMLElement, content: string): void {
	const { markdown, formulas } = protectMath((content || '').replace(/\n{3,}/g, '\n\n'));
	const doc = new DOMParser().parseFromString(marked.parse(markdown) as string, 'text/html');
	target.empty();
	Array.from(doc.body.childNodes).forEach(node => {
		target.appendChild(node.cloneNode(true));
	});
	void typesetMath(target, formulas);
	void enhanceRichMarkdown(target);
}

export function renderAssistantMarkdown(target: HTMLElement, content: string): void {
	try {
		renderMarkdownInto(target, content);
	} catch (error) {
		console.error('[MessageRenderer] Markdown render error', error);
		target.setText(content);
	}
}

function renderMessageContent(target: HTMLElement, message: Message) {
	if (message.role !== 'assistant') {
		target.setText(message.content);
		return;
	}

	try {
		renderMarkdownInto(target, message.content);

		// Post-process code blocks: add language label + copy button
		target.querySelectorAll('pre').forEach(pre => {
			const code = pre.querySelector('code');
			if (!code) return;
			// Mermaid blocks are rendered into SVG by enhanceRichMarkdown; don't
			// wrap them with the code-block header/copy chrome.
			if (code.classList.contains('language-mermaid')) return;

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
					copyBtn.textContent = t('chat.message.codeCopied');
					copyBtn.classList.add('is-copied');
					window.setTimeout(() => {
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
	const section = container.createDiv('ia-chat-message__section ia-chat-message__reasoning-section');
	const details = section.createEl('details');
	const summary = details.createEl('summary', { text: t('chat.message.reasoning') });
	summary.addClass('ia-chat-message__summary');
	const content = details.createDiv('ia-chat-message__reasoning');

	if (message.reasoningContent) {
		renderAssistantMarkdown(content, message.reasoningContent);
	}

	ensureArray(message.reasoningSteps).forEach(step => {
		const stepEl = content.createDiv('ia-chat-message__reasoning-step');
		stepEl.createEl('strong', { text: `${step.step}. ${step.description}` });
		const stepBody = stepEl.createDiv();
		renderAssistantMarkdown(stepBody, step.content);
	});
}

function hasActionCallbacks(callbacks?: MessageRendererCallbacks): boolean {
	if (!callbacks) return false;
	return BUTTONS.some(({ key }) => typeof callbacks[key] === 'function');
}
