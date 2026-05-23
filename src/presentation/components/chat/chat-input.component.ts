import { App, setIcon, TFile, TFolder } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { t } from '@/i18n';
import type { ModelInfo } from '@/types';
import { TestIds } from '@/presentation/utils/test-ids';

export interface ChatInputCallbacks {
	onSendMessage: (text: string) => Promise<void>;
	onAttachImage: () => Promise<void>;
	onToggleRag: () => Promise<void>;
	onToggleWeb: () => Promise<void>;
	onShowReferenceMenu: () => void;
	onStopStreaming: () => void;
	onModeChange: (mode: 'chat' | 'agent') => Promise<void>;
	onModelChange: () => Promise<void>;
	onAgentChange: (agentId: string) => Promise<void>;
}

export class ChatInputComponent {
	public inputContainer: HTMLElement;
	public referenceContainer: HTMLElement;
	public attachmentContainer: HTMLElement;
	public textarea: HTMLTextAreaElement;
	public sendBtn: HTMLButtonElement;
	public stopBtn: HTMLButtonElement;
	public modelSelect: HTMLSelectElement;
	public modeSelector: HTMLSelectElement;
	public agentSelector: HTMLSelectElement;
	public ragActionItem: HTMLElement | null = null;
	public webActionItem: HTMLElement | null = null;
	public imageActionItem: HTMLElement | null = null;

	private modePillGroup: HTMLElement;
	private agentPillGroup: HTMLElement;

	constructor(
		private parent: HTMLElement,
		private app: App,
		private plugin: IntelligenceAssistantPlugin,
		private state: ChatViewState,
		private callbacks: ChatInputCallbacks
	) {
		this.render();
	}

	private render() {
		this.referenceContainer = this.parent.createDiv('input-reference-area');
		this.referenceContainer.addClass('ia-hidden');
		this.referenceContainer.createDiv('reference-list');

		this.inputContainer = this.parent.createDiv('chat-input-container');

		const chatInputBox = this.inputContainer.createDiv('chat-input-box');

		this.buildToolbar(chatInputBox.createDiv('chat-input-toolbar'));

		const editorRow = chatInputBox.createDiv('chat-input-editor');

		this.attachmentContainer = editorRow.createDiv('attachment-preview');
		this.attachmentContainer.addClass('ia-hidden');

		this.textarea = editorRow.createEl('textarea', {
			attr: { placeholder: t('chat.placeholder'), rows: '1' }
		});
		this.textarea.addClass('chat-input');

		this.sendBtn = editorRow.createEl('button', { cls: 'ia-send-btn' });
		this.sendBtn.setAttribute('aria-label', t('chat.sendAriaLabel'));
		setIcon(this.sendBtn, 'arrow-up');

		this.stopBtn = editorRow.createEl('button', { cls: 'stop-generation-btn' });
		setIcon(this.stopBtn, 'square');
		this.stopBtn.createSpan({ text: t('chat.stop') });
		this.stopBtn.addClass('ia-hidden');
		this.stopBtn.addEventListener('click', () => this.callbacks.onStopStreaming());

		this.textarea.addEventListener('input', () => {
			this.textarea.setCssProps({ 'height': 'auto' });
			this.textarea.setCssProps({ 'height': Math.min(this.textarea.scrollHeight, 200) + 'px' });
			this.sendBtn.toggleClass('is-active', this.textarea.value.trim().length > 0);
		});

		const handleSend = async () => {
			const text = this.textarea.value.trim();
			if (!text && this.state.currentAttachments.length === 0 && this.state.referencedFiles.length === 0) return;
			this.textarea.value = '';
			this.textarea.setCssProps({ 'height': 'auto' });
			this.sendBtn.removeClass('is-active');
			await this.callbacks.onSendMessage(text);
		};

		this.textarea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void handleSend();
			}
		});
		this.sendBtn.addEventListener('click', () => void handleSend());
	}

	private buildToolbar(toolbar: HTMLElement) {
		// Left: mode + model pills (visible in chat mode)
		this.modePillGroup = toolbar.createDiv('chat-input-pill-group');

		this.modeSelector = this.modePillGroup.createEl('select', { cls: 'chat-input-mode-pill' });
		this.modeSelector.createEl('option', { value: 'chat', text: t('chat.modeOptions.chat') });
		this.modeSelector.createEl('option', { value: 'agent', text: t('chat.modeOptions.agent') });
		this.modeSelector.value = this.state.mode;
		this.modeSelector.addEventListener('change', () => {
			void this.callbacks.onModeChange(this.modeSelector.value as 'chat' | 'agent');
		});

		this.modelSelect = this.modePillGroup.createEl('select', { cls: 'chat-input-model-pill' });
		this.modelSelect.addEventListener('change', () => void this.callbacks.onModelChange());

		// Left: agent pill (visible in agent mode)
		this.agentPillGroup = toolbar.createDiv('chat-input-pill-group');
		if (this.state.mode !== 'agent') this.agentPillGroup.addClass('ia-hidden');

		this.agentSelector = this.agentPillGroup.createEl('select', { cls: 'chat-input-agent-pill' });
		this.agentSelector.addEventListener('change', () => {
			void this.callbacks.onAgentChange(this.agentSelector.value);
		});
		this.refreshAgentSelect();

		// Spacer
		toolbar.createDiv('chat-input-toolbar-spacer');

		// Right: paperclip (always shown)
		const referenceBtn = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn is-link' });
		referenceBtn.type = 'button';
		referenceBtn.setAttr('title', t('chat.addReferenceTooltip'));
		setIcon(referenceBtn.createSpan({ cls: 'header-action-icon' }), 'paperclip');
		referenceBtn.addEventListener('click', (e) => {
			e.preventDefault();
			this.callbacks.onShowReferenceMenu();
		});

		// RAG (always created; hidden until enabled in settings)
		const ragBtn = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn' });
		ragBtn.type = 'button';
		this.ragActionItem = ragBtn;
		this.ragActionItem.setAttr('title', t('chat.ragTooltipLabel'));
		setIcon(this.ragActionItem.createSpan({ cls: 'header-action-icon' }), 'book-open');
		this.ragActionItem.createSpan({ cls: 'header-action-label', text: t('chat.ragLabel') });
		this.ragActionItem.addEventListener('click', (e) => {
			e.preventDefault();
			void this.callbacks.onToggleRag();
		});
		if (!this.plugin.settings.ragConfig.enabled || this.state.mode === 'agent') this.ragActionItem.addClass('ia-hidden');

		// Web search (always created; hidden until enabled in settings)
		const webBtn = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn' });
		webBtn.type = 'button';
		this.webActionItem = webBtn;
		this.webActionItem.setAttr('title', t('chat.webSearchTooltipLabel'));
		setIcon(this.webActionItem.createSpan({ cls: 'header-action-icon' }), 'search');
		this.webActionItem.createSpan({ cls: 'header-action-label', text: t('chat.webSearchLabel') });
		this.webActionItem.addEventListener('click', (e) => {
			e.preventDefault();
			void this.callbacks.onToggleWeb();
		});
		if (!this.plugin.settings.webSearchConfig.enabled || this.state.mode === 'agent') this.webActionItem.addClass('ia-hidden');

		// Image (created hidden; shown/hidden by setImageButtonVisible)
		const imageBtn = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn ia-hidden' });
		imageBtn.type = 'button';
		this.imageActionItem = imageBtn;
		this.imageActionItem.setAttr('title', t('chat.addPictureTooltip'));
		setIcon(this.imageActionItem.createSpan({ cls: 'header-action-icon' }), 'image');
		this.imageActionItem.createSpan({ cls: 'header-action-label', text: t('chat.addPicture') });
		this.imageActionItem.addEventListener('click', (e) => {
			e.preventDefault();
			void this.callbacks.onAttachImage();
		});
	}

	public updateModeSelector(mode: 'chat' | 'agent') {
		if (this.modeSelector) this.modeSelector.value = mode;
		if (this.modelSelect) this.modelSelect.toggleClass('ia-hidden', mode === 'agent');
		if (this.agentPillGroup) this.agentPillGroup.toggleClass('ia-hidden', mode !== 'agent');
		// RAG and web search are not available in agent mode
		if (this.ragActionItem) this.ragActionItem.toggleClass('ia-hidden', mode === 'agent' || !this.plugin.settings.ragConfig.enabled);
		if (this.webActionItem) this.webActionItem.toggleClass('ia-hidden', mode === 'agent' || !this.plugin.settings.webSearchConfig.enabled);
	}

	public refreshAgentSelect(preferredId?: string): string | null {
		if (!this.agentSelector) return null;
		const agents = this.plugin.settings.agents ?? [];
		this.agentSelector.empty();

		if (agents.length === 0) {
			const opt = this.agentSelector.createEl('option', { value: '', text: t('chat.noAgentsAvailable') });
			opt.disabled = true;
			opt.selected = true;
			this.agentSelector.disabled = true;
			return null;
		}

		this.agentSelector.disabled = false;
		const placeholder = this.agentSelector.createEl('option', { value: '', text: t('chat.selectAgent') });
		placeholder.disabled = true;

		const validIds = new Set(agents.map(a => a.id));
		const activeId = preferredId && validIds.has(preferredId)
			? preferredId
			: (this.plugin.settings.activeAgentId && validIds.has(this.plugin.settings.activeAgentId)
				? this.plugin.settings.activeAgentId
				: null);

		for (const agent of agents) {
			const opt = this.agentSelector.createEl('option', {
				value: agent.id,
				text: `${agent.icon || '🤖'} ${agent.name ?? 'unknown'}`
			});
			if (agent.id === activeId) opt.selected = true;
		}

		if (activeId) {
			this.agentSelector.value = activeId;
			return activeId;
		}
		placeholder.selected = true;
		return null;
	}

	public updateModelOptions() {
		if (!this.modelSelect) return;
		this.modelSelect.empty();

		const models = this.state.availableModels;
		const defaultModel = this.plugin.settings.defaultModel;

		if (models.length === 0) {
			const opt = this.modelSelect.createEl('option', { text: t('chat.header.noModels') });
			opt.value = '';
			opt.disabled = true;
			return;
		}

		const grouped = models.reduce((acc, m) => {
			if (!acc[m.provider]) acc[m.provider] = [];
			acc[m.provider].push(m);
			return acc;
		}, {} as Record<string, ModelInfo[]>);

		const sortedProviders = Object.entries(grouped).sort(([, a], [, b]) => {
			const aHas = a.some(m => m.id === defaultModel);
			const bHas = b.some(m => m.id === defaultModel);
			if (aHas && !bHas) return -1;
			if (!aHas && bHas) return 1;
			return 0;
		});

		for (const [provider, providerModels] of sortedProviders) {
			const group = this.modelSelect.createEl('optgroup');
			group.label = `${provider.toUpperCase()} (${providerModels.length})`;
			const sorted = [...providerModels].sort((a, b) => {
				if (a.id === defaultModel) return -1;
				if (b.id === defaultModel) return 1;
				return a.name.localeCompare(b.name);
			});
			for (const m of sorted) {
				const opt = group.createEl('option', { value: m.id, text: m.name });
				if (m.id === defaultModel) opt.selected = true;
			}
		}
	}

	public setImageButtonVisible(visible: boolean) {
		if (this.imageActionItem) {
			this.imageActionItem.toggleClass('ia-hidden', !visible);
		}
	}

	public updateActionToggleState(
		item: HTMLElement,
		enabled: boolean,
		active: boolean,
		_statusText: string
	) {
		item.toggleClass('ia-hidden', !enabled);
		if (enabled) {
			item.toggleClass('is-active', active);
		}
	}

	public updateReferenceDisplay() {
		if (!this.referenceContainer) return;

		const referenceList = this.referenceContainer.querySelector('.reference-list') as HTMLElement;
		if (!referenceList) return;

		referenceList.empty();

		if (this.state.referencedFiles.length === 0) {
			this.referenceContainer.addClass('ia-hidden');
			return;
		}

		this.referenceContainer.removeClass('ia-hidden');

		this.state.referencedFiles.forEach((item, index) => {
			const refItem = referenceList.createDiv('reference-item');
			const icon = refItem.createSpan('reference-icon');
			icon.setText(item instanceof TFolder ? '📁' : '📄');
			refItem.createSpan('reference-path').setText(item.path);
			refItem.addClass('ia-clickable');
			refItem.addEventListener('click', () => {
				if (item instanceof TFile) {
					void this.app.workspace.getLeaf().openFile(item);
				}
			});
			const removeBtn = refItem.createEl('button', { text: '×', cls: 'reference-remove' });
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.state.referencedFiles.splice(index, 1);
				this.updateReferenceDisplay();
			});
		});
	}

	public updateAttachmentPreview() {
		if (!this.attachmentContainer) return;

		this.attachmentContainer.empty();

		if (this.state.currentAttachments.length === 0) {
			this.attachmentContainer.addClass('ia-hidden');
			return;
		}

		this.attachmentContainer.removeClass('ia-hidden');
		this.attachmentContainer.addClass('ia-attachment-preview-container');

		this.state.currentAttachments.forEach((att, index) => {
			const attPreview = this.attachmentContainer.createDiv('attachment-preview-item');

			if (att.type === 'image' && att.content) {
				const img = attPreview.createEl('img');
				img.src = att.content;
				img.alt = att.name;
				img.addClass('ia-attachment-img-thumb');
			} else {
				attPreview.createSpan({ text: att.type === 'image' ? '🖼️' : '📎' });
			}

			attPreview.createSpan({ text: att.name, cls: 'ia-attachment-name' });

			const removeBtn = attPreview.createEl('button', { text: '×', cls: 'ia-attachment-remove' });
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.state.currentAttachments.splice(index, 1);
				this.updateAttachmentPreview();
			});
		});
	}
}
