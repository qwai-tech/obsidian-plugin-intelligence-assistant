import { notify } from '@/core/notifications';
import { Setting } from 'obsidian';
import type { PluginHost } from '@/ui/plugin-host';
import { showConfirm } from '@/ui/modals/confirm-modal';
import { t } from '@/i18n';
import { TestIds } from '@/ui/utils/test-ids';
import { setDestructiveButton } from '@/ui/utils/ui-helpers';

const indexFeedback = new WeakMap<PluginHost, string>();

export function renderIndexManagement(containerEl: HTMLElement, plugin: PluginHost): void {
	const section = containerEl.createDiv('ia-settings-section');
	new Setting(section).setName(t('settings.rag.indexMgmt.title')).setHeading();

	const indexDesc = section.createEl('p', {
		text: t('settings.rag.indexMgmt.desc')
	});
	indexDesc.addClass('setting-item-description');

	// Create a stats container that will be updated
	const statsContainer = section.createDiv('ia-rag-stats');
	statsContainer.setAttribute('data-testid', TestIds.settings.ragStats);

	// Function to update stats display
	const updateStats = async () => {
		statsContainer.empty();

		const ragManager = plugin.services.rag;

		try {
			const stats = await ragManager.getDetailedStats();

			statsContainer.createDiv({
				text: t('settings.rag.indexMgmt.statsTitle'),
				cls: 'ia-rag-stats-title'
			});

			const statsGrid = statsContainer.createDiv('ia-rag-stats-grid');

			const addStat = (label: string, value: string | number | undefined) => {
				const statItem = statsGrid.createDiv('ia-stat-item');
				statItem.createSpan({
					text: label,
					cls: 'ia-stat-label'
				});
				statItem.createSpan({
					text: (value ?? 0).toString(),
					cls: 'ia-stat-value'
				});
			};

			// Safely access stats with defaults
			const chunkCount = stats?.chunkCount ?? 0;
			const fileCount = stats?.fileCount ?? 0;
			const totalSize = stats?.totalSize ?? 0;

			addStat(t('settings.rag.indexMgmt.stats.totalChunks'), chunkCount);
			addStat(t('settings.rag.indexMgmt.stats.uniqueFiles'), fileCount);
			addStat(t('settings.rag.indexMgmt.stats.totalChars'), totalSize.toLocaleString());

			// Calculate average chunk size
			const avgChunkSize = chunkCount > 0 ? Math.round(totalSize / chunkCount) : 0;
			addStat(t('settings.rag.indexMgmt.stats.avgChunkSize'), avgChunkSize);

			// Show empty index message if no data
			if (chunkCount === 0) {
				statsContainer.createDiv({
					text: t('settings.rag.indexMgmt.empty'),
					cls: 'ia-rag-empty-notice'
				});
			}
		} catch (error) {
			statsContainer.createDiv({
				text: t('settings.rag.indexMgmt.error'),
				cls: 'ia-rag-stats-error'
			});
			console.error('Failed to load RAG stats:', error);
		}
	};

	// Initial stats load
	void updateStats();
	const status = section.createEl('p', { text: indexFeedback.get(plugin) ?? '', cls: 'ia-operation-feedback' });
	status.setAttribute('role', 'status');
	const showStatus = (message: string) => { indexFeedback.set(plugin, message); status.setText(message); };

	// Rebuild Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.rebuild.name'))
		.setDesc(t('settings.rag.indexMgmt.rebuild.desc'))
		.addButton(button => {
			button.buttonEl.setAttribute('data-testid', TestIds.settings.ragRebuildBtn);
			setDestructiveButton(button.setButtonText(t('settings.rag.indexMgmt.rebuild.btn')))
			.onClick(async () => {
				if (!plugin.settings.ragConfig.enabled) { showStatus(t('ux.ragEnableFirst')); return; }
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.rebuild.rebuilding'));

				try {
					const ragManager = plugin.services.rag;
					ragManager.updateConfig(plugin.settings.ragConfig, plugin.settings.llmConfigs);
					await ragManager.clearIndex(false);
					await ragManager.indexVault();
					await updateStats();
					showStatus(t('settings.rag.indexMgmt.notices.rebuilt'));
				} catch (error) {
					console.error('Failed to rebuild index:', error);
					showStatus(t('settings.rag.indexMgmt.notices.rebuildFailed'));
					notify(t('settings.rag.indexMgmt.notices.rebuildFailed'), 5000, 'rag-index');
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.rebuild.btn'));
				}
			});
		});

	// Refresh Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.refresh.name'))
		.setDesc(t('settings.rag.indexMgmt.refresh.desc'))
		.addButton(button => button
			.setButtonText(t('settings.rag.indexMgmt.refresh.btn'))
			.onClick(async () => {
				if (!plugin.settings.ragConfig.enabled) { showStatus(t('ux.ragEnableFirst')); return; }
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.refresh.refreshing'));

				try {
					const ragManager = plugin.services.rag;
					await ragManager.refreshIndex();
					await updateStats();
					showStatus(t('settings.rag.indexMgmt.notices.refreshed'));
				} catch (error) {
					console.error('Failed to refresh index:', error);
					showStatus(t('settings.rag.indexMgmt.notices.refreshFailed'));
					notify(t('settings.rag.indexMgmt.notices.refreshFailed'), 5000, 'rag-index');
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.refresh.btn'));
				}
			}));

	// Clear Index button
	new Setting(section)
		.setName(t('settings.rag.indexMgmt.clear.name'))
		.setDesc(t('settings.rag.indexMgmt.clear.desc'))
		.addButton(button => setDestructiveButton(button
			.setButtonText(t('settings.rag.indexMgmt.clear.btn')))
			.onClick(async () => {
				if (!await showConfirm(plugin.app, t('settings.rag.confirm.clear'), { title: t('settings.rag.indexMgmt.clear.name'), confirmText: t('settings.rag.indexMgmt.clear.name') })) return;
				button.setDisabled(true);
				button.setButtonText(t('settings.rag.indexMgmt.clear.clearing'));

				try {
					const ragManager = plugin.services.rag;
					await ragManager.clearIndex();
					await updateStats();
					showStatus(t('settings.rag.indexMgmt.notices.cleared'));
				} catch (error) {
					console.error('Failed to clear index:', error);
					showStatus(t('settings.rag.indexMgmt.notices.clearFailed'));
					notify(t('settings.rag.indexMgmt.notices.clearFailed'), 5000, 'rag-index');
				} finally {
					button.setDisabled(false);
					button.setButtonText(t('settings.rag.indexMgmt.clear.btn'));
				}
			}));
}
