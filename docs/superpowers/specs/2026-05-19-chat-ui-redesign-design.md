# Chat UI Redesign — Design Spec

## Goal

Replace the current heavy card-based chat layout with a clean bubble chat design (iMessage-style): user messages as accent-colored bubbles on the right, assistant messages as neutral bubbles on the left, with avatars and hover-reveal actions.

## Architecture

All changes are **CSS-only** in `styles.css`. No TypeScript or HTML structure changes are required — the existing DOM emitted by `message-renderer.ts` supports this layout through targeted CSS overrides.

The existing DOM structure (unchanged):
```
.ia-chat-message (.message-user | .message-assistant)
  .message-row
    .message-avatar
    .message-body
      .message-meta          ← badges + timestamp
      .message-content       ← text content
      .message-actions       ← Copy / Save / Insert / Regenerate buttons
      .ia-chat-message__footer  ← token usage
```

---

## Design Decisions

### User messages (right side)

- **Row**: `flex-direction: row-reverse`, `align-items: flex-end`
- **Avatar**: 26 × 26 px circle, `background: var(--interactive-accent)`, bottom-right, shows emoji `🧑`
- **Bubble** (`.message-content`): accent background (`var(--interactive-accent)`), white text, `border-radius: 16px 16px 4px 16px`, `max-width: 72%`, `padding: 8px 12px`
- **Meta** (`.message-meta`): hidden entirely — no name label, no badges
- **Actions** (`.message-actions`): show a single `Copy` button only, right-aligned, white-on-accent style (`background: rgba(255,255,255,0.15)`), opacity 0 by default, `opacity: 1` on `.message-body:hover`
- **Footer** (`.ia-chat-message__footer`): hidden
- **Timestamp**: shown as one small line below `.message-body`, right-aligned, always visible, `font-size: 10px`, `color: var(--text-faint)`

### Assistant messages (left side)

- **Row**: `flex-direction: row`, `align-items: flex-end`
- **Avatar**: 26 × 26 px circle, `background: provider brand color` (set inline by renderer), bottom-left, shows provider SVG icon
- **Bubble** (`.message-body`): `background: var(--background-secondary)`, `border: 1px solid var(--background-modifier-border)`, `border-radius: 4px 16px 16px 16px`, no `max-width` cap
- **Name label** (`.message-name`): hidden
- **Badges** (`.ia-chat-message__badges`): hidden inside `.message-meta`; model + provider info moves to the meta row below the bubble (see below)
- **Content** (`.message-content`): no special overrides, inherits bubble padding
- **Action bar** (`.message-actions`): last visual line of the bubble, separated by `border-top: 1px solid var(--background-modifier-border)`, `background: var(--background-primary)`, `padding: 5px 10px`, contains Copy · Save · Insert to Notes · Regenerate; opacity 0 by default, `opacity: 1` on `.message-body:hover`

### Meta row (below assistant bubble, always visible)

Repurpose `.ia-chat-message__footer` to show a single compact line:

```
deepseek-v4-flash · DeepSeek · 7 in · 175 out · 5:18 PM
```

- `font-size: 10px`, `color: var(--text-faint)`
- Model name and provider shown as small pill badges (`.ia-chat-message__badge`)
- Token counts and timestamp inline, separated by `·`
- Always visible (no opacity change), `margin-top: 4px`, `padding-left: 2px`

The existing `.ia-chat-message__badge-label` (the "MODEL" / "PROVIDER" uppercase labels) is hidden (`display: none`).

### Token usage

Merged into the meta row below the bubble. The existing `.ia-chat-message__footer` element is repurposed: its content already has token counts; CSS reformats it into the single-line combined display.

---

## CSS Changes Summary

| Selector | Change |
|---|---|
| `.message-row` | `align-items: flex-end` (global) |
| `.message-user .message-row` | `flex-direction: row-reverse` |
| `.message-body` | bubble style: border, bg, border-radius `4px 16px 16px 16px` |
| `.message-user .message-body` | transparent, no border, no padding (wrapper only) |
| `.message-user .message-content` | accent bubble: `bg: var(--interactive-accent)`, white text, `border-radius: 16px 16px 4px 16px`, `padding: 8px 12px`, `max-width: 72%` |
| `.message-user .message-meta` | `display: none` |
| `.message-user .ia-chat-message__footer` | `display: none` |
| `.message-assistant .message-name` | `display: none` |
| `.message-assistant .ia-chat-message__badges` | `display: none` (badges moved to footer row) |
| `.message-actions` | `opacity: 0`, `transition: opacity 0.15s`; inside bubble at bottom with top border |
| `.message-body:hover .message-actions` | `opacity: 1` |
| `.message-user .message-actions` | single Copy button only, `justify-content: flex-end`, outside bubble |
| `.ia-chat-message__footer` | repurposed as always-visible meta row; `font-size: 10px`, `color: var(--text-faint)`, single line |
| `.ia-chat-message__badge-label` | `display: none` |
| `.message-avatar` | `26px`, `align-self: flex-end` (already in flex-end row) |
| `.message-user .message-avatar` | `background: var(--interactive-accent)` |
| `.chat-messages` | `gap: 8px` |

---

## Out of Scope

- No changes to `message-renderer.ts` or any TypeScript files
- No changes to the conversation list, header, or input area
- No new CSS variables; uses existing Obsidian design tokens throughout
