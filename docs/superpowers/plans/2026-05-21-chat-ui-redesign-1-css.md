# Chat UI Redesign — Plan 1: CSS New Classes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all new CSS classes for the A3 redesign. No existing classes are modified; this plan is purely additive and safe to merge alone.

**Architecture:** Insert a new CSS section into `styles.css` after the existing chat input container rules (~line 3870). The new classes will be used by Plan 2 (ChatInputComponent) and Plan 3 (ChatHeaderComponent). Until those plans land, these classes sit unused and harmless.

**Tech Stack:** CSS custom properties (Obsidian variables), native `<select>` with `appearance: none`.

---

### Task 1: Insert new CSS classes into styles.css

**Files:**
- Modify: `styles.css` (insert after line 3868, after `.chat-input-editor` block)

- [ ] **Step 1: Read the insertion point**

  Open `styles.css` and read lines 3855–3875 to confirm the `.chat-input-editor` block ends at ~line 3863. The new CSS section goes right after it (after `.chat-input-footer` block would also be fine — anywhere after line 3868).

- [ ] **Step 2: Insert the new CSS section**

  After the closing brace of `.chat-input-editor` (line 3863), add the following block. Use the Edit tool to insert after the exact string `.chat-input-editor {\n\tdisplay: flex;\n\talign-items: flex-end;\n\tgap: 8px;\n\tborder: 1px solid var(--background-modifier-border);\n\tborder-radius: 8px;\n\tbackground: var(--background-primary);\n\tpadding: 4px;\n}`:

  ```css
  /* ─── A3 Redesign: new header ─────────────────────────────────────────── */

  .chat-header-simple {
  	display: flex;
  	align-items: center;
  	gap: 8px;
  	padding: 7px 10px;
  	border-bottom: 1px solid var(--background-modifier-border);
  }

  .chat-header-title {
  	flex: 1;
  	font-size: var(--ia-font-size-xs);
  	font-weight: 600;
  	color: var(--text-normal);
  	overflow: hidden;
  	text-overflow: ellipsis;
  	white-space: nowrap;
  }

  .chat-header-icon-btn {
  	display: inline-flex;
  	align-items: center;
  	justify-content: center;
  	background: none;
  	border: none;
  	padding: 3px;
  	cursor: pointer;
  	color: var(--text-muted);
  	border-radius: 4px;
  	flex-shrink: 0;
  }

  .chat-header-icon-btn:hover {
  	background: var(--background-modifier-hover);
  	color: var(--text-normal);
  }

  .chat-header-icon-btn svg {
  	width: 14px;
  	height: 14px;
  }

  .chat-agent-header-badge {
  	display: inline-flex;
  	align-items: center;
  	padding: 2px 8px;
  	border-radius: 10px;
  	background: #dcfce7;
  	color: #15803d;
  	font-size: var(--ia-font-size-2xs);
  	font-weight: 600;
  	white-space: nowrap;
  	flex-shrink: 0;
  }

  /* ─── A3 Redesign: new input box ──────────────────────────────────────── */

  .chat-input-box {
  	border: 1.5px solid var(--background-modifier-border);
  	border-radius: 12px;
  	overflow: hidden;
  	background: var(--background-primary);
  }

  .chat-input-toolbar {
  	display: flex;
  	align-items: center;
  	gap: 4px;
  	padding: 6px 8px;
  	border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .chat-input-toolbar-spacer {
  	flex: 1;
  }

  .chat-input-pill-group {
  	display: flex;
  	align-items: center;
  	gap: 4px;
  }

  .chat-input-mode-pill,
  .chat-input-model-pill,
  .chat-input-agent-pill {
  	appearance: none;
  	-webkit-appearance: none;
  	border: none;
  	border-radius: 8px;
  	padding: 2px 8px;
  	font-size: var(--ia-font-size-2xs);
  	font-weight: 600;
  	cursor: pointer;
  	color: var(--text-normal);
  	max-width: 120px;
  	overflow: hidden;
  	text-overflow: ellipsis;
  }

  .chat-input-mode-pill {
  	background: color-mix(in srgb, var(--interactive-accent) 15%, transparent);
  	color: var(--interactive-accent);
  }

  .chat-input-model-pill {
  	background: var(--background-modifier-hover);
  	color: var(--text-muted);
  	max-width: 140px;
  }

  .chat-input-agent-pill {
  	background: #dcfce7;
  	color: #15803d;
  	max-width: 150px;
  }

  .chat-input-toolbar-btn {
  	display: inline-flex;
  	align-items: center;
  	gap: 3px;
  	background: none;
  	border: none;
  	padding: 3px 6px;
  	cursor: pointer;
  	border-radius: 6px;
  	font-size: var(--ia-font-size-2xs);
  	color: var(--text-muted);
  }

  .chat-input-toolbar-btn:hover {
  	background: var(--background-modifier-hover);
  	color: var(--text-normal);
  }

  .chat-input-toolbar-btn.is-link {
  	border: 1.5px dashed var(--background-modifier-border);
  	color: var(--text-normal);
  }

  .chat-input-toolbar-btn.is-link:hover {
  	border-color: var(--interactive-accent);
  	color: var(--interactive-accent);
  }

  .chat-input-toolbar-btn.is-active {
  	background: #dcfce7;
  	color: #15803d;
  }

  .chat-input-toolbar-btn svg {
  	width: 13px;
  	height: 13px;
  }
  ```

- [ ] **Step 3: Verify build passes**

  ```bash
  npm run lint && npm run build
  ```

  Expected: lint clean, build succeeds. New CSS classes exist but are unused until Plan 2/3.

- [ ] **Step 4: Commit**

  ```bash
  git add styles.css
  git commit -m "style: add A3 redesign CSS classes for new header and input toolbar"
  ```
