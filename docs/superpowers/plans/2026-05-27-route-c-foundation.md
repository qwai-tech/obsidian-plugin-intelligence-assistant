# Route C Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Route C slice: Obsidian-native Agent entry points that hand current note, selection, file, and folder tasks into the existing Agent mode safely.

**Architecture:** Add a pure prompt builder for deterministic task prompts, expose a `ChatView.startAgentTask()` handoff method, and register commands/menus in `main.ts`. This uses the existing ChatView, Agent mode, reference attachments, and tool registry instead of introducing a new workflow or multi-agent runtime.

**Tech Stack:** Obsidian plugin API, TypeScript, Jest, existing ChatView/ChatInput/ToolRegistry architecture.

---

## Execution Status

Completed on branch `route-c-trinity-refactor`.

- `ed69a58` — Obsidian-native Agent entry points, prompt builders,
  `ChatView.startAgentTask()`, commands, file-menu entries, README
  positioning, and safe defaults.

Final verification has since been repeated as part of the completed
Trinity refactor:

- `npm test -- --runInBand`
- `npm run type-check`
- `npm run lint` (passes with existing 36 sentence-case warnings)
- `npm run build`
- `npm run deploy`

---

### Task 1: Prompt Builder

**Files:**
- Create: `src/application/services/obsidian-agent-prompts.ts`
- Create: `src/__tests__/application/obsidian-agent-prompts.test.ts`

- [x] **Step 1: Write failing tests**

Create tests for current note, selection, and folder prompts. Each test should assert that safety language is present and the prompt contains the target path or selected text.

- [x] **Step 2: Run the failing test**

Run: `npm test -- src/__tests__/application/obsidian-agent-prompts.test.ts --runInBand`

Expected: fail because `obsidian-agent-prompts.ts` does not exist yet.

- [x] **Step 3: Implement prompt builder**

Create exported functions:

```ts
export function buildAskCurrentNotePrompt(path: string, question: string): string;
export function buildSummarizeCurrentNotePrompt(path: string): string;
export function buildOrganizeCurrentNotePrompt(path: string): string;
export function buildImproveSelectionPrompt(selection: string, path?: string): string;
export function buildSummarizeFilePrompt(path: string): string;
export function buildOrganizeFolderPrompt(path: string): string;
```

- [x] **Step 4: Verify tests pass**

Run: `npm test -- src/__tests__/application/obsidian-agent-prompts.test.ts --runInBand`

Expected: pass.

### Task 2: ChatView Agent Task Handoff

**Files:**
- Modify: `src/presentation/views/chat-view.ts`

- [x] **Step 1: Add public handoff method**

Add:

```ts
public async startAgentTask(options: {
  prompt: string;
  references?: Array<TFile | TFolder>;
  sendImmediately?: boolean;
}): Promise<void>
```

The method should switch to Agent mode, add references, refresh reference display, set the textarea value, dispatch an input event, focus the textarea, and optionally call `sendMessage()`.

- [x] **Step 2: Run existing ChatView-adjacent tests**

Run: `npm test -- src/presentation/components/chat/__tests__/chat-header.component.test.ts src/presentation/components/chat/__tests__/message-renderer.test.ts --runInBand`

Expected: pass.

### Task 3: Obsidian-Native Commands And File Menus

**Files:**
- Modify: `main.ts`

- [x] **Step 1: Import prompt builders and Obsidian types**

Use the prompt builder from Task 1 and Obsidian types needed for active file, editor selection, and menu events.

- [x] **Step 2: Add helper to open ChatView and prefill Agent task**

Add a helper that opens the right-sidebar ChatView and calls `startAgentTask()`.

- [x] **Step 3: Register commands**

Add commands:

- `ask-agent-current-note`
- `summarize-current-note-agent`
- `organize-current-note-agent`
- `improve-selection-agent`

- [x] **Step 4: Register file menu entries**

Register `file-menu` event and add Agent actions for `TFile` and `TFolder`.

- [x] **Step 5: Verify TypeScript parsing/build**

Run: `npm run build`

Expected: build completes. Existing known type-check warnings may remain, but the bundle should succeed.

### Task 4: Positioning And Safe Defaults

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `config/default/settings.json`
- Modify: `src/application/services/agent-service.ts`

- [x] **Step 1: Update README positioning**

Lead with Obsidian-native Agent value before listing advanced tools.

- [x] **Step 2: Update default system prompt**

Replace generic assistant prompt with an Obsidian-native assistant prompt that cites notes and asks before writes.

- [x] **Step 3: Update default Agent description**

Describe the default Agent as a safe Obsidian knowledge assistant.

- [x] **Step 4: Verify defaults load**

Run: `npm test -- src/__tests__/types/settings-migration.test.ts --runInBand`

Expected: pass.

### Task 5: Final Verification

**Files:**
- No new files.

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/__tests__/application/obsidian-agent-prompts.test.ts src/__tests__/presentation/editor-quick-actions.test.ts src/presentation/components/chat/__tests__/chat-header.component.test.ts --runInBand
```

- [x] **Step 2: Run build**

Run: `npm run build`

- [x] **Step 3: Commit and push**

Commit message:

```bash
feat: add obsidian-native agent entry points
```

- [x] **Step 4: Deploy**

Run: `npm run deploy`
