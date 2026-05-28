# E2E Rebuild Phase 2 Agent MCP RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic E2E coverage for the Agentic Agent loop, MCP tools, RAG retrieval, tool configuration, prompts, and editor quick actions.

**Architecture:** Keep every E2E spec self-contained by resetting the test vault, seeding plugin runtime config through helper APIs, and driving the Obsidian UI with stable `data-testid` selectors. Use the local mock LLM server for chat, tool-calling, model listing, and embeddings so Phase 2 runs without real API keys or network calls. Add selectors and fixture helpers only where existing UI has no stable observable contract.

**Tech Stack:** WebdriverIO, `wdio-obsidian-service`, TypeScript, Obsidian plugin runtime storage, local Node mock servers, OpenAI-compatible mock LLM responses, plugin `TestIds`.

---

## File Structure

- `docs/project/e2e-backlog.md` records completion status for Phase 2 specs.
- `docs/superpowers/plans/2026-05-24-e2e-rebuild-phase-2-agent-mcp-rag.md` is this implementation plan.
- `tests/e2e/specs/agents/*.spec.ts` covers Agentic Agent behavior.
- `tests/e2e/specs/settings/*.spec.ts` covers settings persistence and source registration.
- `tests/e2e/specs/rag/*.spec.ts` covers indexing and retrieval.
- `tests/e2e/specs/editor/*.spec.ts` covers editor-triggered quick actions.
- `tests/e2e/pages/chat/chat-view.page.ts` exposes chat and agent-mode page actions.
- `tests/e2e/pages/settings/*.page.ts` exposes stable settings actions.
- `tests/e2e/support/data-fixtures.ts` seeds providers, agents, MCP servers, prompts, quick actions, and tools.
- `tests/e2e/support/mock-llm.ts` and `tests/e2e/support/mock-llm-server.ts` queue deterministic LLM responses.
- `tests/e2e/support/mock-mcp-server.js` provides a small stdio JSON-RPC MCP server for CI.
- `src/presentation/utils/test-ids.ts` defines stable E2E selectors.
- `src/presentation/components/chat/handlers/tool-call-handler.ts` renders execution trace selectors.
- `src/presentation/components/tabs/*.ts` and `src/presentation/components/tabs/tools/*.ts` get selectors only when specs need them.

---

### Task 1: Agent Tool Call Loop Sentinel

**Files:**
- Create: `tests/e2e/specs/agents/tool-call-loop.spec.ts`
- Modify: `tests/e2e/pages/chat/chat-view.page.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/chat/handlers/tool-call-handler.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Write the failing E2E spec**

```ts
import { ChatViewPage } from '../../pages/chat/chat-view.page';
import { waitForPluginReady } from '../../support/plugin-helpers';
import { mockLLM } from '../../support/mock-llm';
import { VaultFixture } from '../../support/vault-fixture';

interface StreamChatRequest {
	model?: string;
	stream?: boolean;
	messages?: Array<{ role: string; content: string }>;
	tools?: Array<{ type: string; function: { name: string } }>;
}

describe('Agent tool call loop', () => {
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	beforeEach(async () => {
		await vault.reset();
		await mockLLM.clearAll();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('executes a tool call, shows the trace, and sends tool output into the follow-up LLM call', async () => {
		await mockLLM.toolCall('read_file', { path: 'test-note.md' });
		await mockLLM.replyWith('The note contains AGENT_TOOL_SENTINEL from the vault.');

		await chat.selectMode('agent');
		await chat.sendMessage('Read test-note.md and report the sentinel.');
		await chat.waitForReplyComplete(20_000);

		await expect(await chat.getToolTraceText()).toContain('read_file');
		await expect(await chat.getToolTraceText()).toContain('AGENT_TOOL_SENTINEL');
		await expect(await chat.getLastAssistantText()).toContain('AGENT_TOOL_SENTINEL');

		const calls = (await mockLLM.getCalls())
			.map(call => call.body as StreamChatRequest | null)
			.filter(body => body?.stream === true);

		await expect(calls).toHaveLength(2);
		await expect(calls[0]?.tools?.map(tool => tool.function.name)).toContain('read_file');
		await expect(calls[1]?.messages).toEqual(expect.arrayContaining([
			expect.objectContaining({
				role: 'tool',
				content: expect.stringContaining('AGENT_TOOL_SENTINEL'),
			}),
		]));
	});
});
```

- [ ] **Step 2: Run the spec and confirm the first failure**

Run: `npm run test:e2e:ci -- --spec tests/e2e/specs/agents/tool-call-loop.spec.ts`

Expected: FAIL because `ChatViewPage.selectMode()` and `ChatViewPage.getToolTraceText()` do not exist yet, or because trace selectors are absent.

- [ ] **Step 3: Add chat page object helpers**

Add to `tests/e2e/pages/chat/chat-view.page.ts`:

```ts
async selectMode(mode: 'chat' | 'agent'): Promise<void> {
	await this.waitFor(TestIds.chat.modeSelect);
	await browser.execute((testId, value) => {
		const select = document.querySelector(`[data-testid="${testId}"]`);
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error(`Mode select not found: ${testId}`);
		}
		select.value = value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	}, TestIds.chat.modeSelect, mode);
}

async getToolTraceText(): Promise<string> {
	await this.waitFor(TestIds.chat.agentTrace);
	return browser.execute((testId) => {
		const trace = document.querySelector(`[data-testid="${testId}"]`);
		return trace instanceof HTMLElement ? (trace.innerText || trace.textContent || '').trim() : '';
	}, TestIds.chat.agentTrace);
}
```

- [ ] **Step 4: Add trace test ids**

Add to `src/presentation/utils/test-ids.ts` under `chat`:

```ts
agentTrace: 'ia-chat-agent-trace',
agentTraceToolCard: 'ia-chat-agent-trace-tool-card',
agentTraceToolName: 'ia-chat-agent-trace-tool-name',
agentTraceToolOutput: 'ia-chat-agent-trace-tool-output',
```

Set them in `src/presentation/components/chat/handlers/tool-call-handler.ts`:

```ts
traceContainer.setAttribute('data-testid', TestIds.chat.agentTrace);
card.setAttribute('data-testid', TestIds.chat.agentTraceToolCard);
nameEl.setAttribute('data-testid', TestIds.chat.agentTraceToolName);
body.setAttribute('data-testid', TestIds.chat.agentTraceToolOutput);
```

- [ ] **Step 5: Ensure `test-note.md` contains the sentinel**

Confirm `tests/e2e/test-vault/test-note.md` and `tests/e2e/fixtures/vault-template/test-note.md` both include:

```md
AGENT_TOOL_SENTINEL
```

If the template file lacks the sentinel, update the template with a short note sentence and let `VaultFixture.reset()` copy it into the runtime vault.

- [ ] **Step 6: Run focused verification**

Run:

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/agents/tool-call-loop.spec.ts
npm run type-check
```

Expected: E2E spec PASS and type-check PASS.

- [ ] **Step 7: Update backlog and commit**

Mark `agents/tool-call-loop.spec.ts` checked in `docs/project/e2e-backlog.md`.

```bash
git add tests/e2e/specs/agents/tool-call-loop.spec.ts tests/e2e/pages/chat/chat-view.page.ts src/presentation/utils/test-ids.ts src/presentation/components/chat/handlers/tool-call-handler.ts tests/e2e/fixtures/vault-template/test-note.md docs/project/e2e-backlog.md
git commit -m "test: add agent tool loop e2e coverage"
```

---

### Task 2: Agent Tool Permission Isolation

**Files:**
- Create: `tests/e2e/specs/agents/tool-permission-isolation.spec.ts`
- Create: `tests/e2e/support/data-fixtures.ts`
- Modify: `tests/e2e/support/vault-fixture.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Add seed helper tests through the failing spec**

The spec seeds an active agent that can use `list_files` only, queues an LLM call for `read_file`, and asserts the trace reports a permission rejection.

```ts
await vault.seedSettings({
	agents: [createAgentConfig({
		id: 'agent-list-only',
		name: 'List Only Agent',
		toolAccess: { sources: { 'builtin:builtin': ['builtin:builtin:list_files'] } },
	})],
	activeAgentId: 'agent-list-only',
});
```

Expected trace text includes:

```txt
Tool "read_file" is not enabled for this agent
```

- [ ] **Step 2: Implement `data-fixtures.ts`**

```ts
import type { Agent } from '@/types';

export function createAgentConfig(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'agent-e2e',
		name: 'E2E Agent',
		description: 'E2E seeded agent',
		icon: 'A',
		systemPromptId: null,
		customPrompt: 'Use tools when needed and report the result.',
		modelStrategy: { strategy: 'chat-view' },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 5,
		contextWindow: 20,
		toolAccess: { sources: { 'builtin:builtin': 'all' } },
		...overrides,
	};
}
```

- [ ] **Step 3: Implement `VaultFixture.seedSettings()`**

Add a method that runs inside the Obsidian browser context, merges partial plugin settings, calls `saveSettings()`, and reloads the tool registry if present.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/agents/tool-permission-isolation.spec.ts
npm run type-check
```

- [ ] **Step 5: Update backlog and commit**

```bash
git add tests/e2e/specs/agents/tool-permission-isolation.spec.ts tests/e2e/support/data-fixtures.ts tests/e2e/support/vault-fixture.ts docs/project/e2e-backlog.md
git commit -m "test: add agent tool permission e2e coverage"
```

---

### Task 3: Agent Max Steps

**Files:**
- Create: `tests/e2e/specs/agents/max-steps.spec.ts`
- Modify: `src/application/agents/autonomous-agent-loop.ts`
- Modify: `src/presentation/components/chat/controllers/chat-controller.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Write the failing max-steps spec**

Seed an agent with `maxSteps: 2`, queue two `read_file` tool calls and a third fallback response. Assert only two streaming LLM calls happen and the assistant text or trace includes:

```txt
Reached the agent step limit of 2
```

- [ ] **Step 2: Implement explicit max-step notification**

In `AutonomousAgentLoop.execute()`, track whether the loop stopped because `step + 1 === maxSteps` while tool calls are still pending. Before `onComplete`, set final content to the existing last content plus a clear step-limit sentence.

- [ ] **Step 3: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/agents/max-steps.spec.ts
npm run type-check
git add tests/e2e/specs/agents/max-steps.spec.ts src/application/agents/autonomous-agent-loop.ts src/presentation/components/chat/controllers/chat-controller.ts docs/project/e2e-backlog.md
git commit -m "test: add agent max steps e2e coverage"
```

---

### Task 4: Agent CRUD Settings

**Files:**
- Create: `tests/e2e/specs/settings/agents-crud.spec.ts`
- Create: `tests/e2e/pages/settings/agents-settings.page.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/tabs/agents-tab.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Write the failing CRUD spec**

Open Settings -> Agents, create `Research Agent E2E`, edit its name to `Research Agent Updated`, reload the plugin, assert the row still exists, delete it, and assert `data/agents` or settings-backed persisted agents no longer include the id.

- [ ] **Step 2: Add agent settings selectors**

Use these ids:

```ts
agentAddBtn: 'ia-agent-add-btn',
agentRow: 'ia-agent-row',
agentEditBtn: 'ia-agent-edit-btn',
agentDeleteBtn: 'ia-agent-delete-btn',
agentModalNameInput: 'ia-agent-modal-name-input',
agentModalSaveBtn: 'ia-agent-modal-save-btn',
```

- [ ] **Step 3: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/settings/agents-crud.spec.ts
npm run type-check
git add tests/e2e/specs/settings/agents-crud.spec.ts tests/e2e/pages/settings/agents-settings.page.ts src/presentation/utils/test-ids.ts src/presentation/components/tabs/agents-tab.ts docs/project/e2e-backlog.md
git commit -m "test: add agent settings e2e coverage"
```

---

### Task 5: Mock MCP Server and MCP CRUD

**Files:**
- Create: `tests/e2e/support/mock-mcp-server.js`
- Create: `tests/e2e/specs/settings/mcp-crud.spec.ts`
- Create: `tests/e2e/pages/settings/mcp-settings.page.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/tabs/mcp-tab.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Create mock MCP server**

Implement stdio JSON-RPC methods `initialize`, `tools/list`, `tools/call`, and `shutdown`. Return one tool named `vault_echo` whose result includes `MCP_SENTINEL`.

- [ ] **Step 2: Write MCP CRUD spec**

Add server with command `node` and args pointing at `tests/e2e/support/mock-mcp-server.js`; connect; assert cached tools include `vault_echo`.

- [ ] **Step 3: Add required selectors and page object**

Use stable ids for add, row, command input, args input, connect, delete, and save modal buttons.

- [ ] **Step 4: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/settings/mcp-crud.spec.ts
npm run type-check
git add tests/e2e/support/mock-mcp-server.js tests/e2e/specs/settings/mcp-crud.spec.ts tests/e2e/pages/settings/mcp-settings.page.ts src/presentation/utils/test-ids.ts src/presentation/components/tabs/mcp-tab.ts docs/project/e2e-backlog.md
git commit -m "test: add mcp settings e2e coverage"
```

---

### Task 6: MCP Tool Call Through Agent Loop

**Files:**
- Create: `tests/e2e/specs/agents/mcp-tool-call.spec.ts`
- Modify: `tests/e2e/support/data-fixtures.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Write the failing MCP agent spec**

Seed an enabled MCP server, connect it, seed an active agent whose `toolAccess.sources` allows `mcp:e2e-mcp:all`, queue `mockLLM.toolCall('vault_echo', { text: 'hello' })`, then queue a final reply containing `MCP_SENTINEL`.

- [ ] **Step 2: Verify request and trace**

Assert first LLM call contains the MCP function name, trace contains `vault_echo`, final reply contains `MCP_SENTINEL`, and the second LLM call contains a tool role message with `MCP_SENTINEL`.

- [ ] **Step 3: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/agents/mcp-tool-call.spec.ts
npm run type-check
git add tests/e2e/specs/agents/mcp-tool-call.spec.ts tests/e2e/support/data-fixtures.ts docs/project/e2e-backlog.md
git commit -m "test: add mcp agent tool e2e coverage"
```

---

### Task 7: RAG Indexing and Retrieval

**Files:**
- Create: `tests/e2e/specs/rag/indexing.spec.ts`
- Create: `tests/e2e/specs/rag/retrieval-context.spec.ts`
- Create: `tests/e2e/pages/settings/rag-settings.page.ts`
- Modify: `tests/e2e/support/mock-llm.ts`
- Modify: `tests/e2e/support/mock-llm-server.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/tabs/rag-tab.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Add deterministic embeddings to the mock LLM**

Add `/v1/embeddings` support and `mockLLM.embeddings(vectors)` so RAG indexing can run in CI.

- [ ] **Step 2: Write `rag/indexing.spec.ts`**

Enable RAG, trigger reindex, queue vectors for `PKM Principles.md`, `LLM Architecture.md`, and `Reading List.md`, then assert `data/vector_store/notes.json` exists and contains chunks for all three paths.

- [ ] **Step 3: Write `rag/retrieval-context.spec.ts`**

With the same index, send a query about PKM, assert the assistant message has rendered RAG source UI and the persisted message contains `ragSources` with `PKM Principles.md`.

- [ ] **Step 4: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/rag/indexing.spec.ts --spec tests/e2e/specs/rag/retrieval-context.spec.ts
npm run type-check
git add tests/e2e/specs/rag/indexing.spec.ts tests/e2e/specs/rag/retrieval-context.spec.ts tests/e2e/pages/settings/rag-settings.page.ts tests/e2e/support/mock-llm.ts tests/e2e/support/mock-llm-server.ts src/presentation/utils/test-ids.ts src/presentation/components/tabs/rag-tab.ts docs/project/e2e-backlog.md
git commit -m "test: add rag e2e coverage"
```

---

### Task 8: Tool Settings Coverage

**Files:**
- Create: `tests/e2e/specs/settings/tools-builtin.spec.ts`
- Create: `tests/e2e/specs/settings/tools-openapi-import.spec.ts`
- Create: `tests/e2e/specs/settings/tools-cli-config.spec.ts`
- Create: `tests/e2e/pages/settings/tools-settings.page.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/tabs/tools/builtin-tools-section.ts`
- Modify: `src/presentation/components/tabs/tools/openapi-tools-section.ts`
- Modify: `src/presentation/components/tabs/tools/cli-tools-section.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Cover built-in enable and disable**

Disable `read_file`, run agent permission spec behavior, assert registry blocks `read_file`; re-enable and assert the tool appears in the outgoing LLM `tools` list.

- [ ] **Step 2: Cover OpenAPI import**

Paste a small JSON OpenAPI spec with `GET /ping`; assert a tool row appears and `data/openapi-tools/{id}.json` exists.

- [ ] **Step 3: Cover CLI config persistence**

Add a CLI tool named `echo_sentinel` with command `node`, args `-e "console.log(process.argv[1])" CLI_SENTINEL`, reload plugin, and assert the row persists.

- [ ] **Step 4: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/settings/tools-builtin.spec.ts --spec tests/e2e/specs/settings/tools-openapi-import.spec.ts --spec tests/e2e/specs/settings/tools-cli-config.spec.ts
npm run type-check
git add tests/e2e/specs/settings/tools-builtin.spec.ts tests/e2e/specs/settings/tools-openapi-import.spec.ts tests/e2e/specs/settings/tools-cli-config.spec.ts tests/e2e/pages/settings/tools-settings.page.ts src/presentation/utils/test-ids.ts src/presentation/components/tabs/tools/builtin-tools-section.ts src/presentation/components/tabs/tools/openapi-tools-section.ts src/presentation/components/tabs/tools/cli-tools-section.ts docs/project/e2e-backlog.md
git commit -m "test: add tool settings e2e coverage"
```

---

### Task 9: Prompts and Quick Actions

**Files:**
- Create: `tests/e2e/specs/settings/prompts-crud.spec.ts`
- Create: `tests/e2e/specs/settings/quickactions-crud.spec.ts`
- Create: `tests/e2e/specs/editor/quick-action.spec.ts`
- Create: `tests/e2e/pages/settings/prompts-settings.page.ts`
- Create: `tests/e2e/pages/settings/quickactions-settings.page.ts`
- Modify: `src/presentation/utils/test-ids.ts`
- Modify: `src/presentation/components/tabs/prompts-tab.ts`
- Modify: `src/presentation/components/tabs/quickactions-tab.ts`
- Modify: `src/presentation/editor/editor-quick-actions.ts`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Cover prompt CRUD**

Create `E2E Writing Prompt`, edit the body, reload plugin, assert the prompt persists, delete it, and assert it is absent from persisted prompt storage.

- [ ] **Step 2: Cover quick action CRUD**

Create `Rewrite E2E`, bind it to the E2E prompt, reload plugin, assert `settings.quickActions` includes it, then delete it.

- [ ] **Step 3: Cover editor quick action execution**

Open `test-note.md`, select `rough sentence`, run the quick action, queue `mockLLM.replyWith('polished sentence')`, and assert the editor text changed to `polished sentence`.

- [ ] **Step 4: Run focused verification and commit**

```bash
npm run test:e2e:ci -- --spec tests/e2e/specs/settings/prompts-crud.spec.ts --spec tests/e2e/specs/settings/quickactions-crud.spec.ts --spec tests/e2e/specs/editor/quick-action.spec.ts
npm run type-check
git add tests/e2e/specs/settings/prompts-crud.spec.ts tests/e2e/specs/settings/quickactions-crud.spec.ts tests/e2e/specs/editor/quick-action.spec.ts tests/e2e/pages/settings/prompts-settings.page.ts tests/e2e/pages/settings/quickactions-settings.page.ts src/presentation/utils/test-ids.ts src/presentation/components/tabs/prompts-tab.ts src/presentation/components/tabs/quickactions-tab.ts src/presentation/editor/editor-quick-actions.ts docs/project/e2e-backlog.md
git commit -m "test: add prompts quick actions e2e coverage"
```

---

### Task 10: Full Phase 2 Verification

**Files:**
- Modify: `tests/e2e/README.md`
- Modify: `docs/project/e2e-backlog.md`

- [ ] **Step 1: Update E2E documentation**

Document the mock LLM endpoints `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, the mock MCP server, and the Phase 2 spec count.

- [ ] **Step 2: Run complete verification**

```bash
npm test -- src/__tests__/e2e-mock-llm-server.test.ts src/__tests__/e2e-vault-fixture.test.ts --runInBand
npm run type-check
npm run lint
npm run test:e2e:ci
npm run build
npm run deploy
```

Expected:
- Jest PASS.
- TypeScript PASS.
- Lint exits 0 with the existing sentence-case warnings only.
- E2E CI PASS.
- Build PASS.
- Deploy PASS.

- [ ] **Step 3: Commit docs and push**

```bash
git add tests/e2e/README.md docs/project/e2e-backlog.md
git commit -m "docs: document phase 2 e2e coverage"
git push
```

---

## Self-Review

- Spec coverage: The plan maps every unchecked Phase 2 item in `docs/project/e2e-backlog.md` to a concrete task and spec path.
- Placeholder scan: The plan intentionally avoids open-ended implementation placeholders; each task names files, assertions, commands, and commit boundaries.
- Type consistency: Tool access uses `AgentToolAccess.sources`, built-in ids use `builtin:builtin:<tool>`, LLM tool names use registry `llmName`, and chat requests use OpenAI-compatible `tools` plus `role: "tool"` follow-up messages.

Plan complete and saved to `docs/superpowers/plans/2026-05-24-e2e-rebuild-phase-2-agent-mcp-rag.md`.
