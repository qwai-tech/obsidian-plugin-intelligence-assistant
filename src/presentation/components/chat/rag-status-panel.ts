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
