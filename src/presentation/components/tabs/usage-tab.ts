/**
 * Usage Settings Tab
 * Displays token usage statistics per provider and model
 */

import type { App } from 'obsidian';
import { showConfirm } from '@/presentation/components/modals/confirm-modal';
import { createTable } from '@/presentation/utils/ui-helpers';
import type IntelligenceAssistantPlugin from '@plugin';

export async function displayUsageTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin,
	_app: App,
	_refreshDisplay: () => void
): Promise<void> {
	containerEl.createEl('h3', { text: 'Token usage' });

	const desc = containerEl.createEl('p', {
		text: 'Track token consumption across providers and models. Data is accumulated across all conversations.'
	});
	desc.addClass('ia-section-description');

	const repo = plugin.tokenUsageRepo ?? undefined;
	if (!repo) {
		containerEl.createEl('p', { text: 'Token usage tracking is not available.' });
		return;
	}

	// ---- Tab bar ----
	const tabBar = containerEl.createDiv('ia-tab-bar');

	type Range = 'today' | 'week' | 'month' | 'all';
	let activeRange: Range = 'all';

	const rangeConfig: Array<{ range: Range; label: string; subLabel: string }> = [
		{ range: 'today', label: 'Today', subLabel: 'today' },
		{ range: 'week', label: 'This week', subLabel: 'this week' },
		{ range: 'month', label: 'This month', subLabel: 'this month' },
		{ range: 'all', label: 'All time', subLabel: 'all time' },
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
		const subLabel = rangeConfig.find(c => c.range === activeRange)?.subLabel ?? 'all time';
		const totalK = (grandTotal.totalTokens / 1000).toFixed(1);

		const statGrid = statsContainer.createDiv('ia-usage-stat-grid');

		const addStatCard = (label: string, value: string, sub: string) => {
			const card = statGrid.createDiv('ia-usage-stat-card');
			card.createDiv({ cls: 'ia-usage-stat-card__label', text: label });
			card.createDiv({ cls: 'ia-usage-stat-card__value', text: value });
			card.createDiv({ cls: 'ia-usage-stat-card__sub', text: sub });
		};

		addStatCard('Total tokens', `${totalK}K`, subLabel);
		addStatCard('API calls', String(grandTotal.callCount), subLabel);
		addStatCard('Prompt tokens', grandTotal.promptTokens.toLocaleString(), 'tokens in');
		addStatCard('Completion', grandTotal.completionTokens.toLocaleString(), 'tokens out');

		// ---- By Provider ----
		const providerHdr = statsContainer.createDiv('ia-usage-section-hdr');
		providerHdr.createEl('h4', { text: 'By provider' });

		if (byProvider.size === 0) {
			statsContainer.createEl('p', { text: 'No usage data yet.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Provider', 'Prompt', 'Completion', 'Total', 'Calls']);
			const tbody = t.tBodies[0];
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
		const modelHdr = statsContainer.createDiv('ia-usage-section-hdr');
		modelHdr.createEl('h4', { text: 'By model' });

		if (byModel.size === 0) {
			statsContainer.createEl('p', { text: 'No usage data yet.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Model', 'Prompt', 'Completion', 'Total', 'Calls']);
			const tbody = t.tBodies[0];
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
		recentHdr.createEl('h4', { text: 'Recent activity' });
		recentHdr.createSpan({ text: 'last 10' });

		const recent = records.slice(-10).reverse();
		if (recent.length === 0) {
			statsContainer.createEl('p', { text: 'No recent activity.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Time', 'Model', 'In', 'Out', 'Total']);
			const tbody = t.tBodies[0];
			for (const r of recent) {
				const row = tbody.insertRow();

				const timeCell = row.insertCell();
				timeCell.addClass('ia-table-cell');
				timeCell.setText(new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

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
		const clearBtn = actions.createEl('button', { text: 'Clear all usage data' });
		clearBtn.addClass('ia-button');
		clearBtn.addClass('ia-button--danger');
		clearBtn.addEventListener('click', () => {
			void showConfirm(_app, 'Clear all token usage records? This cannot be undone.').then(confirmed => {
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
