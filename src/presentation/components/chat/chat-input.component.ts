import { App, setIcon, Notice, TFile, TFolder } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { ChatViewState } from '@/presentation/state/chat-view-state';
import { t } from '@/i18n';

export interface ChatInputCallbacks {
	onSendMessage: (text: string) => Promise<void>;
	onAttachImage: () => Promise<void>;
	onToggleRag: () => Promise<void>;
	onToggleWeb: () => Promise<void>;
	onShowReferenceMenu: () => void;
	onStopStreaming: () => void;
}

export class ChatInputComponent {
	public inputContainer: HTMLElement;
	public referenceContainer: HTMLElement;
	public attachmentContainer: HTMLElement;
	public textarea: HTMLTextAreaElement;
	public sendBtn: HTMLButtonElement;
	public stopBtn: HTMLButtonElement;
	public sendHint: HTMLElement;
	public ragActionItem: HTMLElement;
	public webActionItem: HTMLElement;
	public imageActionItem: HTMLElement;
	public headerActionsContainer: HTMLElement;

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
		this.inputContainer = this.parent.createDiv('chat-input-container');

		const inputHeader = this.inputContainer.createDiv('chat-input-header');

		// Reference area
		this.referenceContainer = inputHeader.createDiv('input-reference-area');
		this.referenceContainer.addClass('ia-hidden');
		this.referenceContainer.createDiv('reference-list');

		// Header quick actions
		this.setupHeaderActions(inputHeader);

		// Text input area
		const editorWrapper = this.inputContainer.createDiv('chat-input-editor');
		this.textarea = editorWrapper.createEl('textarea', {
			attr: {
				placeholder: t('chat.placeholder'),
				rows: '1'
			}
		});
		this.textarea.addClass('chat-input');

		// Send button
		this.sendBtn = editorWrapper.createEl('button', { cls: 'ia-send-btn' });
		this.sendBtn.setAttribute('aria-label', t('chat.sendAriaLabel'));
		setIcon(this.sendBtn, 'arrow-up');

		// Auto-resize textarea
		this.textarea.addEventListener('input', () => {
			this.textarea.setCssProps({ 'height': 'auto' });
			this.textarea.setCssProps({ 'height': Math.min(this.textarea.scrollHeight, 200) + 'px' });
			this.sendBtn.toggleClass('is-active', this.textarea.value.trim().length > 0);
		});

		// Input footer
		const controlsSection = this.inputContainer.createDiv('chat-input-footer');
		const bottomControls = controlsSection.createDiv('input-bottom-controls');
		bottomControls.createDiv('bottom-left-controls');

		// Attachment preview area
		const middleControls = bottomControls.createDiv('bottom-middle-controls');
		this.attachmentContainer = middleControls.createDiv('attachment-preview');
		this.attachmentContainer.addClass('ia-hidden');

		// Right section
		const rightControls = bottomControls.createDiv('bottom-right-controls');

		// Send hint
		this.sendHint = rightControls.createEl('span');
		this.sendHint.addClass('ia-send-hint');
		this.sendHint.setText(t('chat.sendHintPrefix'));
		this.sendHint.createEl('kbd', { text: t('chat.sendHintKey') });
		this.sendHint.appendText(t('chat.sendHintSuffix'));

		// Stop button
		this.stopBtn = rightControls.createEl('button', { cls: 'stop-generation-btn' });
		setIcon(this.stopBtn, 'square');
		this.stopBtn.createSpan({ text: t('chat.stop') });
		this.stopBtn.addClass('ia-hidden');
		this.stopBtn.addEventListener('click', () => {
			this.callbacks.onStopStreaming();
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

		this.sendBtn.addEventListener('click', () => {
			void handleSend();
		});
	}

	private setupHeaderActions(inputHeader: HTMLElement) {
		const actionsContainer = inputHeader.createDiv('chat-header-actions');
		actionsContainer.addClass('chat-header-actions');
		this.headerActionsContainer = actionsContainer;

		this.createHeaderActionButton(actionsContainer, {
			icon: 'paperclip',
			label: t('chat.addReference'),
			tooltip: t('chat.addReferenceTooltip'),
			onClick: () => this.callbacks.onShowReferenceMenu()
		}).addClass('is-link');

		this.imageActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'image',
			label: t('chat.addPicture'),
			tooltip: t('chat.addPictureTooltip'),
			showStatus: true,
			onClick: () => {
				if (this.imageActionItem?.hasClass('is-disabled')) {
					new Notice(t('chat.imageUnavailable'));
					return;
				}
				void this.callbacks.onAttachImage();
			}
		});

		this.ragActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'book-open',
			label: t('chat.ragLabel'),
			tooltip: t('chat.ragTooltipLabel'),
			showStatus: true,
			onClick: () => { void this.callbacks.onToggleRag(); }
		});
		this.ragActionItem.addClass('is-toggle');

		this.webActionItem = this.createHeaderActionButton(actionsContainer, {
			icon: 'search',
			label: t('chat.webSearchLabel'),
			tooltip: t('chat.webSearchTooltipLabel'),
			showStatus: true,
			onClick: () => { void this.callbacks.onToggleWeb(); }
		});
		this.webActionItem.addClass('is-toggle');
	}

	private createHeaderActionButton(
		container: HTMLElement,
		config: { icon: string; label: string; tooltip?: string; showStatus?: boolean; onClick: () => void }
	): HTMLButtonElement {
		const button = container.createEl('button', { cls: 'header-action-btn' });
		button.type = 'button';
		if (config.tooltip) {
			button.setAttr('title', config.tooltip);
		}
		button.addEventListener('click', (event) => {
			event.preventDefault();
			void config.onClick();
		});

		const iconEl = button.createSpan({ cls: 'header-action-icon' });
		setIcon(iconEl, config.icon);
		button.createSpan({ cls: 'header-action-label', text: config.label });
		if (config.showStatus) {
			button.createSpan({ cls: 'header-action-status' });
		}
		return button;
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
			const pathSpan = refItem.createSpan('reference-path');
			pathSpan.setText(item.path);

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
		// Styles are handled by CSS classes now or set here for legacy
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

	public updateQuickActionsVisibility(isAgentMode: boolean) {
		if (this.headerActionsContainer) {
			this.headerActionsContainer.toggleClass('ia-hidden', isAgentMode);
		}
	}

	public updateActionToggleState(
		item: HTMLElement,
		enabled: boolean,
		active: boolean,
		statusText: string
	) {
		item.toggleClass('is-disabled', !enabled);
		item.toggleClass('is-active', enabled && active);
		const status = item.querySelector('.header-action-status');
		if (status) {
			status.textContent = statusText;
		}
	}
}
