# Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current heavy card-based chat layout with a clean iMessage-style bubble chat: user messages as accent-colored bubbles on the right, assistant messages as neutral bubbles on the left, with avatars, hover-reveal actions, and a compact meta row below each assistant bubble.

**Architecture:** CSS-only changes to `styles.css`. No TypeScript files are touched. The existing DOM from `message-renderer.ts` is sufficient — we use `display: contents` on `.message-meta` for assistant messages to allow CSS `order` to position badges and timestamp below the content bubble.

**Tech Stack:** Pure CSS, Obsidian design tokens (`var(--interactive-accent)`, `var(--background-secondary)`, etc.), esbuild.

---

## File Structure

- **Modify only:** `styles.css`

The relevant CSS sections are currently scattered across multiple locations in `styles.css`. Each task targets specific line ranges — run `grep -n "<selector>" styles.css` if line numbers have shifted.

---

## Task 1: Reset the existing message CSS to a clean baseline

The current `styles.css` has several conflicting and half-finished message styles applied during earlier iterations. This task replaces all of them with the final bubble layout CSS.

**Files:**
- Modify: `styles.css` — sections around lines 1403–1445, 2139–2298, 3004–3125, 3181–3212

- [ ] **Step 1: Verify the build passes before making any changes**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 2: Replace the `.message-actions` block (around line 1403)**

Find and replace this entire block:
```css
/* Message Actions */
.message-actions {
	display: flex;
	gap: 2px;
	opacity: 0;
	transition: opacity 0.15s;
	margin-top: 4px;
	pointer-events: none;
}

.chat-message:hover .message-actions,
.ia-chat-message:hover .message-actions,
.message-body:hover .message-actions {
	opacity: 1;
	pointer-events: auto;
}
```

Replace with:
```css
/* Message Actions — base (overridden per role below) */
.message-actions {
	display: flex;
	gap: 2px;
	opacity: 0;
	transition: opacity 0.15s ease;
	pointer-events: none;
}
```

- [ ] **Step 3: Replace the entire "Enhanced Message Visual Distinction" block (around line 2138)**

Find and replace from `.chat-message,` through `.message-assistant .message-content { color: var(--text-normal); }` (about lines 2138–2297). Replace with this complete CSS block:

```css
/* ═══════════════════════════════════════════
   CHAT MESSAGES — Bubble Layout
   ═══════════════════════════════════════════ */

.chat-message,
.ia-chat-message {
	margin-bottom: 0;
	padding: 0;
	background: transparent;
	border-radius: 0;
	border: none;
	box-shadow: none;
	transition: none;
}

/* Streaming indicator on the content bubble, not the wrapper */
.ia-chat-message--streaming .message-content {
	outline: 1px solid rgba(59, 130, 246, 0.35);
	box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
}

.message-user,
.ia-chat-message--user {
	background: transparent;
}

.message-assistant,
.ia-chat-message--assistant {
	background: transparent;
}

/* ── Avatars ── */

.message-avatar {
	width: 26px;
	height: 26px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	color: var(--text-muted);
	background: var(--background-modifier-border);
}

.message-avatar svg {
	fill: currentColor;
	color: white;
	width: 14px;
	height: 14px;
}

.ia-provider-avatar svg {
	width: 14px;
	height: 14px;
}

/* ── Row layout (global: flex-end so avatars sit at bubble bottom) ── */

.message-row {
	display: flex;
	gap: 8px;
	align-items: flex-end;
	width: 100%;
	max-width: 100%;
}

/* ── message-meta base ── */

.message-meta {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-wrap: wrap;
}

.message-name {
	font-size: var(--ia-font-size-xs);
	color: var(--text-muted);
}

.message-timestamp {
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
}

/* ── message-content base ── */

.message-content {
	line-height: 1.5;
	word-wrap: break-word;
	font-size: var(--ia-font-size-s);
	white-space: normal;
}
```

- [ ] **Step 4: Build to confirm no regressions**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style: reset message CSS to clean bubble baseline"
```

---

## Task 2: Assistant bubble — content, meta row, footer

The assistant message uses `display: contents` on `.message-meta` so that its children (badges, timestamp) become direct flex children of `.message-body`. CSS `order` then positions them **below** the content bubble, achieving the "meta row below bubble" layout without any HTML changes.

**Files:**
- Modify: `styles.css` — add new assistant-specific block after the baseline from Task 1

- [ ] **Step 1: Find the `.chat-messages` block (around line 3004) and replace it**

```css
.chat-messages {
	flex: 1;
	overflow-y: auto;
	padding: 12px 16px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
```

- [ ] **Step 2: Find and replace the block starting at `.chat-message { display: flex; width: 100%; }` (around line 3083) through `.message-assistant .message-avatar { ... }` (around line 3125). Replace with:**

```css
.chat-message {
	display: flex;
	width: 100%;
}

/* ── Assistant message ── */

.message-assistant .message-row,
.ia-chat-message--assistant .message-row {
	align-items: flex-end;
}

.message-assistant .message-avatar,
.ia-chat-message--assistant .message-avatar {
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
}

/* message-body is a transparent flex column — NOT the visual bubble */
.message-assistant .message-body,
.ia-chat-message--assistant .message-body {
	display: flex;
	flex-direction: column;
	min-width: 0;
	max-width: 100%;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 0;
	overflow: visible;
}

/* display:contents removes the .message-meta wrapper from layout,
   making its children (.ia-chat-message__badges, .message-timestamp)
   direct flex children of .message-body so we can use order on them */
.message-assistant .message-meta,
.ia-chat-message--assistant .message-meta {
	display: contents;
}

.message-assistant .message-name,
.message-assistant .ia-chat-message__status,
.ia-chat-message--assistant .message-name,
.ia-chat-message--assistant .ia-chat-message__status {
	display: none;
}

/* Content IS the visual bubble (order:1, appears first) */
.message-assistant .message-content,
.ia-chat-message--assistant .message-content {
	order: 1;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px 16px 16px 16px;
	padding: 8px 12px;
	color: var(--text-normal);
}

/* Reasoning traces and section blocks stay between content and actions */
.message-assistant .agent-execution-trace-container,
.message-assistant .ia-agent-trace-container,
.message-assistant .ia-chat-message__section {
	order: 2;
}

/* Action bar — below content, hover reveal, order:3 */
.message-assistant .message-actions,
.ia-chat-message--assistant .message-actions {
	order: 3;
	display: flex;
	gap: 2px;
	max-height: 0;
	overflow: hidden;
	opacity: 0;
	transition: max-height 0.15s ease, opacity 0.15s ease, margin-top 0.15s ease;
	pointer-events: none;
	margin-top: 0;
}

.message-assistant .message-body:hover .message-actions,
.ia-chat-message--assistant:hover .message-actions {
	max-height: 36px;
	opacity: 1;
	pointer-events: auto;
	margin-top: 4px;
}

/* Badges — below bubble, always visible (order:10) */
.message-assistant .ia-chat-message__badges,
.ia-chat-message--assistant .ia-chat-message__badges {
	order: 10;
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 5px;
}

/* Timestamp — after badges (order:11) */
.message-assistant .message-timestamp,
.ia-chat-message--assistant .message-timestamp {
	order: 11;
	opacity: 1;
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
	margin-top: 2px;
	margin-left: 0;
	transition: none;
}

/* Token usage footer — last (order:12) */
.message-assistant .ia-chat-message__footer,
.message-assistant .ia-chat-message__annotation,
.ia-chat-message--assistant .ia-chat-message__footer,
.ia-chat-message--assistant .ia-chat-message__annotation {
	order: 12;
	display: block;
	margin-top: 2px;
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
	opacity: 1;
	transition: none;
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
git commit -m "style: assistant bubble layout with meta row below"
```

---

## Task 3: User bubble — accent bubble, timestamp, copy on hover

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Find the current user-specific block (around line 3088–3125, starts with `.message-user .message-row`) and replace it entirely with:**

```css
/* ── User message ── */

.message-user .message-row,
.ia-chat-message--user .message-row {
	flex-direction: row-reverse;
	align-items: flex-end;
}

.message-user .message-avatar,
.ia-chat-message--user .message-avatar {
	background: var(--interactive-accent);
	color: white;
}

/* Transparent flex column wrapper, right-aligned */
.message-user .message-body,
.ia-chat-message--user .message-body {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	min-width: 0;
	max-width: 72%;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 0;
	overflow: visible;
}

/* Hide name, badges, status — keep meta for timestamp only */
.message-user .message-name,
.message-user .ia-chat-message__badges,
.message-user .ia-chat-message__status,
.ia-chat-message--user .message-name,
.ia-chat-message--user .ia-chat-message__badges,
.ia-chat-message--user .ia-chat-message__status {
	display: none;
}

/* meta row: timestamp only, right-aligned, below bubble */
.message-user .message-meta,
.ia-chat-message--user .message-meta {
	display: flex;
	justify-content: flex-end;
	order: 10;
	margin-top: 3px;
}

/* User timestamp always visible */
.message-user .message-timestamp,
.ia-chat-message--user .message-timestamp {
	opacity: 1;
	margin-left: 0;
	transition: none;
}

/* User content IS the bubble */
.message-user .message-content,
.ia-chat-message--user .message-content {
	order: 1;
	background: var(--interactive-accent);
	color: var(--text-on-accent);
	padding: 8px 12px;
	border-radius: 16px 16px 4px 16px;
}

/* Copy action — right-aligned, hover reveal */
.message-user .message-actions,
.ia-chat-message--user .message-actions {
	order: 2;
	display: flex;
	justify-content: flex-end;
	gap: 2px;
	max-height: none;
	overflow: visible;
	opacity: 0;
	transition: opacity 0.15s ease;
	pointer-events: none;
	margin-top: 3px;
	background: transparent;
}

.message-user .message-body:hover .message-actions,
.ia-chat-message--user:hover .message-actions {
	opacity: 1;
	pointer-events: auto;
}

/* Hide token footer for user messages */
.message-user .ia-chat-message__footer,
.message-user .ia-chat-message__annotation,
.ia-chat-message--user .ia-chat-message__footer,
.ia-chat-message--user .ia-chat-message__annotation {
	display: none;
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: user bubble with copy-on-hover and timestamp"
```

---

## Task 4: Badge and footer styles, action button polish

**Files:**
- Modify: `styles.css` — the `.ia-chat-message__badges`, `.ia-chat-message__badge`, `.ia-chat-message__badge-label`, `.ia-chat-message__badge-value`, `.ia-chat-message__footer` blocks (around lines 3188–3212 and 2222–2234)

- [ ] **Step 1: Replace the global `.ia-chat-message__footer` block (around line 2222)**

Find:
```css
.ia-chat-message__footer,
.ia-chat-message__annotation {
	margin-top: 6px;
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
	opacity: 0;
	transition: opacity 0.15s ease;
}

.ia-chat-message:hover .ia-chat-message__footer,
.ia-chat-message:hover .ia-chat-message__annotation {
	opacity: 1;
}
```

Replace with (base styles only; role-specific overrides are in Tasks 2 and 3):
```css
.ia-chat-message__footer,
.ia-chat-message__annotation {
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
}
```

- [ ] **Step 2: Replace the `.ia-chat-message__badges` / `.ia-chat-message__badge` block (around line 3188)**

Find and replace from `.ia-chat-message__badges {` through `.ia-chat-message__badge-value { color: var(--text-faint); }`:
```css
.ia-chat-message__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.ia-chat-message__badge {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 1px 6px;
	border-radius: var(--ia-radius-full);
	border: none;
	background: var(--background-modifier-border);
	font-size: var(--ia-font-size-3xs);
	color: var(--text-muted);
}

.ia-chat-message__badge-label {
	display: none;
}

.ia-chat-message__badge-value {
	color: var(--text-muted);
}
```

- [ ] **Step 3: Verify the `.message-timestamp` global block (around line 2272) no longer conflicts**

It should now read (from Task 1):
```css
.message-timestamp {
	font-size: var(--ia-font-size-3xs);
	color: var(--text-faint);
}
```
If there's an old rule like `opacity: 0; transition: ...` still present, remove it.

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "style: clean up badge, footer, and timestamp styles"
```

---

## Task 5: Remove leftover conflicting rules and deploy

After the four tasks above, there may be orphaned rules from earlier iterations that override the new styles. This task does a targeted cleanup and then deploys.

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Search for stale rules that conflict**

```bash
grep -n "message-user .message-meta.*display: none\|message-user .message-actions.*display: none\|message-assistant .message-name.*display: none\|ia-chat-message--streaming .message-body" styles.css
```

For each line found that conflicts with the new rules (e.g., old `display: none` on user meta, old streaming indicator on `.message-body`), delete that line or block.

- [ ] **Step 2: Check for any duplicate `.message-row` rules**

```bash
grep -n "^\.message-row" styles.css
```

There should be exactly one block. If there are two, remove the duplicate (keep the one with `align-items: flex-end`).

- [ ] **Step 3: Build and lint**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✅ Build completed successfully`

- [ ] **Step 4: Deploy to local Obsidian sandbox**

```bash
node scripts/deploy.js --local 2>&1 | tail -5
```
Expected: `✅ 🎉 Plugin deployed successfully`

- [ ] **Step 5: Visual verification checklist**

Open the plugin in Obsidian. Send a test message and verify:
- [ ] User message appears as an accent-colored bubble on the right, avatar bottom-right
- [ ] Hovering user message reveals a Copy button below the bubble
- [ ] User timestamp visible below bubble
- [ ] Assistant message appears as a neutral bubble on the left, avatar bottom-left
- [ ] Hovering assistant message reveals Copy/Save/Insert/Regenerate bar below content
- [ ] Model + provider badges visible below assistant bubble (always)
- [ ] Token usage line visible below badges (always)
- [ ] Streaming animation shows on the content bubble outline (not the whole row)

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "style: remove stale overrides, deploy bubble chat UI"
```
