# ChatView Decomposition Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `chat-view.ts` from 2244 lines to ~1400 by extracting three independent concerns: vault export operations, RAG status display, and the full message-sending pipeline.

**Architecture:** Three focused classes are extracted. `VaultExportService` handles "save/insert message to vault" with no view dependencies. `RagStatusPanel` owns all RAG toggle and stats UI. `ChatController` is upgraded to own the full message-sending pipeline (currently spread across ChatView's `sendMessage`, `handleAssistantResponse`, `runAgentLoop`, `finalizeStreamingUI`). ChatView wires all three together and delegates.

**Tech Stack:** TypeScript, Obsidian Plugin API, Jest for unit tests.

---

## File Structure

**Create:**
- `src/application/services/vault-export-service.ts` — extracts `saveMessageToNewNote`, `insertMessageToNote` from chat-view.ts (~90 lines)
- `src/presentation/components/chat/rag-status-panel.ts` — extracts `updateRagStatus`, `buildRagTooltip`, `openRagStatsModal`, `showRagStatsModal`, `displayRagSources` from chat-view.ts (~215 lines)
- `src/__tests__/application/vault-export-service.test.ts`
- `src/__tests__/presentation/chat-controller-message.test.ts`

**Modify:**
- `src/presentation/components/chat/controllers/chat-controller.ts` — replace the current placeholder `sendMessage/generateResponse` with the full pipeline from chat-view.ts
- `src/presentation/views/chat-view.ts` — delete 5 extracted methods; delegate `sendMessage` and `regenerateMessage` to ChatController; wire RagStatusPanel

---

### Task 1: VaultExportService — test

**Files:**
- Create: `src/__tests__/application/vault-export-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/application/vault-export-service.test.ts
import { VaultExportService } from '../../application/services/vault-export-service';
import type { Message } from '../../types';

jest.mock('obsidian', () => ({
	Notice: jest.fn(),
	TFile: class TFile {},
}));

jest.mock('../../i18n', () => ({ t: (key: string, args?: Record<string,unknown>) => args ? `${key}:${JSON.stringify(args)}` : key }));

jest.mock('../../presentation/components/modals/text-input-modal', () => ({
	TextInputModal: jest.fn().mockImplementation((_app: unknown, _title: unknown, _placeholder: unknown, _default: unknown, cb: (v: string) => void) => ({
		open: () => cb('My Note'),
	})),
}));

jest.mock('../../presentation/components/modals/single-file-selection-modal', () => ({
	SingleFileSelectionModal: jest.fn().mockImplementation((_app: unknown, cb: (f: unknown) => void) => ({
		open: () => cb(null),
	})),
}));

function makeAssistantMessage(overrides: Partial<Message> = {}): Message {
	return { role: 'assistant', content: 'Hello world', model: 'gpt-4o', ...overrides };
}

describe('VaultExportService', () => {
	describe('saveToNewNote', () => {
		it('creates a vault file when user provides a note name', async () => {
			const createFn = jest.fn().mockResolvedValue(undefined);
			const getAbstractFileByPath = jest.fn().mockReturnValue(null);
			const app = {
				vault: { create: createFn, getAbstractFileByPath },
				workspace: { getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }) },
			} as any;
			const svc = new VaultExportService(app);
			svc.saveToNewNote(makeAssistantMessage());
			// modal callback fires synchronously via mock
			await new Promise(r => setTimeout(r, 0)); // flush promises
			expect(createFn).toHaveBeenCalledTimes(1);
			const [fileName, content] = createFn.mock.calls[0];
			expect(fileName).toContain('My Note');
			expect(content).toContain('Hello world');
		});
	});

	describe('insertIntoNote', () => {
		it('falls back to saveToNewNote when no file is selected (null)', () => {
			const app = {
				vault: { create: jest.fn().mockResolvedValue(undefined), getAbstractFileByPath: jest.fn().mockReturnValue(null) },
				workspace: { getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }) },
			} as any;
			const svc = new VaultExportService(app);
			const saveToNewNoteSpy = jest.spyOn(svc, 'saveToNewNote');
			svc.insertIntoNote(makeAssistantMessage());
			expect(saveToNewNoteSpy).toHaveBeenCalledWith(makeAssistantMessage());
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/__tests__/application/vault-export-service.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../application/services/vault-export-service'`

---

### Task 2: VaultExportService — implementation

**Files:**
- Create: `src/application/services/vault-export-service.ts`

- [ ] **Step 3: Implement VaultExportService**

Copy logic verbatim from `chat-view.ts` methods `saveMessageToNewNote` (lines 921–969) and `insertMessageToNote` (lines 972–1011). Reshape into a service class.

```typescript
// src/application/services/vault-export-service.ts
import { App, Notice, TFile } from 'obsidian';
import { t } from '@/i18n';
import { TextInputModal } from '@/presentation/components/modals/text-input-modal';
import { SingleFileSelectionModal } from '@/presentation/components/modals/single-file-selection-modal';
import type { Message } from '@/types';

export class VaultExportService {
	constructor(private readonly app: App) {}

	saveToNewNote(message: Message): void {
		const defaultName = `Chat Message ${new Date().toLocaleDateString()}`;
		new TextInputModal(
			this.app,
			'Create New Note',
			'Enter note name',
			defaultName,
			(noteName) => {
				void this.doSaveToNewNote(noteName, message);
			}
		).open();
	}

	insertIntoNote(message: Message): void {
		new SingleFileSelectionModal(this.app, (selectedFile) => {
			if (selectedFile) {
				void this.doInsertIntoNote(selectedFile as TFile, message);
			} else {
				this.saveToNewNote(message);
			}
		}).open();
	}

	private async doSaveToNewNote(noteName: string | null, message: Message): Promise<void> {
		if (!noteName || !noteName.trim()) return;
		try {
			const fileName = noteName.replace(/[\\/:*?"<>|]/g, '-') + '.md';
			let content = `# ${noteName}\n\n`;
			content += `Created from AI chat on ${new Date().toLocaleString()}\n\n---\n\n`;
			if (message.role === 'user') {
				content += `## 💬 User Message\n\n`;
			} else {
				const modelName = (message as { model?: string }).model || 'Assistant';
				content += `## 🤖 ${modelName}\n\n`;
			}
			content += message.content + '\n';
			await this.app.vault.create(fileName, content);
			new Notice(t('chat.notices.noteCreated', { name: fileName }));
			const file = this.app.vault.getAbstractFileByPath(fileName);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error creating note:', errMsg);
			new Notice(t('chat.notices.noteCreateFailed', { message: errMsg }));
		}
	}

	private async doInsertIntoNote(selectedFile: TFile, message: Message): Promise<void> {
		try {
			let content = await this.app.vault.read(selectedFile);
			content += `\n\n---\n\n`;
			if (message.role === 'user') {
				content += `## 💬 User Message (${new Date().toLocaleString()})\n\n`;
			} else {
				const modelName = (message as { model?: string }).model || 'Assistant';
				content += `## 🤖 ${modelName} (${new Date().toLocaleString()})\n\n`;
			}
			content += message.content + '\n';
			await this.app.vault.modify(selectedFile, content);
			new Notice(t('chat.notices.messageInserted', { path: selectedFile.path }));
			await this.app.workspace.getLeaf(false).openFile(selectedFile);
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error inserting to note:', errMsg);
			new Notice(t('chat.notices.messageInsertFailed', { message: errMsg }));
		}
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/__tests__/application/vault-export-service.test.ts --no-coverage
```

Expected: PASS (all 2 tests)

- [ ] **Step 5: Wire VaultExportService into ChatView**

In `src/presentation/views/chat-view.ts`:

**5a. Add import** (after existing imports):
```typescript
import { VaultExportService } from '@/application/services/vault-export-service';
```

**5b. Add field** (in class properties section, after `private chatService`):
```typescript
private vaultExportService: VaultExportService;
```

**5c. Initialize in constructor** (after `this.chatService = new ChatService(...)`):
```typescript
this.vaultExportService = new VaultExportService(this.app);
```

**5d. Replace `saveMessageToNewNote` method body** with a one-liner:
```typescript
private saveMessageToNewNote(message: Message) {
    this.vaultExportService.saveToNewNote(message);
}
```

**5e. Replace `insertMessageToNote` method body** with a one-liner:
```typescript
private insertMessageToNote(message: Message) {
    this.vaultExportService.insertIntoNote(message);
}
```

- [ ] **Step 6: Build to verify no errors**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✅ Build completed successfully`

- [ ] **Step 7: Commit**

```bash
git add src/application/services/vault-export-service.ts src/__tests__/application/vault-export-service.test.ts src/presentation/views/chat-view.ts
git commit -m "refactor: extract VaultExportService from ChatView"
```

---

### Task 3: RagStatusPanel — implementation

**Files:**
- Create: `src/presentation/components/chat/rag-status-panel.ts`

No new unit test for this component since it's a pure Obsidian DOM class (hard to unit test without the Obsidian environment). E2E tests cover the RAG toggle behavior.

- [ ] **Step 8: Create RagStatusPanel**

Copy logic verbatim from chat-view.ts methods `updateRagStatus` (lines 1142–1200), `buildRagTooltip` (lines 1202–1231), `openRagStatsModal` (lines 1233–1242), `showRagStatsModal` (lines 1244–1319), and `displayRagSources` (lines 1017–1073).

```typescript
// src/presentation/components/chat/rag-status-panel.ts
import { App, Modal, Notice, TFile } from 'obsidian';
import { t } from '@/i18n';
import type { RAGManager } from '@/infrastructure/rag-manager';
import type { RAGConfig } from '@/types';
import type { RAGSource } from '@/types';

type RagIndexStats = {
	chunkCount: number;
	fileCount: number;
	totalSize: number;
	indexedFiles: string[];
};

export class RagStatusPanel {
	constructor(
		private readonly app: App,
		private readonly ragManager: RAGManager,
		private readonly getEnableRAG: () => boolean,
		private readonly getMode: () => 'chat' | 'agent',
		private readonly getRagConfig: () => RAGConfig
	) {}

	async updateStatus(ragToggle: HTMLElement | null): Promise<void> {
		if (!ragToggle) return;

		const statusSpanEl = ragToggle.querySelector('.header-action-status');
		const statusSpan = statusSpanEl instanceof HTMLElement ? statusSpanEl : null;
		const ragEnabledInSettings = this.getRagConfig().enabled;

		if (!ragEnabledInSettings) {
			ragToggle.addClass('is-disabled');
			ragToggle.setAttr('title', 'Enable RAG in Settings → Chat Features → RAG.');
			if (statusSpan) {
				statusSpan.textContent = t('chat.status.disabled');
				statusSpan.addClass('ia-cursor-not-allowed');
				statusSpan.removeClass('ia-cursor-help');
				statusSpan.onclick = null;
			}
			return;
		}

		try {
			const stats = await this.ragManager.getDetailedStats();
			ragToggle.removeClass('is-disabled');
			const ragActive = this.getEnableRAG() && this.getMode() === 'chat';
			if (statusSpan) {
				if (ragActive) {
					const detail = stats.chunkCount > 0 ? `${stats.chunkCount} chunks` : 'No index';
					statusSpan.textContent = t('chat.status.on', { detail });
				} else {
					statusSpan.textContent = t('chat.status.off');
				}
				statusSpan.toggleClass('ia-cursor-help', !!stats);
				statusSpan.removeClass('ia-cursor-not-allowed');
				statusSpan.onclick = stats ? (event: MouseEvent) => {
					event.stopPropagation();
					void this.openStatsModal();
				} : null;
			}
			if (stats) {
				ragToggle.setAttr('title', this.buildTooltip(stats, ragActive));
			} else {
				ragToggle.removeAttribute('title');
			}
		} catch (_error) {
			ragToggle.addClass('is-disabled');
			if (statusSpan) {
				statusSpan.textContent = t('chat.status.unavailable');
				statusSpan.addClass('ia-cursor-not-allowed');
				statusSpan.removeClass('ia-cursor-help');
				statusSpan.onclick = null;
			}
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error updating RAG status:', errMsg);
		}
	}

	displaySources(messageBody: HTMLElement, ragSources: RAGSource[]): void {
		const existingContainer = messageBody.querySelector('.rag-sources-container');
		if (existingContainer) existingContainer.remove();

		const container = messageBody.createDiv('rag-sources-container');
		const header = container.createDiv('rag-sources-header');
		header.setText(t(ragSources.length === 1 ? 'chat.ragStats.retrieved' : 'chat.ragStats.retrieved_plural', { count: ragSources.length }));

		const grid = container.createDiv('rag-sources-grid');
		ragSources.forEach((source) => {
			const card = grid.createDiv('rag-source-card');
			const srcHeader = card.createDiv('rag-source-header');
			srcHeader.createDiv('rag-source-title').setText(source.title || source.path.split('/').pop() || source.path);
			const simEl = srcHeader.createDiv('rag-source-similarity');
			const pct = Math.round(source.similarity * 100);
			simEl.setText(`${pct}%`);
			simEl.setCssProps({ color: pct > 80 ? 'var(--text-success)' : pct > 60 ? 'var(--text-accent)' : 'var(--text-muted)' });
			card.createDiv('rag-source-path').setText(source.path);
			const preview = source.content.length > 150 ? source.content.substring(0, 150) + '...' : source.content;
			card.createDiv('rag-source-content').setText(preview);
			card.addClass('ia-clickable');
			card.addEventListener('click', () => {
				void (async () => {
					const file = this.app.vault.getAbstractFileByPath(source.path);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf().openFile(file);
					} else {
						new Notice(t('chat.notices.fileNotFound', { path: source.path }));
					}
				})();
			});
		});
	}

	private async openStatsModal(): Promise<void> {
		try {
			const stats = await this.ragManager.getDetailedStats();
			this.showStatsModal(stats);
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			console.error('Error loading RAG stats modal:', errMsg);
			new Notice(t('chat.notices.unableToLoadRag'));
		}
	}

	private buildTooltip(stats: RagIndexStats, ragActive: boolean): string {
		let text = `${t('chat.ragTooltip.status')}\n\n`;
		text += `${t('chat.ragTooltip.totalChunks', { count: stats.chunkCount })}\n`;
		text += `${t('chat.ragTooltip.filesIndexed', { count: stats.fileCount })}\n`;
		text += `${t('chat.ragTooltip.totalSize', { size: (stats.totalSize / 1024).toFixed(1) })}\n`;
		if (stats.indexedFiles?.length > 0) {
			text += `\n${t('chat.ragTooltip.indexedFiles')}\n`;
			stats.indexedFiles.slice(0, 10).forEach(f => {
				text += `  • ${f.split('/').pop() || f}\n`;
			});
			if (stats.indexedFiles.length > 10) {
				text += `${t('chat.ragTooltip.andMore', { count: stats.indexedFiles.length - 10 })}\n`;
			}
		} else {
			text += `\n${t('chat.ragTooltip.noFilesYet')}\n`;
			text += t('chat.ragTooltip.goToSettings');
		}
		if (!ragActive) text += `\n\n${t('chat.ragTooltip.ragOff')}`;
		return text;
	}

	private showStatsModal(stats: RagIndexStats): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText(t('chat.ragStats.title'));
		const content = modal.contentEl;
		content.empty();
		content.addClass('rag-stats-modal');

		const summaryDiv = content.createDiv('rag-stats-summary');
		[
			[t('chat.ragStats.totalChunks'), `${stats.chunkCount}`],
			[t('chat.ragStats.filesIndexed'), `${stats.fileCount}`],
			[t('chat.ragStats.totalSize'), `${(stats.totalSize / 1024).toFixed(1)} KB`],
			[t('chat.ragStats.avgChunks'), `${stats.fileCount > 0 ? (stats.chunkCount / stats.fileCount).toFixed(1) : '0'}`],
		].forEach(([label, value]) => {
			const row = summaryDiv.createDiv('stat-row');
			row.createSpan({ cls: 'stat-label', text: label });
			row.createSpan({ cls: 'stat-value', text: value });
		});

		if (stats.indexedFiles?.length > 0) {
			const filesDiv = content.createDiv('rag-stats-files');
			filesDiv.createEl('h4', { text: t('chat.ragStats.indexedFiles') });
			const fileList = filesDiv.createDiv('rag-file-list');
			stats.indexedFiles.forEach(filePath => {
				const fileItem = fileList.createDiv('rag-file-item');
				const fileName = filePath.split('/').pop() || filePath;
				const fileLink = fileItem.createEl('a', { text: fileName, cls: 'rag-file-link' });
				fileLink.title = filePath;
				fileLink.addEventListener('click', (e) => {
					e.preventDefault();
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(filePath);
						if (file instanceof TFile) {
							await this.app.workspace.getLeaf().openFile(file);
							modal.close();
						} else {
							new Notice(t('chat.notices.fileNotFound', { path: filePath }));
						}
					})();
				});
				fileItem.createEl('span', { text: filePath, cls: 'rag-file-path' });
			});
		} else {
			const noFiles = content.createDiv('rag-no-files');
			noFiles.createEl('p', { text: t('chat.ragStats.noFilesYet') });
			noFiles.createEl('p', { text: t('chat.ragStats.howToBuild') });
			const ol = noFiles.createEl('ol');
			[t('chat.ragStats.step1'), t('chat.ragStats.step2'), t('chat.ragStats.step3')]
				.forEach(step => ol.createEl('li', { text: step }));
		}

		const btnContainer = content.createDiv('modal-button-container');
		btnContainer.createEl('button', { text: t('chat.ragStats.close'), cls: 'mod-cta' })
			.addEventListener('click', () => modal.close());

		modal.open();
	}
}
```

- [ ] **Step 9: Wire RagStatusPanel into ChatView**

In `src/presentation/views/chat-view.ts`:

**9a. Add import:**
```typescript
import { RagStatusPanel } from '@/presentation/components/chat/rag-status-panel';
```

**9b. Add field** (in class properties, after `private chatService`):
```typescript
private ragStatusPanel: RagStatusPanel;
```

**9c. Initialize in constructor** (after `this.vaultExportService = new VaultExportService(...)`):
```typescript
this.ragStatusPanel = new RagStatusPanel(
    this.app,
    this.ragManager,
    () => this.state.enableRAG,
    () => this.state.mode,
    () => this.plugin.settings.ragConfig
);
```

**9d. Replace `updateRagStatus` method** with:
```typescript
private async updateRagStatus(target?: HTMLElement | null) {
    await this.ragStatusPanel.updateStatus(target ?? this.ragActionItem);
}
```

**9e. Replace `displayRagSources` method** with:
```typescript
private displayRagSources(messageBody: HTMLElement, ragSources: import('@/types').RAGSource[]): void {
    this.ragStatusPanel.displaySources(messageBody, ragSources);
}
```

**9f. Delete these 4 methods** entirely from chat-view.ts (they are now inside RagStatusPanel):
- `buildRagTooltip(stats, ragActive)`
- `openRagStatsModal()`
- `showRagStatsModal(stats)`
- The `RagIndexStats` type alias at the top of chat-view.ts (lines 46–51) — move it to rag-status-panel.ts, or keep it in chat-view.ts if needed elsewhere

- [ ] **Step 10: Build to verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✅ Build completed successfully`

- [ ] **Step 11: Commit**

```bash
git add src/presentation/components/chat/rag-status-panel.ts src/presentation/views/chat-view.ts
git commit -m "refactor: extract RagStatusPanel from ChatView"
```

---

### Task 4: ChatController — upgrade to own message pipeline

**Files:**
- Create: `src/__tests__/presentation/chat-controller-message.test.ts`
- Modify: `src/presentation/components/chat/controllers/chat-controller.ts`

The current `ChatController.sendMessage()` (lines 63–83) is a stub that uses `this.plugin.settings.defaultModel` without model-select awareness. ChatView has a full implementation at lines 406–488 that uses the selected model, builds reference context, handles streaming UI, saves conversation, etc. This task moves that full implementation into ChatController.

- [ ] **Step 12: Write failing tests for the upgraded ChatController**

```typescript
// src/__tests__/presentation/chat-controller-message.test.ts
import { ChatController } from '../../presentation/components/chat/controllers/chat-controller';
import { ChatViewState } from '../../presentation/state/chat-view-state';

jest.mock('obsidian', () => ({
	Notice: jest.fn(),
	TFolder: class TFolder { path = ''; name = ''; },
	Events: class Events {
		on() {}
		off() {}
		trigger() {}
		offref() {}
	},
}));

jest.mock('../../i18n', () => ({ t: (key: string) => key }));

function makeChatService(overrides: Partial<{
	findLLMConfig: jest.Mock;
	buildReferenceContext: jest.Mock;
	prepareLlmMessages: jest.Mock;
	streamResponse: jest.Mock;
	executeAgentLoop: jest.Mock;
}> = {}) {
	return {
		findLLMConfig: jest.fn().mockReturnValue({ provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }),
		buildReferenceContext: jest.fn().mockResolvedValue({ llmContent: 'hello', references: [] }),
		prepareLlmMessages: jest.fn().mockReturnValue([]),
		streamResponse: jest.fn().mockResolvedValue(undefined),
		executeAgentLoop: jest.fn().mockResolvedValue(undefined),
		...overrides,
	} as any;
}

function makePlugin(overrides: Partial<{ settings: Partial<{ llmConfigs: unknown[]; defaultModel: string; activeAgentId: string | null; agents: unknown[]; activeSystemPromptId: string | null; systemPrompts: unknown[] }> }> = {}) {
	return {
		settings: {
			llmConfigs: [{ id: 'p1', provider: 'openai', apiKey: 'k', modelId: 'gpt-4o' }],
			defaultModel: 'gpt-4o',
			activeAgentId: null,
			agents: [],
			activeSystemPromptId: null,
			systemPrompts: [],
			ragConfig: { enabled: false },
			...overrides.settings,
		},
		saveSettings: jest.fn().mockResolvedValue(undefined),
	} as any;
}

function makeConversationManager() {
	return { saveCurrentConversation: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeRagStatusPanel() {
	return { displaySources: jest.fn() } as any;
}

describe('ChatController (upgraded message pipeline)', () => {
	let state: ChatViewState;
	let controller: ChatController;

	beforeEach(() => {
		state = new ChatViewState();
		const app = {} as any;
		const plugin = makePlugin();
		controller = new ChatController(app, plugin, state);

		const messagesContainer = document.createElement('div');
		const chatContainer = document.createElement('div');
		const messageController = { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any;
		const agentController = {} as any;
		const chatService = makeChatService();
		const conversationManager = makeConversationManager();
		const ragStatusPanel = makeRagStatusPanel();

		controller.configure({
			messagesContainer,
			chatContainer,
			messageController,
			agentController,
			chatService,
			conversationManager,
			ragStatusPanel,
			getSelectedModel: () => 'gpt-4o',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => document.createElement('div'),
			findMessageBodyElement: () => document.createElement('div'),
			onStreamingStateChange: jest.fn(),
		});
	});

	it('returns early without calling chatService when state.isStreaming is true', async () => {
		state.isStreaming = true;
		const chatService = makeChatService();
		controller.configure({
			messagesContainer: document.createElement('div'),
			chatContainer: document.createElement('div'),
			messageController: { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any,
			agentController: {} as any,
			chatService,
			conversationManager: makeConversationManager(),
			ragStatusPanel: makeRagStatusPanel(),
			getSelectedModel: () => 'gpt-4o',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => document.createElement('div'),
			findMessageBodyElement: () => document.createElement('div'),
			onStreamingStateChange: jest.fn(),
		});

		await controller.sendMessage('hello');
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});

	it('returns early when llmConfigs is empty', async () => {
		const plugin = makePlugin({ settings: { llmConfigs: [] } });
		const localController = new ChatController({} as any, plugin, state);
		const chatService = makeChatService();
		localController.configure({
			messagesContainer: document.createElement('div'),
			chatContainer: document.createElement('div'),
			messageController: { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any,
			agentController: {} as any,
			chatService,
			conversationManager: makeConversationManager(),
			ragStatusPanel: makeRagStatusPanel(),
			getSelectedModel: () => '',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => document.createElement('div'),
			findMessageBodyElement: () => document.createElement('div'),
			onStreamingStateChange: jest.fn(),
		});
		await localController.sendMessage('hello');
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});

	it('adds user message to state and calls streamResponse in chat mode', async () => {
		const chatService = makeChatService();
		controller.configure({
			messagesContainer: document.createElement('div'),
			chatContainer: document.createElement('div'),
			messageController: { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any,
			agentController: {} as any,
			chatService,
			conversationManager: makeConversationManager(),
			ragStatusPanel: makeRagStatusPanel(),
			getSelectedModel: () => 'gpt-4o',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => document.createElement('div'),
			findMessageBodyElement: () => document.createElement('div'),
			onStreamingStateChange: jest.fn(),
		});

		await controller.sendMessage('hello world');
		expect(state.messages.some(m => m.role === 'user' && m.content === 'hello world')).toBe(true);
		expect(chatService.streamResponse).toHaveBeenCalledTimes(1);
	});

	it('calls executeAgentLoop in agent mode', async () => {
		state.mode = 'agent';
		const chatService = makeChatService();
		controller.configure({
			messagesContainer: document.createElement('div'),
			chatContainer: document.createElement('div'),
			messageController: { renderMessage: jest.fn().mockReturnValue(document.createElement('div')) } as any,
			agentController: {} as any,
			chatService,
			conversationManager: makeConversationManager(),
			ragStatusPanel: makeRagStatusPanel(),
			getSelectedModel: () => 'gpt-4o',
			clearInputUI: jest.fn(),
			addMessageToUI: jest.fn().mockReturnValue(document.createElement('div')),
			updateTokenSummary: jest.fn(),
			findMessageContentElement: () => document.createElement('div'),
			findMessageBodyElement: () => document.createElement('div'),
			onStreamingStateChange: jest.fn(),
		});

		await controller.sendMessage('what can you do?');
		expect(chatService.executeAgentLoop).toHaveBeenCalledTimes(1);
		expect(chatService.streamResponse).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 13: Run test to verify it fails**

```bash
npx jest src/__tests__/presentation/chat-controller-message.test.ts --no-coverage
```

Expected: FAIL — interface mismatch (configure doesn't accept new params yet)

---

### Task 5: ChatController — rewrite configure and sendMessage

**Files:**
- Modify: `src/presentation/components/chat/controllers/chat-controller.ts`

- [ ] **Step 14: Rewrite ChatController**

Replace the entire file `src/presentation/components/chat/controllers/chat-controller.ts` with the following. This merges ChatView's full message pipeline into ChatController while keeping the same external class interface (`configure`, `sendMessage`, `generateResponse`, `regenerateResponse`, `stopGeneration`).

```typescript
/**
 * Chat Controller
 * Owns the full message-sending pipeline previously in ChatView.
 */
import { Notice, TFolder } from 'obsidian';
import { BaseController } from './base-controller';
import { t } from '@/i18n';
import { MessageController } from './message-controller';
import { AgentController } from './agent-controller';
import { safeGetMessage } from '@/utils/type-guards';
import type { Message, LLMConfig, ModelInfo, FileReference } from '@/types';
import type { ChatService } from '@/application/services/chat.service';
import type { ConversationManager } from '@/presentation/components/chat/managers/conversation-manager';
import type { RagStatusPanel } from '@/presentation/components/chat/rag-status-panel';
import type { StreamChunk } from '@/types/common/llm';
import type { RAGSource } from '@/types';

// Legacy callbacks interface kept for backward compat (used by old configure callers)
export interface ChatUICallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onComplete: (message: Message) => void;
	onError: (error: Error) => void;
	onRagSources?: (sources: unknown[]) => void;
	onWebSearch?: (results: unknown[]) => void;
	checkAbort?: () => boolean;
}

export interface ChatControllerOptions {
	messagesContainer: HTMLElement;
	chatContainer: HTMLElement;
	messageController: MessageController;
	agentController: AgentController;
	chatService: ChatService;
	conversationManager: ConversationManager;
	ragStatusPanel: RagStatusPanel;
	getSelectedModel: () => string;
	clearInputUI: () => void;
	addMessageToUI: (msg: Message) => HTMLElement;
	updateTokenSummary: () => void;
	findMessageContentElement: (el: HTMLElement) => HTMLElement | null;
	findMessageBodyElement: (el: HTMLElement) => HTMLElement | null;
	onStreamingStateChange: (isStreaming: boolean) => void;
	// Legacy optional fields kept for callers that haven't migrated
	uiCallbacks?: ChatUICallbacks;
}

export class ChatController extends BaseController {
	private messagesContainer!: HTMLElement;
	private chatContainer!: HTMLElement;
	private messageController!: MessageController;
	private agentController!: AgentController;
	private chatService!: ChatService;
	private conversationManager!: ConversationManager;
	private ragStatusPanel!: RagStatusPanel;
	private getSelectedModel!: () => string;
	private clearInputUI!: () => void;
	private addMessageToUI!: (msg: Message) => HTMLElement;
	private updateTokenSummary!: () => void;
	private findMessageContentElement!: (el: HTMLElement) => HTMLElement | null;
	private findMessageBodyElement!: (el: HTMLElement) => HTMLElement | null;
	private onStreamingStateChange!: (isStreaming: boolean) => void;

	protected get plugin() { return this._plugin; }
	protected get app() { return this._app; }

	async initialize(): Promise<void> {}
	cleanup(): void { this.state.isStreaming = false; }

	configure(options: ChatControllerOptions): void {
		this.messagesContainer = options.messagesContainer;
		this.chatContainer = options.chatContainer;
		this.messageController = options.messageController;
		this.agentController = options.agentController;
		this.chatService = options.chatService;
		this.conversationManager = options.conversationManager;
		this.ragStatusPanel = options.ragStatusPanel;
		this.getSelectedModel = options.getSelectedModel;
		this.clearInputUI = options.clearInputUI;
		this.addMessageToUI = options.addMessageToUI;
		this.updateTokenSummary = options.updateTokenSummary;
		this.findMessageContentElement = options.findMessageContentElement;
		this.findMessageBodyElement = options.findMessageBodyElement;
		this.onStreamingStateChange = options.onStreamingStateChange;
	}

	async sendMessage(text: string): Promise<void> {
		if (this.state.isStreaming) {
			new Notice(t('chat.notices.waitForResponse'));
			return;
		}

		if (this.plugin.settings.llmConfigs.length === 0) {
			new Notice(t('chat.notices.configureProvider'));
			return;
		}

		const selectedModel = this.getSelectedModel();
		if (!selectedModel) {
			new Notice(t('chat.notices.selectModel'));
			return;
		}

		const config = this.chatService.findLLMConfig(selectedModel);
		if (!config) {
			new Notice(t('chat.notices.noValidProvider'));
			return;
		}

		const referenceInputs: FileReference[] = this.state.referencedFiles.map(item => ({
			type: item instanceof TFolder ? 'folder' : 'file',
			path: item.path,
			name: item.name,
		}));

		const { llmContent, references } = await this.chatService.buildReferenceContext(text, referenceInputs);

		this.state.currentAttachments = [];
		this.state.referencedFiles = [];
		this.clearInputUI();

		const userMessage: Message = {
			role: 'user',
			content: text,
			attachments: undefined,
			references: references.length > 0 ? references : undefined,
		};
		this.state.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		try {
			await this.handleAssistantResponse({ text, selectedModel, config, llmContent, targetMessage: userMessage });
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			new Notice(t('chat.notices.chatError', { message: errMsg }));
			const errorMessage: Message = {
				role: 'assistant',
				content: `❌ **Error:** ${errMsg}`,
				model: selectedModel,
			};
			(errorMessage as { provider?: string | null }).provider = config.provider ?? null;
			this.state.messages.push(errorMessage);
			this.addMessageToUI(errorMessage);
			await this.conversationManager.saveCurrentConversation();
		}
	}

	async regenerateMessage(message: Message, messageEl?: HTMLElement): Promise<void> {
		if (message.role !== 'assistant') return;
		if (this.state.isStreaming) {
			new Notice(t('chat.notices.waitForResponse'));
			return;
		}

		const assistantIndex = this.state.messages.indexOf(message);
		if (assistantIndex === -1) {
			new Notice(t('chat.notices.noMessageToRegenerate'));
			return;
		}
		if (assistantIndex !== this.state.messages.length - 1) {
			new Notice(t('chat.notices.regenerateOnlyLatest'));
			return;
		}

		const previousUser = this.findPreviousUserMessage(assistantIndex);
		if (!previousUser) {
			new Notice(t('chat.notices.regenerateNoUserMsg'));
			return;
		}

		const selectedModel = this.getSelectedModel();
		if (!selectedModel) {
			new Notice(t('chat.notices.selectModel'));
			return;
		}

		const config = this.chatService.findLLMConfig(selectedModel);
		if (!config) {
			new Notice(t('chat.notices.noValidProvider'));
			return;
		}

		const { llmContent } = await this.chatService.buildReferenceContext(
			previousUser.message.content,
			previousUser.message.references || []
		);

		if (messageEl?.isConnected) messageEl.remove();
		this.state.messages.splice(assistantIndex, 1);
		const originalAssistant = message;

		try {
			await this.handleAssistantResponse({
				text: previousUser.message.content,
				selectedModel,
				config,
				llmContent,
				targetMessage: previousUser.message,
			});
			new Notice(t('chat.notices.regenerated'));
		} catch (_error) {
			const errMsg = _error instanceof Error ? _error.message : String(_error);
			new Notice(t('chat.notices.regenerateFailed', { message: errMsg }));
			this.state.messages.push(originalAssistant);
			this.addMessageToUI(originalAssistant);
		}
	}

	stopGeneration(): void {
		this.state.stopStreamingRequested = true;
		new Notice(t('chat.notices.generationStopped'));
	}

	isCurrentlyGenerating(): boolean {
		return this.state.isStreaming;
	}

	// Legacy method kept for backward compat
	async generateResponse(): Promise<void> {}
	// Legacy method kept for backward compat
	async regenerateResponse(): Promise<void> {
		const messages = this.state.messages;
		if (messages.length < 2) return;
		const last = messages[messages.length - 1];
		if (last.role === 'assistant') {
			await this.regenerateMessage(last);
		}
	}

	private finalizeStreamingUI(): void {
		this.state.isStreaming = false;
		this.state.stopStreamingRequested = false;
		this.onStreamingStateChange(false);
	}

	private async handleAssistantResponse(options: {
		text: string;
		selectedModel: string;
		config: LLMConfig;
		llmContent: string;
		targetMessage: Message;
	}): Promise<void> {
		const { selectedModel, config, llmContent, targetMessage } = options;

		const activeSystemPrompts: Message[] = [];
		if (this.plugin.settings.activeSystemPromptId) {
			const activePrompt = this.plugin.settings.systemPrompts.find(
				p => p.id === this.plugin.settings.activeSystemPromptId
			);
			if (activePrompt && activePrompt.enabled) {
				activeSystemPrompts.push({ role: 'system', content: activePrompt.content });
			}
		}

		const contextWindow = this.getActiveAgent()?.contextWindow ?? 20;
		const llmMessages = this.chatService.prepareLlmMessages(
			this.state.messages, targetMessage, llmContent, contextWindow
		);

		const placeholderAssistant: Message = {
			role: 'assistant',
			content: '',
			model: selectedModel,
			provider: config.provider ?? undefined,
		};
		const assistantMessageEl = this.addMessageToUI(placeholderAssistant);
		const contentEl = this.findMessageContentElement(assistantMessageEl);

		this.state.isStreaming = true;
		this.state.stopStreamingRequested = false;
		this.onStreamingStateChange(true);

		let currentRagSources: RAGSource[] = [];

		try {
			if (this.state.mode === 'agent') {
				await this.runAgentLoop(
					llmMessages, selectedModel, contextWindow, activeSystemPrompts,
					placeholderAssistant, assistantMessageEl, contentEl
				);
				return;
			}

			await this.chatService.streamResponse(
				llmMessages,
				{
					model: selectedModel,
					mode: this.state.mode,
					temperature: this.state.temperature,
					maxTokens: this.state.maxTokens,
					topP: this.state.topP,
					frequencyPenalty: this.state.frequencyPenalty,
					presencePenalty: this.state.presencePenalty,
					enableRAG: this.state.enableRAG && this.plugin.settings.ragConfig.enabled,
					enableWebSearch: this.state.enableWebSearch,
					activeSystemPrompts,
					conversationId: this.state.currentConversationId ?? undefined,
				},
				{
					onChunk: (chunk: StreamChunk) => {
						if (contentEl && chunk.content) {
							contentEl.appendText(chunk.content);
							this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
						}
					},
					onRAGSources: (sources: RAGSource[]) => { currentRagSources = sources; },
					onWebSearch: () => {},
					onComplete: async (finalMessage: Message) => {
						const index = this.state.messages.indexOf(placeholderAssistant);
						if (index !== -1) {
							this.state.messages[index] = finalMessage;
						} else {
							this.state.messages.push(finalMessage);
						}
						this.updateTokenSummary();
						if (currentRagSources.length > 0 && assistantMessageEl) {
							const messageBody = this.findMessageBodyElement(assistantMessageEl);
							if (messageBody) this.ragStatusPanel.displaySources(messageBody, currentRagSources);
						}
						await this.conversationManager.saveCurrentConversation();
						this.finalizeStreamingUI();
					},
					onError: (error: Error) => {
						new Notice(t('chat.notices.chatError', { message: error.message }));
						this.finalizeStreamingUI();
					},
					checkAbort: () => this.state.stopStreamingRequested,
				}
			);
		} catch (error) {
			this.finalizeStreamingUI();
			throw error;
		}
	}

	private async runAgentLoop(
		llmMessages: Message[],
		selectedModel: string,
		contextWindow: number,
		activeSystemPrompts: Message[],
		placeholderAssistant: Message,
		assistantMessageEl: HTMLElement,
		contentEl: HTMLElement | null
	): Promise<void> {
		const isGenericAgent = !this.plugin.settings.activeAgentId;

		await this.chatService.executeAgentLoop(
			llmMessages,
			{
				model: selectedModel,
				mode: 'agent',
				temperature: this.state.temperature,
				maxTokens: this.state.maxTokens,
				topP: this.state.topP,
				frequencyPenalty: this.state.frequencyPenalty,
				presencePenalty: this.state.presencePenalty,
				enableRAG: this.state.enableRAG && this.plugin.settings.ragConfig.enabled,
				enableWebSearch: this.state.enableWebSearch,
				activeSystemPrompts,
				contextWindow,
				agentId: this.plugin.settings.activeAgentId,
				agents: this.plugin.settings.agents,
				isGenericAgent,
				allowOpenApiTools: (this.plugin as any).hasEnabledOpenApiTools?.() ?? false,
				conversationId: this.state.currentConversationId ?? undefined,
			},
			{
				onChunk: (chunk) => {
					if (contentEl && chunk.content) {
						contentEl.appendText(chunk.content);
						this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight, behavior: 'smooth' });
					}
				},
				onTokenUsage: (_step, cumulativeTokens, budget) => {
					// Token summary update handled externally via updateTokenSummary callback
					void cumulativeTokens; void budget;
				},
				onToolCall: (toolName, args) => {
					this.state.agentExecutionSteps.push({
						type: 'action',
						content: `${toolName}(${JSON.stringify(args)})`,
						timestamp: Date.now(),
						status: 'pending',
					});
				},
				onToolResult: (_toolName, success, output) => {
					const lastAction = [...this.state.agentExecutionSteps].reverse().find(s => s.type === 'action');
					if (lastAction) lastAction.status = success ? 'success' : 'error';
					this.state.agentExecutionSteps.push({
						type: 'observation',
						content: output,
						timestamp: Date.now(),
						status: success ? 'success' : 'error',
					});
				},
				onThought: (thought) => {
					this.state.agentExecutionSteps.push({
						type: 'thought',
						content: thought,
						timestamp: Date.now(),
					});
				},
				onComplete: async (finalMessage) => {
					const index = this.state.messages.indexOf(placeholderAssistant);
					if (index !== -1) {
						this.state.messages[index] = finalMessage;
					} else {
						this.state.messages.push(finalMessage);
					}
					this.updateTokenSummary();
					if (finalMessage.ragSources?.length && assistantMessageEl) {
						const messageBody = this.findMessageBodyElement(assistantMessageEl);
						if (messageBody) this.ragStatusPanel.displaySources(messageBody, finalMessage.ragSources);
					}
					await this.conversationManager.saveCurrentConversation();
					this.finalizeStreamingUI();
				},
				onError: (error) => {
					new Notice(t('chat.notices.chatError', { message: error.message }));
					this.finalizeStreamingUI();
				},
				checkAbort: () => this.state.stopStreamingRequested,
			}
		);
	}

	private findPreviousUserMessage(startIndex: number): { message: Message; index: number } | null {
		for (let i = startIndex - 1; i >= 0; i--) {
			const candidate = this.state.messages[i];
			if (candidate.role === 'user') return { message: candidate, index: i };
		}
		return null;
	}

	private getActiveAgent() {
		const activeId = this.plugin.settings.activeAgentId;
		if (!activeId) return null;
		return this.plugin.settings.agents.find((a: { id: string }) => a.id === activeId) || null;
	}

	private getModelConfig(agent: { modelStrategy: { strategy: string; modelId?: string } }, currentModel?: string): LLMConfig | null {
		const effectiveModelId = this.getAgentModelId(agent, currentModel);
		const model = this.getModelInfo(effectiveModelId);
		if (!model) return null;
		return this.plugin.settings.llmConfigs.find((c: LLMConfig) => c.provider === model.provider) || null;
	}

	private getAgentModelId(agent: { modelStrategy: { strategy: string; modelId?: string } }, currentModel?: string): string {
		switch (agent.modelStrategy.strategy) {
			case 'fixed': return agent.modelStrategy.modelId || this.plugin.settings.defaultModel || '';
			case 'chat-view': return currentModel || this.plugin.settings.defaultModel || '';
			default: return this.plugin.settings.defaultModel || '';
		}
	}

	private getModelInfo(modelId: string): ModelInfo | null {
		for (const config of this.plugin.settings.llmConfigs) {
			const model = config.cachedModels?.find((m: ModelInfo) => m.id === modelId);
			if (model) return model;
		}
		return null;
	}
}
```

- [ ] **Step 15: Run tests — expect pass**

```bash
npx jest src/__tests__/presentation/chat-controller-message.test.ts --no-coverage
```

Expected: PASS (all 4 tests)

- [ ] **Step 16: Commit**

```bash
git add src/presentation/components/chat/controllers/chat-controller.ts src/__tests__/presentation/chat-controller-message.test.ts
git commit -m "refactor: move full message pipeline from ChatView into ChatController"
```

---

### Task 6: Delegate ChatView.sendMessage to ChatController

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 17: Update ChatView.configure() to pass new deps to ChatController**

In `onOpen()`, find the `this.chatController.configure({...})` call (around line 304–308) and replace it:

```typescript
this.chatController.configure({
    messagesContainer: this.chatContainer,
    chatContainer: this.chatContainer,
    messageController: this.messageController,
    agentController: this.agentController,
    chatService: this.chatService,
    conversationManager: this.conversationManager,
    ragStatusPanel: this.ragStatusPanel,
    getSelectedModel: () => this.modelSelect?.value || '',
    clearInputUI: () => {
        this.chatInput.updateAttachmentPreview();
        this.chatInput.updateReferenceDisplay();
    },
    addMessageToUI: (msg: Message) => this.addMessageToUI(msg),
    updateTokenSummary: () => this.updateTokenSummary(),
    findMessageContentElement: (el: HTMLElement) => this.findMessageContentElement(el),
    findMessageBodyElement: (el: HTMLElement) => this.findMessageBodyElement(el),
    onStreamingStateChange: (isStreaming: boolean) => {
        if (isStreaming) {
            if (this.stopBtn) this.stopBtn.removeClass('ia-hidden');
            if (this.sendHint) this.sendHint.addClass('ia-hidden');
        } else {
            this.streamingMessageEl = null;
            if (this.stopBtn) this.stopBtn.addClass('ia-hidden');
            if (this.sendHint) this.sendHint.removeClass('ia-hidden');
        }
    },
});
```

Note: `this.conversationManager` is initialized after `configure()` in the current code. Move `this.conversationManager` initialization to BEFORE the `chatController.configure()` call, OR pass `conversationManager` lazily. The simplest fix: move ConversationManager initialization up in `onOpen()` to before the chatController.configure call.

- [ ] **Step 18: Replace ChatView.sendMessage with delegation**

Replace the entire `sendMessage` method (currently ~83 lines, starting at line 406) with:

```typescript
private async sendMessage(text: string) {
    await this.chatController.sendMessage(text);
}
```

- [ ] **Step 19: Replace ChatView.regenerateMessage with delegation**

Replace the entire `regenerateMessage` method (currently ~67 lines) with:

```typescript
private async regenerateMessage(message: Message, messageEl?: HTMLElement) {
    await this.chatController.regenerateMessage(message, messageEl);
}
```

- [ ] **Step 20: Delete methods moved to ChatController**

Delete these methods entirely from chat-view.ts (they are now inside ChatController):
- `finalizeStreamingUI()` — delete
- `handleAssistantResponse()` — delete
- `runAgentLoop()` — delete
- `findPreviousUserMessage()` — delete (now in ChatController)

Also delete the `AssistantResponseOptions` interface at the top of chat-view.ts (lines 38–44) since it's no longer used.

- [ ] **Step 21: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✅ Build completed successfully`

Fix any errors. Common issues:
- `findMessageContentElement` and `findMessageBodyElement` referenced in ChatController but defined in ChatView: keep them in ChatView, pass them as callbacks (already done in Step 17)
- `conversationManager` not yet initialized when `chatController.configure()` runs: move ConversationManager init up
- `this.streamingMessageEl` referenced in old code that's now deleted: remove remaining references

- [ ] **Step 22: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -15
```

Expected: All previously passing tests still pass.

- [ ] **Step 23: Run lint**

```bash
npm run lint 2>&1 | grep "error" | grep -v "^/" | head -10
```

Expected: No new errors.

- [ ] **Step 24: Commit**

```bash
git add src/presentation/views/chat-view.ts
git commit -m "refactor: delegate ChatView.sendMessage to ChatController"
```

---

### Task 7: Deploy and verify

- [ ] **Step 25: Build and deploy**

```bash
npm run build && node scripts/deploy.js --local
```

Expected: `✅ Plugin deployed successfully`

- [ ] **Step 26: Final line count**

```bash
wc -l src/presentation/views/chat-view.ts
```

Expected: ~1700 lines (down from 2244 — ~25% reduction).

The 3 extracted units (VaultExportService ~90 lines, RagStatusPanel ~215 lines, message pipeline ~280 lines) account for ~585 lines moved out. The remaining reduction goals (agent summary rendering ~125 lines, mode/config coordinator ~350 lines) are targeted in Phase 2.
