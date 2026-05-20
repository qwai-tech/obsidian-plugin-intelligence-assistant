/**
 * Usage Settings Tab
 * Displays token usage statistics per provider and model
 */

import type { App } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { createTable } from '@/presentation/utils/ui-helpers';
import { t } from '@/i18n';
import type IntelligenceAssistantPlugin from '@plugin';

export async function displayUsageTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	_app: App,
	_refreshDisplay: () => void
): Promise<void> {
	containerEl.createEl('h3', { text: t('settings.usage.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.usage.desc')
	});
	desc.addClass('ia-section-description');

	const repo = plugin.tokenUsageRepo;
	if (!repo) {
		containerEl.createEl('p', { text: t('settings.usage.notAvailable') });
		return;
	}

	// ---- Tab bar ----
	const tabBar = containerEl.createDiv('ia-tab-bar');

	type Range = 'today' | 'week' | 'month' | 'all';
	let activeRange: Range = 'all';

	const rangeConfig: Array<{ range: Range; label: string; subLabel: string }> = [
		{ range: 'today', label: t('settings.usage.ranges.today'), subLabel: t('settings.usage.ranges.today') },
		{ range: 'week', label: t('settings.usage.ranges.week'), subLabel: t('settings.usage.ranges.week') },
		{ range: 'month', label: t('settings.usage.ranges.month'), subLabel: t('settings.usage.ranges.month') },
		{ range: 'all', label: t('settings.usage.ranges.all'), subLabel: t('settings.usage.ranges.all') },
	];

	const statsContainer = containerEl.createDiv('ia-usage-stats');

	const renderStats = async () => {
		statsContainer.empty();

		const now = Date.now();
		let startTs = 0;
		if (activeRange === 'today') {
			const d = new Date(); d.setHours(0, 0, 0, 0);
			startTs = d.getTime();
		} else if (activeRange === 'week') {
			const d = new Date(); d.setHours(0, 0, 0, 0);
			d.setDate(d.getDate() - d.getDay());
			startTs = d.getTime();
		} else if (activeRange === 'month') {
			const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
			startTs = d.getTime();
		}

		const records = startTs > 0
			? await repo.getRecordsByDateRange(startTs, now)
			: await repo.getAllRecords();

		// Compute summaries from filtered records
		const grandTotal = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
		const byProvider = new Map<string, { promptTokens: number; completionTokens: number; totalTokens: number; callCount: number }>();
		const byModel = new Map<string, { promptTokens: number; completionTokens: number; totalTokens: number; callCount: number }>();

		for (const r of records) {
			grandTotal.promptTokens += r.promptTokens;
			grandTotal.completionTokens += r.completionTokens;
			grandTotal.totalTokens += r.totalTokens;
			grandTotal.callCount += 1;

			const ps = byProvider.get(r.provider) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
			ps.promptTokens += r.promptTokens; ps.completionTokens += r.completionTokens;
			ps.totalTokens += r.totalTokens; ps.callCount += 1;
			byProvider.set(r.provider, ps);

			const ms = byModel.get(r.model) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
			ms.promptTokens += r.promptTokens; ms.completionTokens += r.completionTokens;
			ms.totalTokens += r.totalTokens; ms.callCount += 1;
			byModel.set(r.model, ms);
		}

		// ---- Stat grid ----
		const subLabel = rangeConfig.find(c => c.range === activeRange)?.subLabel ?? t('settings.usage.ranges.all');
		const totalK = (grandTotal.totalTokens / 1000).toFixed(1);

		const statGrid = statsContainer.createDiv('ia-usage-stat-grid');

		const addStatCard = (label: string, value: string, sub: string) => {
			const card = statGrid.createDiv('ia-usage-stat-card');
			card.createDiv({ cls: 'ia-usage-stat-card__label', text: label });
			card.createDiv({ cls: 'ia-usage-stat-card__value', text: value });
			card.createDiv({ cls: 'ia-usage-stat-card__sub', text: sub });
		};

		addStatCard(t('settings.usage.stats.totalTokens'), `${totalK}K`, subLabel);
		addStatCard(t('settings.usage.stats.apiCalls'), String(grandTotal.callCount), subLabel);
		addStatCard(t('settings.usage.stats.promptTokens'), grandTotal.promptTokens.toLocaleString(), t('settings.usage.stats.tokensIn'));
		addStatCard(t('settings.usage.stats.completion'), grandTotal.completionTokens.toLocaleString(), t('settings.usage.stats.tokensOut'));

		// ---- By Provider ----
		statsContainer.createDiv('ia-usage-section-hdr').createEl('h4', { text: t('settings.usage.byProvider') });

		if (byProvider.size === 0) {
			statsContainer.createEl('p', { text: t('settings.usage.noData') }).addClass('ia-muted');
		} else {
			const tbl = createTable(statsContainer, [
				t('settings.usage.tableHeaders.provider'),
				t('settings.usage.tableHeaders.prompt'),
				t('settings.usage.tableHeaders.completion'),
				t('settings.usage.tableHeaders.total'),
				t('settings.usage.tableHeaders.calls')
			]);
			const tbody = tbl.tBodies[0];
			for (const [name, s] of byProvider) {
				const row = tbody.insertRow();
				const nameCell = row.insertCell();
				nameCell.addClass('ia-table-cell');
				nameCell.setText(name);
				[s.promptTokens.toLocaleString(), s.completionTokens.toLocaleString(), s.totalTokens.toLocaleString(), String(s.callCount)]
					.forEach(text => {
						const c = row.insertCell();
						c.addClass('ia-table-cell');
						c.addClass('ia-table-cell--right');
						c.setText(text);
					});
			}
		}

		// ---- By Model ----
		statsContainer.createDiv('ia-usage-section-hdr').createEl('h4', { text: t('settings.usage.byModel') });

		if (byModel.size === 0) {
			statsContainer.createEl('p', { text: t('settings.usage.noData') }).addClass('ia-muted');
		} else {
			const tbl = createTable(statsContainer, [
				t('settings.usage.tableHeaders.model'),
				t('settings.usage.tableHeaders.prompt'),
				t('settings.usage.tableHeaders.completion'),
				t('settings.usage.tableHeaders.total'),
				t('settings.usage.tableHeaders.calls')
			]);
			const tbody = tbl.tBodies[0];
			for (const [name, s] of byModel) {
				const row = tbody.insertRow();
				const nameCell = row.insertCell();
				nameCell.addClass('ia-table-cell');
				nameCell.addClass('ia-code');
				nameCell.setText(name);
				[s.promptTokens.toLocaleString(), s.completionTokens.toLocaleString(), s.totalTokens.toLocaleString(), String(s.callCount)]
					.forEach(text => {
						const c = row.insertCell();
						c.addClass('ia-table-cell');
						c.addClass('ia-table-cell--right');
						c.setText(text);
					});
			}
		}

		// ---- Recent Activity (last 10 from filtered range) ----
		const recentHdr = statsContainer.createDiv('ia-usage-section-hdr');
		recentHdr.createEl('h4', { text: t('settings.usage.recentActivity') });
		recentHdr.createSpan({ text: t('settings.usage.last10') });

		const recent = records.slice(-10).reverse();
		if (recent.length === 0) {
			statsContainer.createEl('p', { text: t('settings.usage.noRecent') }).addClass('ia-muted');
		} else {
			const tbl = createTable(statsContainer, [
				t('settings.usage.tableHeaders.time'),
				t('settings.usage.tableHeaders.model'),
				t('settings.usage.tableHeaders.in'),
				t('settings.usage.tableHeaders.out'),
				t('settings.usage.tableHeaders.total')
			]);
			const tbody = tbl.tBodies[0];
			for (const r of recent) {
				const row = tbody.insertRow();

				const timeCell = row.insertCell();
				timeCell.addClass('ia-table-cell');
				const d = new Date(r.timestamp);
				const timeStr = activeRange === 'today'
					? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
					: d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
				timeCell.setText(timeStr);

				const modelCell = row.insertCell();
				modelCell.addClass('ia-table-cell');
				modelCell.addClass('ia-code');
				modelCell.setText(r.model);

				[r.promptTokens.toLocaleString(), r.completionTokens.toLocaleString(), r.totalTokens.toLocaleString()]
					.forEach(text => {
						const c = row.insertCell();
						c.addClass('ia-table-cell');
						c.addClass('ia-table-cell--right');
						c.setText(text);
					});
			}
		}

		// ---- Clear Button ----
		const actions = statsContainer.createDiv('ia-section-actions');
		const clearBtn = actions.createEl('button', { text: t('settings.usage.clearBtn') });
		clearBtn.addClass('ia-button');
		clearBtn.addClass('ia-button--danger');
		clearBtn.addEventListener('click', () => {
			void showConfirm(_app, t('settings.usage.confirm.clear')).then(confirmed => {
				if (confirmed) {
					void repo.clearAll().then(() => { _refreshDisplay(); });
				}
			});
		});
	};

	// Render tab elements
	const tabEls: Map<Range, HTMLElement> = new Map();
	for (const { range, label } of rangeConfig) {
		const tab = tabBar.createDiv({ cls: 'ia-tab', text: label });
		if (range === activeRange) tab.addClass('ia-tab--active');
		tabEls.set(range, tab);
		tab.addEventListener('click', () => {
			activeRange = range;
			tabEls.forEach((el, r) => {
				if (r === activeRange) el.addClass('ia-tab--active');
				else el.removeClass('ia-tab--active');
			});
			void renderStats();
		});
	}

	await renderStats();
}
