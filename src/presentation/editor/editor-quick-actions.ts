// src/presentation/editor/editor-quick-actions.ts
import { App, Menu, Editor, MarkdownView, Notice } from 'obsidian';
import { t } from '@/i18n';
import { ExplainTextModal } from '@/presentation/components/modals/explain-text-modal';
import { ModelManager } from '@/infrastructure/llm/model-manager';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import type { LLMConfig } from '@/types';
import type { QuickActionConfig } from '@/types/settings';

export interface EditorQuickActionsConfig {
	quickActions: QuickActionConfig[];
	quickActionPrefix: string;
	llmConfigs: LLMConfig[];
	defaultModel: string;
}

export class EditorQuickActions {
	constructor(
		private readonly app: App,
		private readonly getConfig: () => EditorQuickActionsConfig
	) {}

	register(plugin: { registerEvent: (e: unknown) => void; app: { workspace: App['workspace'] } }): void {
		plugin.registerEvent(
			plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
				this.addMenuItems(menu, editor, view);
			})
		);
	}

	private addMenuItems(menu: Menu, editor: Editor, _view: MarkdownView): void {
		const selectedText = editor.getSelection();
		if (!selectedText || selectedText.trim().length === 0) return;

		const { quickActions, quickActionPrefix } = this.getConfig();
		const enabledActions = quickActions.filter(action => action.enabled);
		if (enabledActions.length === 0) return;

		const iconMap: Record<string, string> = {
			'make-longer': 'text-cursor-input',
			'summarize': 'list-collapse',
			'improve-writing': 'pencil',
			'fix-grammar': 'spellcheck',
			'explain': 'lightbulb',
		};

		menu.addSeparator();
		const prefix = quickActionPrefix || '⚡';

		for (const action of enabledActions) {
			menu.addItem((item) => {
				item
					.setTitle(prefix ? `${prefix} ${action.name}` : action.name)
					.setIcon(iconMap[action.id] || 'bot')
					.onClick(async () => {
						await this.executeAction(editor, selectedText, action.prompt, action.actionType, action.model);
					});
			});
		}
	}

	private async executeAction(
		editor: Editor,
		selectedText: string,
		promptPrefix: string,
		actionType: 'replace' | 'explain',
		customModel?: string
	): Promise<void> {
		const { llmConfigs, defaultModel } = this.getConfig();

		if (llmConfigs.length === 0) {
			new Notice(t('notices.noProvider'));
			return;
		}

		const modelId = customModel || defaultModel;
		if (!modelId) {
			new Notice(t('notices.noModel'));
			return;
		}

		const config = ModelManager.findConfigForModelByProvider(modelId, llmConfigs);
		if (!config) {
			new Notice(t('notices.noValidProvider', { modelId }));
			return;
		}

		const loadingNotice = new Notice(t('notices.processing'), 0);

		try {
			const provider = ProviderFactory.createProvider(config);
			const fullPrompt = promptPrefix + selectedText;

			let modal: ExplainTextModal | null = null;
			if (actionType === 'explain') {
				modal = new ExplainTextModal(this.app, 'Explanation');
				modal.open();
			}

			let result = '';
			await provider.streamChat(
				{ messages: [{ role: 'user', content: fullPrompt }], model: modelId, temperature: 0.7 },
				(chunk) => {
					if (!chunk.done && chunk.content) {
						result += chunk.content;
						if (modal) modal.updateContent(result);
					}
				}
			);

			loadingNotice.hide();

			if (actionType === 'replace') {
				editor.replaceSelection(result.trim());
				new Notice(t('notices.textUpdated'));
			} else if (actionType === 'explain' && !result) {
				modal?.showError('No explanation generated');
			}
		} catch (error) {
			loadingNotice.hide();
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(t('notices.error', { message: errorMsg }));
			console.error('[Editor AI Action] Error:', error);
		}
	}
}
