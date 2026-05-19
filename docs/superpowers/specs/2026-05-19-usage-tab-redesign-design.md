# Usage Tab Redesign — Design Spec

## Goal

Replace the current flat Usage tab layout (spread-out filter buttons, plain summary pills, basic tables) with a polished dashboard-style layout that matches the plugin's existing design system.

## Architecture

Changes span two files:

- **`src/presentation/components/tabs/usage-tab.ts`** — update HTML structure to emit new class names and layout (stat grid, tab bar, section headers). No logic changes.
- **`styles.css`** — add new CSS classes for stat cards and tab bar. All table, button, and section styles reuse existing classes.

---

## Design

### Layout overview

```
┌─────────────────────────────────────────────────┐
│  [Total tokens]  [API calls]  [Prompt]  [Compl.] │  ← ia-usage-stat-grid
├─────────────────────────────────────────────────┤
│  Today  This week  This month  All time          │  ← ia-tab-bar
├─────────────────────────────────────────────────┤
│  BY PROVIDER                                     │  ← ia-usage-section-hdr
│  ┌──────────────── ia-table-container ─────────┐ │
│  │ PROVIDER  PROMPT  COMPLETION  TOTAL  CALLS  │ │
│  │ deepseek  13      501         514    2       │ │
│  └─────────────────────────────────────────────┘ │
│  BY MODEL                                        │
│  ┌─────────────────────────────────────────────┐ │
│  │ MODEL                  PROMPT  …  TOTAL  …  │ │
│  └─────────────────────────────────────────────┘ │
│  RECENT ACTIVITY                        last 10  │
│  ┌─────────────────────────────────────────────┐ │
│  │ TIME      MODEL            IN   OUT  TOTAL  │ │
│  └─────────────────────────────────────────────┘ │
│  [Clear all usage data]                          │  ← ia-button--danger
└─────────────────────────────────────────────────┘
```

---

### Stat cards (`ia-usage-stat-grid` / `ia-usage-stat-card`)

Four cards in a single row, each showing one metric for the active time range:

| Card | Value | Sub-label |
|---|---|---|
| Total tokens | formatted (e.g. `0.5K`) | "all time" / "today" / etc. |
| API calls | integer | same range label |
| Prompt tokens | integer | "tokens in" |
| Completion | integer | "tokens out" |

**CSS (new):**
```css
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
```

**HTML emitted by `usage-tab.ts`:**
```html
<div class="ia-usage-stat-grid">
  <div class="ia-usage-stat-card">
    <div class="ia-usage-stat-card__label">Total tokens</div>
    <div class="ia-usage-stat-card__value">0.5K</div>
    <div class="ia-usage-stat-card__sub">all time</div>
  </div>
  <!-- × 3 more cards -->
</div>
```

The "Total tokens" value uses the same `(total / 1000).toFixed(1) + 'K'` formatting already in the file. The sub-label reflects the active range: `'today'` / `'this week'` / `'this month'` / `'all time'`.

---

### Tab bar (`ia-tab-bar` / `ia-tab` / `ia-tab--active`)

Replaces the current `ia-section-actions` filter buttons. Underline-style tabs, no background fill on active.

**CSS (new):**
```css
.ia-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 16px;
    gap: 0;
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
```

**HTML emitted by `usage-tab.ts`:**
```html
<div class="ia-tab-bar">
  <div class="ia-tab">Today</div>
  <div class="ia-tab">This week</div>
  <div class="ia-tab">This month</div>
  <div class="ia-tab ia-tab--active">All time</div>
</div>
```

Active tab toggling: remove `ia-tab--active` from all tabs, add it to the clicked tab. Same click handler logic as the existing range buttons.

---

### Section headers (`ia-usage-section-hdr`)

Replaces `statsContainer.createEl('h4', ...)`. Small uppercase label, right-aligned sub-text for "last 10" on the recent activity section.

**CSS (new):**
```css
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
```

**HTML:**
```html
<div class="ia-usage-section-hdr">
  <h4>By provider</h4>
</div>
<!-- or for recent activity: -->
<div class="ia-usage-section-hdr">
  <h4>Recent activity</h4>
  <span>last 10</span>
</div>
```

---

### Tables (existing classes, unchanged)

The existing `createTable()` helper already wraps in `ia-table-container` and uses `ia-table` / `ia-table-head` / `ia-table-header` / `ia-table-body` / `ia-table-cell`. No CSS changes needed.

Two additions to `usage-tab.ts`:
1. **Right-align number columns**: add `ia-table-cell--right` class to numeric cells (Prompt, Completion, Total, Calls, In, Out). Requires adding `.ia-table-cell--right { text-align: right; font-variant-numeric: tabular-nums; }` to `styles.css` (or reuse `ia-table-cell--center` renamed — but adding a new `--right` modifier is cleaner).
2. **Monospace model names**: add `ia-code` class (already exists: `font-family: monospace; font-size: 11px; color: var(--text-faint)`) to model name cells.
3. **Recent activity columns**: change from `Time | Model | Provider | Tokens (in + out = total)` to `Time | Model | In | Out | Total`. The `Provider` column is dropped (redundant when provider-level aggregation is just above). Tokens split into three numeric columns.

---

### Clear button (existing class)

Replace `ia-button ia-button--danger` — already styled with the red tint. No CSS changes.

The button is placed inside `ia-section-actions` at the bottom of `statsContainer`.

---

## CSS Changes Summary

| Class | Status | Where |
|---|---|---|
| `ia-usage-stat-grid` | **New** | `styles.css` |
| `ia-usage-stat-card` + `__label` + `__value` + `__sub` | **New** | `styles.css` |
| `ia-tab-bar` | **New** | `styles.css` |
| `ia-tab` + `ia-tab--active` | **New** | `styles.css` |
| `ia-usage-section-hdr` (+ `h4` + `span`) | **New** | `styles.css` |
| `ia-table-cell--right` | **New** | `styles.css` |
| `ia-table-container`, `ia-table-*` | Reused | — |
| `ia-button--danger` | Reused | — |
| `ia-section-actions` | Reused | — |
| `ia-code` | Reused | — |

---

## Out of Scope

- No changes to token tracking logic or data model
- No changes to any other settings tab
- No new persistence or state
