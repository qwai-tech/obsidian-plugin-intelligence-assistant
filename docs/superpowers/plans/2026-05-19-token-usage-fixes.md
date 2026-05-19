# Token Usage Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six defects in the token usage tracking feature: missing recording in chat mode, wrong tokenUsage on agent final message, hardcoded cost formula, unpopulated conversationId, unsafe type casts, and missing time-range filter in the UI.

**Architecture:** All fixes are in existing files — no new files needed. `chat.service.ts` handles the recording bugs; `usage-tab.ts` handles the UI bugs; `token-usage-repository.ts` gets one new query method for date-range filtering. Type-safety improvements touch `main.ts`, `chat-view.ts`, and `usage-tab.ts`.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild (via `npm run build`), ESLint (via `npm run lint`)

---

## File Map

| File | Change |
|------|--------|
| `src/infrastructure/persistence/data/token-usage-repository.ts` | Add `getRecordsByDateRange(start, end)` |
| `src/application/services/chat.service.ts` | (1) Add `recordUsage` in `streamResponse`; (2) track `lastStepUsage` so agent final message has correct `tokenUsage`; (3) add `conversationId` to `ChatOptions` and pass it to `recordUsage` in both paths |
| `src/presentation/components/tabs/usage-tab.ts` | Remove hardcoded cost pill; add time-range selector (Today / Week / Month / All); compute summary from filtered records |
| `main.ts` | Collapse private `tokenUsageRepository` + public `_tokenUsageRepo` into a single public `tokenUsageRepo` getter |
| `src/presentation/views/chat-view.ts` | Pass `conversationId` in both `streamResponse` and `executeAgentLoop` options; remove `(plugin as any)` cast for the usage repo reference |

---

## Task 1 — Add `getRecordsByDateRange` to repository

**Files:**
- Modify: `src/infrastructure/persistence/data/token-usage-repository.ts`

- [ ] **Step 1: Add the method after `getRecentRecords`**

In `token-usage-repository.ts`, add after line 111 (`getRecentRecords`):

```ts
async getRecordsByDateRange(start: number, end: number): Promise<UsageRecord[]> {
    await this.initialize();
    const file = await this.readFile();
    return file.records.filter(r => r.timestamp >= start && r.timestamp <= end);
}
```

- [ ] **Step 2: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/persistence/data/token-usage-repository.ts
git commit -m "feat(token-usage): add getRecordsByDateRange query method"
```

---

## Task 2 — Fix: record usage in `streamResponse`

**Files:**
- Modify: `src/application/services/chat.service.ts` (around line 269, after stream loop)

The `streamResponse` method streams a response, sets `streamUsage` from the final chunk, builds `assistantMessage`, then calls `onComplete`. It never calls `this.usageRepo.recordUsage`. Fix: record right before calling `callbacks.onComplete`.

- [ ] **Step 1: Add `recordUsage` call in `streamResponse`**

In `chat.service.ts`, locate the block that builds `assistantMessage` (around line 270). Add the recording call immediately before `callbacks.onComplete(assistantMessage)`:

```ts
// Record usage for regular (non-agent) chat
if (this.usageRepo && streamUsage) {
    void this.usageRepo.recordUsage({
        model: selectedModel,
        provider: config.provider,
        promptTokens: streamUsage.promptTokens,
        completionTokens: streamUsage.completionTokens,
        totalTokens: streamUsage.totalTokens,
        timestamp: Date.now()
    });
}

callbacks.onComplete(assistantMessage);
```

Note: `config` is already in scope (`const config = ModelManager.findConfigForModelByProvider(...)`).

- [ ] **Step 2: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/application/services/chat.service.ts
git commit -m "fix(token-usage): record usage in streamResponse (chat mode was not tracked)"
```

---

## Task 3 — Fix: agent final message has correct `tokenUsage`

**Files:**
- Modify: `src/application/services/chat.service.ts` (agent loop, around line 360–535)

**Problem:** Each agent step captures `streamUsage` from the stream, records it, then resets `streamUsage = null`. The final `assistantMessage` (line 529) therefore always has `tokenUsage: undefined`.

**Fix:** Introduce `lastStepUsage` to preserve the most recent step's usage for the final message.

- [ ] **Step 1: Introduce `lastStepUsage` variable**

In `executeAgentLoop`, locate the variable declarations before the `for` loop (around line 362). Add `lastStepUsage` alongside `streamUsage`:

```ts
let streamUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
let lastStepUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
```

- [ ] **Step 2: Assign `lastStepUsage` before resetting `streamUsage`**

Find the line `streamUsage = null;` (around line 438) inside the agent loop. Change the block to save the value first:

```ts
if (this.usageRepo && streamUsage) {
    void this.usageRepo.recordUsage({
        model: selectedModel,
        provider: config.provider,
        promptTokens: streamUsage.promptTokens,
        completionTokens: streamUsage.completionTokens,
        totalTokens: streamUsage.totalTokens,
        timestamp: Date.now()
    });
}
lastStepUsage = streamUsage;   // <-- save before clearing
streamUsage = null;
```

- [ ] **Step 3: Use `lastStepUsage` for final message**

Find the final `assistantMessage` construction (around line 529):

```ts
const assistantMessage: Message = {
    role: 'assistant',
    content: finalContent,
    model: selectedModel,
    ragSources: ragSources.length > 0 ? ragSources : undefined,
    webSearchResults: webResults.length > 0 ? webResults : undefined,
    tokenUsage: streamUsage || undefined   // <-- BUG: always undefined
};
```

Change to:

```ts
const assistantMessage: Message = {
    role: 'assistant',
    content: finalContent,
    model: selectedModel,
    ragSources: ragSources.length > 0 ? ragSources : undefined,
    webSearchResults: webResults.length > 0 ? webResults : undefined,
    tokenUsage: lastStepUsage ?? undefined
};
```

Also fix the early-return inside the `!reactEnabled` branch (around line 450–455) which also uses `streamUsage || undefined`:

```ts
callbacks.onComplete({
    role: 'assistant', content: finalContent, model: selectedModel,
    ragSources: ragSources.length > 0 ? ragSources : undefined,
    webSearchResults: webResults.length > 0 ? webResults : undefined,
    tokenUsage: lastStepUsage ?? undefined
} as Message);
return;
```

- [ ] **Step 4: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/application/services/chat.service.ts
git commit -m "fix(token-usage): preserve lastStepUsage for agent final message tokenUsage"
```

---

## Task 4 — Add `conversationId` to usage recording

**Files:**
- Modify: `src/application/services/chat.service.ts`
- Modify: `src/presentation/views/chat-view.ts`

- [ ] **Step 1: Add `conversationId` to `ChatOptions`**

In `chat.service.ts`, find the `ChatOptions` interface (around line 23). Add the optional field:

```ts
export interface ChatOptions {
    model: string;
    mode: 'chat' | 'agent';
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    enableRAG?: boolean;
    enableWebSearch?: boolean;
    autoTriggerWebSearch?: boolean;
    activeSystemPrompts?: Message[];
    contextWindow?: number;
    tokenBudget?: number;
    conversationId?: string;   // <-- add this
}
```

- [ ] **Step 2: Update `usageRepo` interface signature to accept `conversationId`**

In `ChatService` constructor (around line 71), the `usageRepo` type is an inline interface. Extend it:

```ts
private usageRepo?: {
    recordUsage: (r: {
        model: string;
        provider: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        timestamp: number;
        conversationId?: string;
    }) => Promise<void>;
}
```

- [ ] **Step 3: Pass `conversationId` in `streamResponse` recording**

In the `recordUsage` call added in Task 2 inside `streamResponse`:

```ts
void this.usageRepo.recordUsage({
    model: selectedModel,
    provider: config.provider,
    promptTokens: streamUsage.promptTokens,
    completionTokens: streamUsage.completionTokens,
    totalTokens: streamUsage.totalTokens,
    timestamp: Date.now(),
    conversationId: options.conversationId
});
```

- [ ] **Step 4: Pass `conversationId` in `executeAgentLoop` recording**

In the `recordUsage` call inside the agent loop (Task 3):

```ts
void this.usageRepo.recordUsage({
    model: selectedModel,
    provider: config.provider,
    promptTokens: streamUsage.promptTokens,
    completionTokens: streamUsage.completionTokens,
    totalTokens: streamUsage.totalTokens,
    timestamp: Date.now(),
    conversationId: options.conversationId
});
```

- [ ] **Step 5: Pass `conversationId` from `chat-view.ts`**

In `chat-view.ts`, find the `streamResponse` call options (around line 551). Add:

```ts
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
        conversationId: this.state.currentConversationId ?? undefined   // <-- add
    },
    // ...callbacks unchanged
```

Also in the `executeAgentLoop` call options (around line 621):

```ts
await this.chatService.executeAgentLoop(
    llmMessages,
    {
        model: selectedModel,
        mode: 'agent',
        // ...existing fields...
        allowOpenApiTools: this.plugin.hasEnabledOpenApiTools(),
        conversationId: this.state.currentConversationId ?? undefined   // <-- add
    },
    // ...callbacks unchanged
```

- [ ] **Step 6: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/application/services/chat.service.ts src/presentation/views/chat-view.ts
git commit -m "feat(token-usage): populate conversationId in all usage records"
```

---

## Task 5 — Fix type-unsafe `(plugin as any)._tokenUsageRepo`

**Files:**
- Modify: `main.ts`
- Modify: `src/presentation/views/chat-view.ts`
- Modify: `src/presentation/components/tabs/usage-tab.ts`

Currently `main.ts` has both a `private tokenUsageRepository` and a `public _tokenUsageRepo` that are always assigned together. Collapse them into one `public tokenUsageRepo` with a proper name.

- [ ] **Step 1: Replace dual fields in `main.ts` with single public field**

Find lines 112–113:
```ts
private tokenUsageRepository: TokenUsageRepository | null = null;
public _tokenUsageRepo: TokenUsageRepository | null = null;
```

Replace with:
```ts
public tokenUsageRepo: TokenUsageRepository | null = null;
```

- [ ] **Step 2: Update all references in `main.ts`**

Find lines 502–504 and 517. Change all `this.tokenUsageRepository` and `this._tokenUsageRepo` to `this.tokenUsageRepo`:

```ts
if (!this.tokenUsageRepo) {
    this.tokenUsageRepo = new TokenUsageRepository(this.app);
}
// ...
this.tokenUsageRepo.initialize(),
```

- [ ] **Step 3: Fix `chat-view.ts` cast**

Line 133 — change:
```ts
(this.plugin as any)._tokenUsageRepo
```
to:
```ts
this.plugin.tokenUsageRepo ?? undefined
```

- [ ] **Step 4: Fix `usage-tab.ts` cast**

Line 25 — change:
```ts
const repo = (plugin as any)._tokenUsageRepo as TokenUsageRepository | undefined;
```
to:
```ts
const repo = plugin.tokenUsageRepo ?? undefined;
```

- [ ] **Step 5: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add main.ts src/presentation/views/chat-view.ts src/presentation/components/tabs/usage-tab.ts
git commit -m "refactor(token-usage): replace unsafe (plugin as any) cast with typed tokenUsageRepo field"
```

---

## Task 6 — Fix usage UI: remove hardcoded cost, add time-range filter

**Files:**
- Modify: `src/presentation/components/tabs/usage-tab.ts`

**Problems:**
1. `$${cost}` uses a single fixed $/token rate applied to all providers — misleading.
2. No time-range filtering.

**Plan:** Remove the cost pill. Add a time-range selector (Today / This week / This month / All time) that recomputes all three sections (summary, by-provider, by-model, recent) from filtered records.

- [ ] **Step 1: Replace the entire `displayUsageTab` function body**

Replace the current implementation in `usage-tab.ts` with:

```ts
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

        // ---- Recent Activity (always last 10, regardless of range) ----
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
        clearBtn.addEventListener('click', async () => {
            if (await showConfirm(_app, 'Clear all token usage records? This cannot be undone.')) {
                await repo.clearAll();
                _refreshDisplay();
            }
        });
    };

    // Render filter buttons
    const btnEls: Map<Range, HTMLElement> = new Map();
    for (const { range, label } of rangeButtons) {
        const btn = filterBar.createEl('button', { text: label, cls: 'ia-button' });
        if (range === activeRange) btn.addClass('ia-button--active');
        btnEls.set(range, btn);
        btn.addEventListener('click', async () => {
            activeRange = range;
            btnEls.forEach((el, r) => {
                if (r === activeRange) el.addClass('ia-button--active');
                else el.removeClass('ia-button--active');
            });
            await renderStats();
        });
    }

    await renderStats();
}
```

- [ ] **Step 2: Verify lint + build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/components/tabs/usage-tab.ts
git commit -m "feat(token-usage): add time-range filter, remove inaccurate cost estimate"
```

---

## Self-Review

**Spec coverage:**
- [x] `streamResponse` records usage — Task 2
- [x] Agent final message has correct `tokenUsage` — Task 3
- [x] Hardcoded cost formula removed — Task 6
- [x] `conversationId` populated — Task 4
- [x] Type-unsafe cast removed — Task 5
- [x] Time-range filter added — Task 6

**Placeholder scan:** No TBDs, TODOs, or "similar to" references found.

**Type consistency:**
- `getRecordsByDateRange` defined in Task 1, used in Task 6 ✓
- `tokenUsageRepo` renamed in Task 5, consumed in Tasks 5 and 6 ✓
- `conversationId` added to `ChatOptions` in Task 4 and consumed in same task ✓
- `lastStepUsage` introduced and used within Task 3 ✓
