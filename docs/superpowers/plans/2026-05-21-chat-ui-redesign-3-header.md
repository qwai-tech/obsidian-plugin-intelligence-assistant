# Chat UI Redesign — Plan 3: ChatHeaderComponent Simplification + Final Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-row `ChatHeaderComponent` (3 rows, card borders, parameter sliders) with a single-row minimal header (history icon + title + agent badge + new chat icon). Remove all references to the deleted header fields from `chat-view.ts`. Hide the old `chat-toolbar-b` via CSS and make `chat-input-container` transparent. **This plan completes the A3 redesign.**

**Architecture:** Full rewrite of `chat-header.component.ts` (426 → ~70 lines). `chat-view.ts` loses ~30 references to old header fields and ~5 methods become stubs or are deleted. `styles.css` gets 3 existing rules modified. `chat-input.component.ts` is **untouched** in this plan.

**Tech Stack:** TypeScript, Obsidian DOM API, CSS custom properties.

**Prerequisite:** Plan 2 must be merged first. After Plan 2, `chat-view.ts` no longer references `chatHeader.modeSelector`, `chatHeader.agentSelector`, `chatHeader.modelSelect`, or `chatHeader.updateModelOptions()`. Plan 3 removes the remaining references to parameters (temperature, maxTokens, topP, etc.), prompt selector, model controls container, and agent summary elements.

---

## File map

| File | Change |
|------|--------|
| `src/presentation/components/chat/chat-header.component.ts` | Full rewrite (~70 lines) |
| `src/presentation/views/chat-view.ts` | Remove ~30 old header field references, delete 5 methods |
| `styles.css` | Modify 3 existing rules |

---

### Task 1: Rewrite ChatHeaderComponent

**Files:**
- Modify: `src/presentation/components/chat/chat-header.component.ts`

- [ ] **Step 1: Replace the entire file with the simplified implementation**

  ```typescript
  import { setIcon } from 'obsidian';
  import type IntelligenceAssistantPlugin from '@plugin';
  import { ChatViewState } from '@/presentation/state/chat-view-state';
  import { t } from '@/i18n';

  export interface ChatHeaderCallbacks {
  	onToggleConversations: () => Promise<void>;
  	onNewChat: () => Promise<void>;
  }

  export class ChatHeaderComponent {
  	public conversationTitleEl: HTMLElement;
  	private agentHeaderBadgeEl: HTMLElement;

  	constructor(
  		private parent: HTMLElement,
  		private plugin: IntelligenceAssistantPlugin,
  		private state: ChatViewState,
  		private callbacks: ChatHeaderCallbacks
  	) {
  		this.render();
  	}

  	private render() {
  		const header = this.parent.createDiv('chat-header-simple');

  		const historyBtn = header.createEl('button', { cls: 'chat-header-icon-btn' });
  		setIcon(historyBtn, 'list');
  		historyBtn.setAttr('title', t('chat.toggleConversationsTitle'));
  		historyBtn.addEventListener('click', (e) => {
  			e.preventDefault();
  			e.stopPropagation();
  			void this.callbacks.onToggleConversations();
  		});

  		this.conversationTitleEl = header.createEl('span', {
  			text: t('chat.currentConversation'),
  			cls: 'chat-header-title'
  		});

  		this.agentHeaderBadgeEl = header.createEl('span', { cls: 'chat-agent-header-badge ia-hidden' });

  		const newChatBtn = header.createEl('button', { cls: 'chat-header-icon-btn' });
  		setIcon(newChatBtn, 'plus');
  		newChatBtn.setAttr('title', t('chat.new'));
  		newChatBtn.addEventListener('click', (e) => {
  			e.preventDefault();
  			e.stopPropagation();
  			void this.callbacks.onNewChat();
  		});
  	}

  	public updateConversationTitle(title: string) {
  		if (this.conversationTitleEl) {
  			this.conversationTitleEl.setText(title || t('chat.currentConversation'));
  		}
  	}

  	public updateAgentBadge(name: string | null) {
  		if (!this.agentHeaderBadgeEl) return;
  		if (name) {
  			this.agentHeaderBadgeEl.setText(`🤖 ${name}`);
  			this.agentHeaderBadgeEl.removeClass('ia-hidden');
  		} else {
  			this.agentHeaderBadgeEl.addClass('ia-hidden');
  		}
  	}
  }
  ```

- [ ] **Step 2: Verify the build FAILS as expected**

  ```bash
  npm run build 2>&1 | head -60
  ```

  Expected: TypeScript errors because `chat-view.ts` still references deleted fields (`chatHeader.temperatureSlider`, `chatHeader.agentConfigSummaryEl`, `chatHeader.promptSelector`, `chatHeader.onSettingsOpen`, etc.). Fix these in Tasks 2–4.

---

### Task 2: Update ChatHeaderComponent instantiation in chat-view.ts

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Replace the ChatHeaderComponent constructor call**

  Find around line 162 (the full instantiation object with 12 callbacks):
  ```typescript
  		// Initialize Chat Header Component
  		this.chatHeader = new ChatHeaderComponent(
  			this.mainChatContainer,
  			this.app,
  			this.plugin,
  			this.state,
  			{
  				onToggleConversations: () => this.toggleConversationListVisibility(),
  				onNewChat: async () => {
  					await this.resetToDefaultChatConfiguration();
  					await this.conversationManager.createNewConversation();
  				},
  				onModelChange: () => this.onModelChange(),
  				onSettingsOpen: () => {
  					const settingApi = (this.app as any).setting;
  					if (settingApi) {
  						settingApi.open();
  						settingApi.openTabById('intelligence-assistant');
  					}
  				},
  				onTemperatureChange: (val) => { this.state.temperature = val; },
  				onMaxTokensChange: (val) => { this.state.maxTokens = val; },
  				onTopPChange: (val) => { this.state.topP = val; },
  				onFrequencyPenaltyChange: (val) => { this.state.frequencyPenalty = val; },
  				onPresencePenaltyChange: (val) => { this.state.presencePenalty = val; },
  				onModeChange: (mode) => this.handleModeChange(mode),
  				onPromptChange: async (promptId) => {
  					this.plugin.settings.activeSystemPromptId = promptId;
  					await this.plugin.saveSettings();
  				},
  				onAgentChange: (agentId) => this.handleAgentSelection(agentId)
  			}
  		);
  ```

  Replace with:
  ```typescript
  		// Initialize Chat Header Component
  		this.chatHeader = new ChatHeaderComponent(
  			this.mainChatContainer,
  			this.plugin,
  			this.state,
  			{
  				onToggleConversations: () => this.toggleConversationListVisibility(),
  				onNewChat: async () => {
  					await this.resetToDefaultChatConfiguration();
  					await this.conversationManager.createNewConversation();
  				}
  			}
  		);
  ```

---

### Task 3: Remove methods from chat-view.ts that only operated on deleted header fields

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Delete `updatePromptSelectorVisibility()` method**

  Find and delete the entire method (around line 756):
  ```typescript
  	private updatePromptSelectorVisibility() {
  		if (!this.chatHeader.promptSelector) return;
  		if (this.state.mode === 'agent') {
  			this.chatHeader.promptSelector.addClass('ia-hidden');
  			this.chatHeader.promptSelector.disabled = true;
  			if (this.chatHeader.promptSelectorGroup) this.chatHeader.promptSelectorGroup.addClass('ia-hidden');
  		} else {
  			this.chatHeader.promptSelector.removeClass('ia-hidden');
  			this.chatHeader.promptSelector.disabled = false;
  			if (this.chatHeader.promptSelectorGroup) this.chatHeader.promptSelectorGroup.removeClass('ia-hidden');
  		}
  	}
  ```

  Also remove its call site in `updateOptionsDisplay()`. Find:
  ```typescript
  		this.chatInput.updateModeSelector(this.state.mode);
  		this.updatePromptSelectorVisibility();
  		await this.updateQuickActionsState();
  ```
  Replace with:
  ```typescript
  		this.chatInput.updateModeSelector(this.state.mode);
  		await this.updateQuickActionsState();
  ```

- [ ] **Step 2: Delete `updateModelControlDisplay()` method**

  Find and delete the entire method (around line 794):
  ```typescript
  	private updateModelControlDisplay() {
  		const isAgentMode = this.state.mode === 'agent';
  		// ... (~26 lines)
  	}
  ```

  Also remove its call site in `updateOptionsDisplay()`. Find:
  ```typescript
  		this.chatInput.updateModeSelector(this.state.mode);
  		await this.updateQuickActionsState();
  		this.updateModelControlDisplay();
  ```
  Replace with:
  ```typescript
  		this.chatInput.updateModeSelector(this.state.mode);
  		await this.updateQuickActionsState();
  ```

- [ ] **Step 3: Delete `renderAgentSummary()` and `createAgentSummaryChip()` methods**

  Find and delete both methods (around lines 822–848). They reference `chatHeader.agentSummaryDetailsEl` and `chatHeader.agentSummaryTitleEl`.

- [ ] **Step 4: Delete `updateTemperatureDisplay()` method**

  Find and delete (around line 914):
  ```typescript
  	private updateTemperatureDisplay(value: number) {
  		if (this.chatHeader.temperatureSlider) {
  			this.chatHeader.temperatureSlider.value = value.toString();
  		}
  		if (this.chatHeader.temperatureValueEl) {
  			this.chatHeader.temperatureValueEl.setText(this.formatTemperature(value));
  		}
  	}
  ```

- [ ] **Step 5: Delete `populatePromptSelectorOptions()` method**

  Find and delete (around line 923):
  ```typescript
  	private populatePromptSelectorOptions() {
  		if (!this.chatHeader.promptSelector) return;
  		// ... (~10 lines)
  	}
  ```

---

### Task 4: Clean up remaining chatHeader field references in chat-view.ts

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Fix `updateConversationTitle()` — remove hardcoded string**

  Find around line 1013:
  ```typescript
  	private updateConversationTitle(title: string) {
  		if (this.chatHeader.conversationTitleEl) {
  			this.chatHeader.conversationTitleEl.setText(title || 'Current Conversation');
  		}
  	}
  ```
  Replace with:
  ```typescript
  	private updateConversationTitle(title: string) {
  		this.chatHeader.updateConversationTitle(title);
  	}
  ```

- [ ] **Step 2: Fix `updateTokenSummary()` — remove the chatHeader call**

  Find around line 740:
  ```typescript
  	private updateTokenSummary() {
  		const summary = this.conversationManager.getTokenSummary();
  		this.chatHeader.updateTokenSummary(`Tokens: ${summary.total} (${summary.prompt} input + ${summary.completion} output)`);
  	}
  ```
  Replace with:
  ```typescript
  	private updateTokenSummary() {
  		// Token counts are no longer displayed in the chat UI (moved to Settings)
  	}
  ```

- [ ] **Step 3: Clean up `applyStoredConfigControls()` — remove header element updates**

  Find around line 1083. The method currently sets `chatHeader.maxTokensInput.value`, `chatHeader.topPSlider.value`, `chatHeader.topPValueEl.setText()`, `chatHeader.frequencyPenaltySlider.value`, `chatHeader.frequencyPenaltyValueEl.setText()`, `chatHeader.presencePenaltySlider.value`, `chatHeader.presencePenaltyValueEl.setText()`.

  Replace the entire method with a version that only updates `this.state` (no UI elements):
  ```typescript
  	private applyStoredConfigControls(config: ConversationConfig) {
  		if (config.modelId) {
  			this.setModelSelection(config.modelId);
  		}
  		if (typeof config.temperature === 'number') {
  			this.state.temperature = config.temperature;
  		}
  		if (typeof config.maxTokens === 'number') {
  			this.state.maxTokens = config.maxTokens;
  		}
  		if (typeof config.topP === 'number') {
  			this.state.topP = config.topP;
  		}
  		if (typeof config.frequencyPenalty === 'number') {
  			this.state.frequencyPenalty = config.frequencyPenalty;
  		}
  		if (typeof config.presencePenalty === 'number') {
  			this.state.presencePenalty = config.presencePenalty;
  		}
  		if (typeof config.ragEnabled === 'boolean') {
  			this.state.enableRAG = config.ragEnabled;
  		}
  		if (typeof config.webSearchEnabled === 'boolean') {
  			this.state.enableWebSearch = config.webSearchEnabled;
  		}
  	}
  ```

- [ ] **Step 4: Clean up `resetToDefaultChatConfiguration()` — remove header element updates**

  Find references to `chatHeader.promptSelector`, `chatHeader.maxTokensInput`, `chatHeader.topPSlider`, `chatHeader.topPValueEl`, `chatHeader.frequencyPenaltySlider`, `chatHeader.frequencyPenaltyValueEl`, `chatHeader.presencePenaltySlider`, `chatHeader.presencePenaltyValueEl`, and `this.updateTemperatureDisplay(...)` in this method. Remove each one.

  Specifically, remove these lines from `resetToDefaultChatConfiguration()`:
  - `if (this.chatHeader.promptSelector) { this.chatHeader.promptSelector.value = ''; }` (two occurrences)
  - `this.updateTemperatureDisplay(defaultTemperature);`
  - `if (this.chatHeader.maxTokensInput) { this.chatHeader.maxTokensInput.value = defaultMaxTokens.toString(); }`
  - `if (this.chatHeader.topPSlider) this.chatHeader.topPSlider.value = defaultTopP.toString();`
  - `if (this.chatHeader.topPValueEl) this.chatHeader.topPValueEl.setText(defaultTopP.toFixed(2));`
  - `if (this.chatHeader.frequencyPenaltySlider) this.chatHeader.frequencyPenaltySlider.value = defaultPenalty.toString();`
  - `if (this.chatHeader.frequencyPenaltyValueEl) this.chatHeader.frequencyPenaltyValueEl.setText(defaultPenalty.toFixed(1));`
  - `if (this.chatHeader.presencePenaltySlider) this.chatHeader.presencePenaltySlider.value = defaultPenalty.toString();`
  - `if (this.chatHeader.presencePenaltyValueEl) this.chatHeader.presencePenaltyValueEl.setText(defaultPenalty.toFixed(1));`

  The `this.state.temperature = ...` and `this.state.maxTokens = ...` state assignments must be kept.

- [ ] **Step 5: Clean up `applyConversationConfig()` — remove prompt selector and parameter slider references**

  Find references to `chatHeader.promptSelector` in `applyConversationConfig()` and remove them. These are UI sync calls (`chatHeader.promptSelector.value = promptToUse`) — the state (`plugin.settings.activeSystemPromptId`) update must be kept.

- [ ] **Step 6: Clean up `applyAgentConfig()` — remove header element updates**

  Find around line 1332:
  ```typescript
  		// Update UI elements if they exist
  		if (this.chatHeader.temperatureSlider) {
  			this.chatHeader.temperatureSlider.value = String(agent.temperature);
  		}
  		if (this.chatHeader.maxTokensInput) {
  			this.chatHeader.maxTokensInput.value = String(agent.maxTokens);
  		}
  ```
  Remove these 6 lines. The `this.state.temperature = agent.temperature` and `this.state.maxTokens = agent.maxTokens` assignments above them must be kept.

- [ ] **Step 7: Add `chatHeader.updateAgentBadge()` calls to show/hide agent badge**

  In `handleModeChange()`, after `this.chatInput.updateModeSelector(mode)`:
  ```typescript
  		this.chatInput.updateModeSelector(mode);
  		// Add:
  		if (mode === 'agent') {
  			const activeAgent = this.getActiveAgent();
  			this.chatHeader.updateAgentBadge(activeAgent ? `${activeAgent.icon || '🤖'} ${activeAgent.name}` : null);
  		} else {
  			this.chatHeader.updateAgentBadge(null);
  		}
  ```

  In `applyAgentConfig()`, after agent config is applied and before the Notice:
  ```typescript
  		this.chatInput.refreshAgentSelect(agentId);
  		this.chatHeader.updateAgentBadge(`${agent.icon || '🤖'} ${agent.name ?? 'unknown'}`);
  ```

  In `resetToDefaultChatConfiguration()`, when switching to chat mode:
  ```typescript
  		this.chatInput.updateModeSelector('chat');
  		this.chatHeader.updateAgentBadge(null);  // Add this line
  ```

---

### Task 5: Modify existing CSS rules

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Hide `.chat-toolbar-b`**

  Find the `.chat-toolbar-b` rule at line 3492:
  ```css
  .chat-toolbar-b {
  	display: flex;
  	align-items: center;
  	gap: 8px;
  	flex-wrap: wrap;
  	margin-bottom: 8px;
  	padding: 6px 8px;
  	border: 1px solid var(--background-modifier-border);
  	border-radius: 8px;
  	background: var(--background-secondary);
  }
  ```
  Replace with:
  ```css
  .chat-toolbar-b {
  	display: none;
  }
  ```

- [ ] **Step 2: Make `.chat-input-container` transparent**

  Find the `.chat-input-container` rule at line 3473:
  ```css
  .chat-input-container {
  	margin-top: 12px;
  	padding: 12px;
  	background: var(--background-secondary);
  	border: 1px solid var(--background-modifier-border);
  	border-radius: 10px;
  	display: flex;
  	flex-direction: column;
  	gap: 10px;
  }
  ```
  Replace with:
  ```css
  .chat-input-container {
  	margin-top: 4px;
  	padding: 6px 10px 10px;
  	background: transparent;
  	border: none;
  	border-radius: 0;
  	display: flex;
  	flex-direction: column;
  	gap: 4px;
  }
  ```

- [ ] **Step 3: Remove border from `.chat-input-editor`**

  Find the `.chat-input-editor` rule at line 3855:
  ```css
  .chat-input-editor {
  	display: flex;
  	align-items: flex-end;
  	gap: 8px;
  	border: 1px solid var(--background-modifier-border);
  	border-radius: 8px;
  	background: var(--background-primary);
  	padding: 4px;
  }
  ```
  Replace with:
  ```css
  .chat-input-editor {
  	display: flex;
  	align-items: flex-end;
  	gap: 8px;
  	padding: 8px 10px;
  }
  ```

---

### Task 6: Verify, deploy, commit

- [ ] **Step 1: Run lint and build**

  ```bash
  npm run lint && npm run build
  ```

  Expected: no errors. If there are TypeScript errors, grep for any remaining `chatHeader.` references that still use deleted fields:
  ```bash
  grep -n "chatHeader\." src/presentation/views/chat-view.ts
  ```
  Any reference to a field that no longer exists in the new `ChatHeaderComponent` (anything other than `conversationTitleEl`, `updateConversationTitle`, `updateAgentBadge`) must be removed.

- [ ] **Step 2: Deploy to local Obsidian**

  ```bash
  node scripts/deploy.js --local
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/presentation/components/chat/chat-header.component.ts \
          src/presentation/views/chat-view.ts \
          styles.css
  git commit -m "feat: simplify header to single row, remove parameter controls from chat UI"
  ```
