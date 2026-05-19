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

	// ---- Time-range selector ----
	const filterBar = containerEl.createDiv('ia-section-actions');
	filterBar.createSpan({ text: 'Show: ', cls: 'ia-muted' });

	type Range = 'today' | 'week' | 'month' | 'all';
	let activeRange: Range = 'all';

	const rangeButtons: Array<{ range: Range; label: string }> = [
		{ range: 'today', label: 'Today' },
		{ range: 'week', label: 'This week' },
		{ range: 'month', label: 'This month' },
		{ range: 'all', label: 'All time' },
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

		// ---- Summary pills ----
		const controls = statsContainer.createDiv('ia-section-actions');
		const summary = controls.createDiv('ia-section-summary');
		const totalK = (grandTotal.totalTokens / 1000).toFixed(1);
		summary.createSpan({ cls: 'ia-section-summary-pill', text: `${totalK}K tokens` });
		summary.createSpan({ cls: 'ia-section-summary-pill', text: `${grandTotal.callCount} calls` });

		// ---- By Provider ----
		statsContainer.createEl('h4', { text: 'By provider' });
		if (byProvider.size === 0) {
			statsContainer.createEl('p', { text: 'No usage data yet.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Provider', 'Prompt', 'Completion', 'Total', 'Calls']);
			const tbody = t.tBodies[0];
			for (const [name, s] of byProvider) {
				const row = tbody.insertRow();
				row.addClass('ia-table-row');
				[name, s.promptTokens.toLocaleString(), s.completionTokens.toLocaleString(), s.totalTokens.toLocaleString(), `${s.callCount} calls`]
					.forEach(text => { const c = row.insertCell(); c.addClass('ia-table-cell'); c.setText(text); });
			}
		}

		// ---- By Model ----
		statsContainer.createEl('h4', { text: 'By model' });
		if (byModel.size === 0) {
			statsContainer.createEl('p', { text: 'No usage data yet.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Model', 'Prompt', 'Completion', 'Total', 'Calls']);
			const tbody = t.tBodies[0];
			for (const [name, s] of byModel) {
				const row = tbody.insertRow();
				row.addClass('ia-table-row');
				[name, s.promptTokens.toLocaleString(), s.completionTokens.toLocaleString(), s.totalTokens.toLocaleString(), `${s.callCount} calls`]
					.forEach(text => { const c = row.insertCell(); c.addClass('ia-table-cell'); c.setText(text); });
			}
		}

		// ---- Recent Activity (last 10 from filtered range) ----
		statsContainer.createEl('h4', { text: 'Recent activity' });
		const recent = records.slice(-10).reverse();
		if (recent.length === 0) {
			statsContainer.createEl('p', { text: 'No recent activity.' }).addClass('ia-muted');
		} else {
			const t = createTable(statsContainer, ['Time', 'Model', 'Provider', 'Tokens']);
			const tbody = t.tBodies[0];
			for (const r of recent) {
				const row = tbody.insertRow();
				row.addClass('ia-table-row');
				[
					new Date(r.timestamp).toLocaleString(),
					r.model,
					r.provider,
					`${r.promptTokens.toLocaleString()} + ${r.completionTokens.toLocaleString()} = ${r.totalTokens.toLocaleString()}`
				].forEach(text => { const c = row.insertCell(); c.addClass('ia-table-cell'); c.setText(text); });
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

	// Render filter buttons
	const btnEls: Map<Range, HTMLElement> = new Map();
	for (const { range, label } of rangeButtons) {
		const btn = filterBar.createEl('button', { text: label, cls: 'ia-button' });
		if (range === activeRange) btn.addClass('ia-button--active');
		btnEls.set(range, btn);
		btn.addEventListener('click', () => {
			activeRange = range;
			btnEls.forEach((el, r) => {
				if (r === activeRange) el.addClass('ia-button--active');
				else el.removeClass('ia-button--active');
			});
			void renderStats();
		});
	}

	await renderStats();
}
