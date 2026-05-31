# Chat UI Redesign — Plan 2: ChatInputComponent Toolbar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `ChatInputComponent` with a two-row unified box (toolbar row + editor row). The toolbar contains mode/model/agent pills on the left and feature icon buttons on the right. Wire ChatView to use the new component fields. **After this plan, the build compiles and the new toolbar is visible, but the old `chat-toolbar-b` in the header is still rendered — that overlap is intentional and resolved by Plan 3.**

**Architecture:** Complete rewrite of `chat-input.component.ts` (new toolbar structure, new public fields, new callbacks). Targeted edits to `chat-view.ts` to wire up new callbacks and redirect `modelSelect`, mode/agent selector references from the header to the input component. `chat-header.component.ts` is **untouched** in this plan.

**Tech Stack:** TypeScript, Obsidian DOM API (`createEl`, `setIcon`), existing i18n keys.

**Prerequisite:** Plan 1 (CSS) must be merged first so `.chat-input-box`, `.chat-input-toolbar`, pill classes, and `.chat-input-toolbar-btn` exist.

---

## File map

| File | Change |
|------|--------|
| `src/presentation/components/chat/chat-input.component.ts` | Full rewrite |
| `src/presentation/views/chat-view.ts` | 14 targeted edits |

---

### Task 1: Rewrite ChatInputComponent

**Files:**
- Modify: `src/presentation/components/chat/chat-input.component.ts`

- [ ] **Step 1: Read the current file to understand existing public API**

  Read `src/presentation/components/chat/chat-input.component.ts` fully. Note that `sendHint`, `headerActionsContainer`, `updateQuickActionsVisibility`, `setupHeaderActions`, and `createHeaderActionButton` are removed in the new version.

- [ ] **Step 2: Replace the entire file with the new implementation**

  Replace the full file contents with:

  ```typescript
  import { App, setIcon, TFile, TFolder } from 'obsidian';
  import type IntelligenceAssistantPlugin from '@plugin';
  import { ChatViewState } from '@/presentation/state/chat-view-state';
  import { t } from '@/i18n';
  import type { ModelInfo } from '@/types';

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
  			void this.callbacks.onModeChange((this.modeSelector.value ?? 'chat') as 'chat' | 'agent');
  		});

  		this.modelSelect = this.modePillGroup.createEl('select', { cls: 'chat-input-model-pill' });
  		this.modelSelect.addEventListener('change', () => void this.callbacks.onModelChange());

  		// Left: agent pill (visible in agent mode)
  		this.agentPillGroup = toolbar.createDiv('chat-input-pill-group');
  		if (this.state.mode !== 'agent') this.agentPillGroup.addClass('ia-hidden');

  		this.agentSelector = this.agentPillGroup.createEl('select', { cls: 'chat-input-agent-pill' });
  		this.agentSelector.addEventListener('change', () => {
  			void this.callbacks.onAgentChange(this.agentSelector.value ?? '');
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

  		// RAG (only rendered if enabled in settings)
  		if (this.plugin.settings.ragConfig.enabled) {
  			this.ragActionItem = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn' });
  			(this.ragActionItem as HTMLButtonElement).type = 'button';
  			this.ragActionItem.setAttr('title', t('chat.ragTooltipLabel'));
  			setIcon(this.ragActionItem.createSpan({ cls: 'header-action-icon' }), 'book-open');
  			this.ragActionItem.createSpan({ cls: 'header-action-label', text: t('chat.ragLabel') });
  			this.ragActionItem.addEventListener('click', (e) => {
  				e.preventDefault();
  				void this.callbacks.onToggleRag();
  			});
  		}

  		// Web search (only rendered if enabled in settings)
  		if (this.plugin.settings.webSearchConfig.enabled) {
  			this.webActionItem = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn' });
  			(this.webActionItem as HTMLButtonElement).type = 'button';
  			this.webActionItem.setAttr('title', t('chat.webSearchTooltipLabel'));
  			setIcon(this.webActionItem.createSpan({ cls: 'header-action-icon' }), 'search');
  			this.webActionItem.createSpan({ cls: 'header-action-label', text: t('chat.webSearchLabel') });
  			this.webActionItem.addEventListener('click', (e) => {
  				e.preventDefault();
  				void this.callbacks.onToggleWeb();
  			});
  		}

  		// Image (created hidden; shown/hidden by setImageButtonVisible)
  		this.imageActionItem = toolbar.createEl('button', { cls: 'chat-input-toolbar-btn ia-hidden' });
  		(this.imageActionItem as HTMLButtonElement).type = 'button';
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
  		if (this.modePillGroup) this.modePillGroup.toggleClass('ia-hidden', mode === 'agent');
  		if (this.agentPillGroup) this.agentPillGroup.toggleClass('ia-hidden', mode !== 'agent');
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
  ```

- [ ] **Step 3: Run build to check for type errors**

  ```bash
  npm run build 2>&1 | head -40
  ```

  Expected: build fails because `chat-view.ts` still uses old `ChatInputCallbacks` (missing new callbacks) and old fields (`sendHint`, `headerActionsContainer`). That's expected — fix in Task 2.

---

### Task 2: Update chat-view.ts — field declarations and ChatInput instantiation

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

**Context:** `chat-view.ts` has 1599 lines. The changes below are all targeted. Read the file before editing to confirm line numbers haven't shifted.

- [ ] **Step 1: Remove `sendHint` and `headerActionsContainer` private field declarations**

  Find the block near line 80:
  ```typescript
  	// UI elements
  	private stopBtn: HTMLElement | null = null;
  	private sendHint: HTMLElement | null = null;
  ```
  Replace with:
  ```typescript
  	// UI elements
  	private stopBtn: HTMLElement | null = null;
  ```

  Find the block near line 69:
  ```typescript
  	private ragActionItem: HTMLElement | null = null;
  	private webActionItem: HTMLElement | null = null;
  	private imageActionItem: HTMLElement | null = null;
  	private headerActionsContainer: HTMLElement | null = null;
  ```
  Replace with:
  ```typescript
  	private ragActionItem: HTMLElement | null = null;
  	private webActionItem: HTMLElement | null = null;
  	private imageActionItem: HTMLElement | null = null;
  ```

- [ ] **Step 2: Move `refreshModels()` call and default model setup to after chatInput creation**

  In `onOpen()`, find the section at line ~196:
  ```typescript
  		// Redirect legacy property references
  		this.modelSelect = this.chatHeader.modelSelect;

  		await this.refreshModels();

  		// Set default model if configured
  		if (this.plugin.settings.defaultModel && this.modelSelect.value === '') {
  			this.modelSelect.value = this.plugin.settings.defaultModel;
  		}
  		
  		// Update image button visibility based on the selected model's vision capability
  		await this.updateImageButtonVisibility();

  		// Chat messages container
  		this.chatContainer = this.mainChatContainer.createDiv('chat-messages');
  ```

  Replace with:
  ```typescript
  		// Chat messages container
  		this.chatContainer = this.mainChatContainer.createDiv('chat-messages');
  ```

  (The `modelSelect` redirect, `refreshModels`, default model, and `updateImageButtonVisibility` lines are deleted here and re-added after chatInput creation in Step 3.)

- [ ] **Step 3: Update chatInput instantiation and add post-creation setup**

  Find the section at line ~222:
  ```typescript
  		// Initialize Chat Input Component
  		this.chatInput = new ChatInputComponent(
  			this.mainChatContainer,
  			this.app,
  			this.plugin,
  			this.state,
  			{
  				onSendMessage: async (text) => await this.sendMessage(text),
  				onAttachImage: async () => await this.attachImage(),
  				onToggleRag: async () => await this.handleQuickActionRag(),
  				onToggleWeb: async () => await this.handleQuickActionWeb(),
  				onShowReferenceMenu: () => this.showReferenceMenu(),
  				onStopStreaming: () => {
  					this.state.stopStreamingRequested = true;
  					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
  					if (this.sendHint) this.sendHint.removeClass('ia-hidden');
  					new Notice(t('chat.notices.stopping'));
  				}
  			}
  		);

  		// Redirect legacy property references
  		this.inputContainer = this.chatInput.inputContainer;
  		this.referenceContainer = this.chatInput.referenceContainer;
  		this.attachmentContainer = this.chatInput.attachmentContainer;
  		this.ragActionItem = this.chatInput.ragActionItem;
  		this.webActionItem = this.chatInput.webActionItem;
  		this.imageActionItem = this.chatInput.imageActionItem;
  		this.headerActionsContainer = this.chatInput.headerActionsContainer;
  		this.stopBtn = this.chatInput.stopBtn;
  		this.sendHint = this.chatInput.sendHint;
  ```

  Replace with:
  ```typescript
  		// Initialize Chat Input Component
  		this.chatInput = new ChatInputComponent(
  			this.mainChatContainer,
  			this.app,
  			this.plugin,
  			this.state,
  			{
  				onSendMessage: async (text) => await this.sendMessage(text),
  				onAttachImage: async () => await this.attachImage(),
  				onToggleRag: async () => await this.handleQuickActionRag(),
  				onToggleWeb: async () => await this.handleQuickActionWeb(),
  				onShowReferenceMenu: () => this.showReferenceMenu(),
  				onStopStreaming: () => {
  					this.state.stopStreamingRequested = true;
  					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
  					new Notice(t('chat.notices.stopping'));
  				},
  				onModeChange: (mode) => this.handleModeChange(mode),
  				onModelChange: () => this.onModelChange(),
  				onAgentChange: (agentId) => this.handleAgentSelection(agentId)
  			}
  		);

  		// Redirect property references
  		this.inputContainer = this.chatInput.inputContainer;
  		this.referenceContainer = this.chatInput.referenceContainer;
  		this.attachmentContainer = this.chatInput.attachmentContainer;
  		this.ragActionItem = this.chatInput.ragActionItem;
  		this.webActionItem = this.chatInput.webActionItem;
  		this.imageActionItem = this.chatInput.imageActionItem;
  		this.stopBtn = this.chatInput.stopBtn;
  		this.modelSelect = this.chatInput.modelSelect;

  		await this.refreshModels();

  		// Set default model if configured
  		if (this.plugin.settings.defaultModel && this.modelSelect.value === '') {
  			this.modelSelect.value = this.plugin.settings.defaultModel;
  		}

  		// Update image button visibility based on the selected model's vision capability
  		await this.updateImageButtonVisibility();
  ```

---

### Task 3: Update chat-view.ts — streaming, model options, agent select

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Fix `onStreamingStateChange` callback in `chatController.configure()`**

  Find around line 335:
  ```typescript
  			onStreamingStateChange: (isStreaming: boolean) => {
  				if (isStreaming) {
  					if (this.stopBtn) this.stopBtn.removeClass('ia-hidden');
  					if (this.sendHint) this.sendHint.addClass('ia-hidden');
  				} else {
  					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
  					if (this.sendHint) this.sendHint.removeClass('ia-hidden');
  				}
  			},
  ```

  Replace with:
  ```typescript
  			onStreamingStateChange: (isStreaming: boolean) => {
  				if (isStreaming) {
  					if (this.stopBtn) this.stopBtn.removeClass('ia-hidden');
  				} else {
  					if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
  				}
  			},
  ```

- [ ] **Step 2: Update `updateModelOptions()` to use chatInput**

  Find around line 400:
  ```typescript
  	private updateModelOptions() {
  		this.chatHeader.updateModelOptions();
  	}
  ```

  Replace with:
  ```typescript
  	private updateModelOptions() {
  		this.chatInput.updateModelOptions();
  	}
  ```

- [ ] **Step 3: Update `updateImageButtonVisibility()` to use chatInput**

  Find around line 409:
  ```typescript
  	private async updateImageButtonVisibility() {
  		if (!this.imageActionItem) return;
  		const selectedModel = this.modelSelect?.value || '';
  		const supportsVision = selectedModel && await this.modelSupportsVision(selectedModel);
  		const available = this.state.mode === 'chat' && supportsVision;
  		this.imageActionItem.toggleClass('is-disabled', !available);
  		const status = this.imageActionItem.querySelector('.header-action-status');
  		if (status) {
  			status.textContent = available ? t('chat.status.available') : t('chat.status.unavailable');
  		}
  	}
  ```

  Replace with:
  ```typescript
  	private async updateImageButtonVisibility() {
  		const selectedModel = this.modelSelect?.value || '';
  		const supportsVision = selectedModel && await this.modelSupportsVision(selectedModel);
  		const available = this.state.mode === 'chat' && !!supportsVision;
  		this.chatInput.setImageButtonVisible(available);
  	}
  ```

- [ ] **Step 4: Replace `refreshAgentSelect()` body in ChatView with delegation to chatInput**

  Find around line 1275:
  ```typescript
  	private refreshAgentSelect(preferredAgentId?: string): string | null {
  		if (!this.chatHeader.agentSelector) return null;

  		const selectEl = this.chatHeader.agentSelector;
  		const agents = this.plugin.settings.agents;
  		// ... (full ~45-line body)
  		return null;
  	}
  ```

  Replace the entire method with:
  ```typescript
  	private refreshAgentSelect(preferredAgentId?: string): string | null {
  		return this.chatInput.refreshAgentSelect(preferredAgentId);
  	}
  ```

  (All callers of `this.refreshAgentSelect(...)` throughout `chat-view.ts` now automatically use `chatInput`. No other call sites need to change.)

---

### Task 4: Update chat-view.ts — mode selector references

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Update `updateOptionsDisplay()` — remove headerActionsContainer toggle, add chatInput mode update**

  Find around line 745:
  ```typescript
  	private async updateOptionsDisplay() {
  		if (this.headerActionsContainer) {
  			this.headerActionsContainer.toggleClass('ia-hidden', this.state.mode === 'agent');
  		}

  		this.updatePromptSelectorVisibility();
  		this.updateAgentSelectorVisibility();
  		await this.updateQuickActionsState();
  		this.updateModelControlDisplay();
  	}
  ```

  Replace with:
  ```typescript
  	private async updateOptionsDisplay() {
  		this.chatInput.updateModeSelector(this.state.mode);
  		this.updatePromptSelectorVisibility();
  		await this.updateQuickActionsState();
  		this.updateModelControlDisplay();
  	}
  ```

  (Note: `updateAgentSelectorVisibility()` is removed because `chatInput.updateModeSelector()` handles the pill switching. `updatePromptSelectorVisibility()` still works — it references `chatHeader.promptSelector` which still exists until Plan 3.)

- [ ] **Step 2: Update `handleModeChange()` — use chatInput.updateModeSelector**

  Find around line 967:
  ```typescript
  		if (this.chatHeader.modeSelector) {
  			this.chatHeader.modeSelector.value = mode;
  		}

  		await this.updateOptionsDisplay();
  ```

  Replace with:
  ```typescript
  		this.chatInput.updateModeSelector(mode);

  		await this.updateOptionsDisplay();
  ```

- [ ] **Step 3: Update `handleAgentSelection()` — use chatInput.updateModeSelector**

  Find around line 976:
  ```typescript
  	private async handleAgentSelection(selectedId: string) {
  		this.state.mode = 'agent';
  		if (this.chatHeader.modeSelector) {
  			this.chatHeader.modeSelector.value = 'agent';
  		}
  ```

  Replace with:
  ```typescript
  	private async handleAgentSelection(selectedId: string) {
  		this.state.mode = 'agent';
  		this.chatInput.updateModeSelector('agent');
  ```

- [ ] **Step 4: Update `applyConversationConfig()` — use chatInput selectors**

  Find around line 1020:
  ```typescript
  		if (this.chatHeader.modeSelector) {
  			this.chatHeader.modeSelector.value = this.state.mode;
  		}
  ```
  Replace with:
  ```typescript
  		this.chatInput.updateModeSelector(this.state.mode);
  ```

  Find around line 1051:
  ```typescript
  			if (this.chatHeader.agentSelector) {
  				this.chatHeader.agentSelector.value = desiredAgentId || '';
  			}
  ```
  Replace with:
  ```typescript
  			if (this.chatInput.agentSelector) {
  				this.chatInput.agentSelector.value = desiredAgentId || '';
  			}
  ```

  Find around line 1066:
  ```typescript
  			if (this.chatHeader.agentSelector) {
  				this.chatHeader.agentSelector.value = '';
  			}
  ```
  Replace with:
  ```typescript
  			if (this.chatInput.agentSelector) {
  				this.chatInput.agentSelector.value = '';
  			}
  ```

- [ ] **Step 5: Update `resetToDefaultChatConfiguration()` — use chatInput selectors**

  Find around line 1134:
  ```typescript
  			if (this.chatHeader.modeSelector) this.chatHeader.modeSelector.value = 'agent';
  ```
  Replace with:
  ```typescript
  			this.chatInput.updateModeSelector('agent');
  ```

  Find around line 1146:
  ```typescript
  			if (this.chatHeader.agentSelector) this.chatHeader.agentSelector.value = agentId;
  ```
  Replace with:
  ```typescript
  			if (this.chatInput.agentSelector) this.chatInput.agentSelector.value = agentId;
  ```

  Find around line 1162:
  ```typescript
  			if (this.chatHeader.modeSelector) this.chatHeader.modeSelector.value = 'chat';
  ```
  Replace with:
  ```typescript
  			this.chatInput.updateModeSelector('chat');
  ```

  Find around line 1168:
  ```typescript
  			if (this.chatHeader.agentSelector) this.chatHeader.agentSelector.value = '';
  ```
  Replace with:
  ```typescript
  			if (this.chatInput.agentSelector) this.chatInput.agentSelector.value = '';
  ```

---

### Task 5: Verify and commit

**Files:**
- Verify: `src/presentation/components/chat/chat-input.component.ts`
- Verify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Run lint and build**

  ```bash
  npm run lint && npm run build
  ```

  Expected: no TypeScript errors, no lint warnings. The build must succeed.

  Common issues to check if it fails:
  - `this.sendHint` still referenced somewhere → grep for `sendHint` in `chat-view.ts` and remove remaining references
  - `this.headerActionsContainer` still referenced → grep and remove
  - `chatHeader.modeSelector` still referenced → grep and replace with `chatInput.updateModeSelector()`

- [ ] **Step 2: Deploy to local sandbox**

  ```bash
  node scripts/deploy.js --local
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/presentation/components/chat/chat-input.component.ts src/presentation/views/chat-view.ts
  git commit -m "feat: add input toolbar with mode/model/agent pills, move selectors from header to input"
  ```
