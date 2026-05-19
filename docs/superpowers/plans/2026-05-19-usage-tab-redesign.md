# Usage Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Usage tab layout with a polished dashboard style: 4 stat cards, underline tab filter, section-header labels, right-aligned numeric columns, and monospace model names — all using the plugin's existing design tokens and CSS components.

**Architecture:** Three files change. `src/presentation/utils/ui-helpers.ts` gets a corrected `createTable` implementation (the helper currently emits class names that don't match any CSS rule, causing unstyled tables in all tabs). `styles.css` gets 6 new CSS class groups for the stat cards, tab bar, and section headers. `src/presentation/components/tabs/usage-tab.ts` gets a rewritten HTML structure — same data-fetching logic, new DOM layout.

**Tech Stack:** Pure CSS (Obsidian design tokens), TypeScript, Obsidian DOM API (`createDiv`, `createEl`).

---

## File Structure

- **Modify:** `src/presentation/utils/ui-helpers.ts` — fix `createTable` to emit CSS class names that match `styles.css`
- **Modify:** `styles.css` — add new CSS class groups after the Settings Tab Shared Helpers section; add `ia-table-cell--right`
- **Modify:** `src/presentation/components/tabs/usage-tab.ts` — rewrite HTML structure, keep data logic unchanged

---

## Task 1: Fix createTable helper class names

The `createTable` function in `src/presentation/utils/ui-helpers.ts` emits:
- `ia-table__header` on the header `<tr>` — no CSS rule targets this
- `ia-table__cell` on header `<th>` elements — no CSS rule targets this
- no class on `<thead>` — CSS expects `.ia-table-head`
- no class on `<tbody>` — CSS expects `.ia-table-body`

Result: every table in every settings tab (provider, MCP, tools, agents, models, prompts, usage) has no header gradient, no row borders, no hover. This fix corrects the mismatch.

**Files:**
- Modify: `src/presentation/utils/ui-helpers.ts`

- [ ] **Step 1: Verify build passes before any changes**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 2: Replace the createTable function**

In `src/presentation/utils/ui-helpers.ts`, find and replace the `createTable` function. The current code uses constants `TABLE_CLASS`, `HEADER_ROW_CLASS`, `CELL_CLASS` at the top of the file. Replace the entire function (and those three constants) with:

```typescript
export function createTable(containerEl: HTMLElement, headers: string[]): HTMLTableElement {
	const wrapper = containerEl.createDiv('ia-table-container');
	wrapper.addClass('ia-scrollable');

	const table = wrapper.createEl('table', { cls: 'ia-table' });

	const thead = table.createEl('thead', { cls: 'ia-table-head' });
	const headerRow = thead.createEl('tr');
	headers.forEach(headerText => {
		headerRow.createEl('th', { text: headerText, cls: 'ia-table-header' });
	});

	table.createEl('tbody', { cls: 'ia-table-body' });
	return table;
}
```

Remove the three constant declarations at the top of the file (`TABLE_CLASS`, `HEADER_ROW_CLASS`, `CELL_CLASS`) since they are no longer used.

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 4: Commit**

```bash
git add src/presentation/utils/ui-helpers.ts
git commit -m "fix: createTable helper — emit CSS class names that match styles.css"
```

---

## Task 2: Add new CSS classes to styles.css

**Files:**
- Modify: `styles.css` — insert after the `/* ─── Settings Tab Shared Helpers ──── */` block

- [ ] **Step 1: Find the insertion point**

```bash
grep -n "ia-action-title-row" styles.css
```

Note the line number of the closing `}` for `.ia-action-title-row`. The new block goes immediately after it.

- [ ] **Step 2: Insert the new CSS block**

Insert the following immediately after the `.ia-action-title-row` closing brace:

```css

/* ── Usage tab ──────────────────────────────────────────────────────────── */

.ia-usage-stat-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 10px;
	margin-bottom: 16px;
}

.ia-usage-stat-card {
	padding: 12px 14px;
	border-radius: var(--ia-radius-m);
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
}

.ia-usage-stat-card__label {
	font-size: var(--ia-font-size-3xs);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-muted);
	margin-bottom: 4px;
	font-weight: 600;
}

.ia-usage-stat-card__value {
	font-size: 20px;
	font-weight: 700;
	color: var(--text-normal);
	line-height: 1;
	font-variant-numeric: tabular-nums;
}

.ia-usage-stat-card__sub {
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
	margin-top: 3px;
}

.ia-tab-bar {
	display: flex;
	border-bottom: 1px solid var(--background-modifier-border);
	margin-bottom: 16px;
}

.ia-tab {
	padding: 8px 14px;
	font-size: var(--ia-font-size-xs);
	font-weight: 500;
	color: var(--text-muted);
	cursor: pointer;
	border-bottom: 2px solid transparent;
	margin-bottom: -1px;
	transition: color var(--ia-transition-fast), border-color var(--ia-transition-fast);
}

.ia-tab:hover:not(.ia-tab--active) {
	color: var(--text-normal);
}

.ia-tab--active {
	color: var(--interactive-accent);
	border-bottom-color: var(--interactive-accent);
	font-weight: 600;
}

.ia-usage-section-hdr {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.ia-usage-section-hdr h4 {
	margin: 0;
	font-size: var(--ia-font-size-2xs);
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
}

.ia-usage-section-hdr span {
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
}

.ia-table-cell--right {
	text-align: right;
	font-variant-numeric: tabular-nums;
	color: var(--text-muted);
}
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: add usage tab CSS — stat grid, tab bar, section headers, table cell --right"
```

---

## Task 3: Rewrite usage-tab.ts HTML structure

**Files:**
- Modify: `src/presentation/components/tabs/usage-tab.ts`

The data-fetching and aggregation logic is unchanged. Only the DOM construction changes: filter buttons → tab bar, summary pills → stat grid, `h4` headings → `ia-usage-section-hdr`, cell classes updated, recent-activity columns simplified (drop Provider column, split tokens to In/Out/Total).

- [ ] **Step 1: Verify build passes before changes**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 2: Replace the entire file content**

Replace `src/presentation/components/tabs/usage-tab.ts` with:

```typescript
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
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 4: Deploy to local Obsidian sandbox**

```bash
node scripts/deploy.js --local 2>&1 | tail -5
```
Expected: `✅ 🎉 Plugin deployed successfully`

- [ ] **Step 5: Visual verification**

Open Obsidian → plugin settings → Usage tab. Verify:
- [ ] 4 stat cards in a row (Total tokens, API calls, Prompt tokens, Completion)
- [ ] Underline tab bar: clicking a tab adds active accent underline and refreshes stats
- [ ] "BY PROVIDER" / "BY MODEL" / "RECENT ACTIVITY" labels appear uppercase above each table
- [ ] Tables have blue-tinted header gradient and row hover highlighting
- [ ] Number columns are right-aligned
- [ ] Model names use monospace font
- [ ] Recent activity shows Time/Model/In/Out/Total (no Provider column)
- [ ] "Clear all usage data" button has red-tint styling

- [ ] **Step 6: Commit**

```bash
git add src/presentation/components/tabs/usage-tab.ts
git commit -m "feat: usage tab dashboard layout — stat cards, tab bar, section headers"
```
