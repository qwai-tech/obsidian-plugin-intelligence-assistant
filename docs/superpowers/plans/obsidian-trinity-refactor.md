# Obsidian Trinity Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Route C into a single Obsidian-native autonomous knowledge agent that senses vault context, plans and acts with tools, reflects on outcomes, preserves research memory, and never writes to the vault without an explicit user-approved proposal.

**Architecture:** Keep one Agentic Agent runtime, not a workflow builder and not a multi-agent system. Extract the current `ChatService.executeAgentLoop()` into `AutonomousAgentLoop`, add a vault-aware Sense phase that combines active note graph context, selected references, RAG results, and research memory, then run Plan/Act/Reflect through the existing provider and `ToolRegistry`. Standardize tool inputs with Zod validation and enforce proposal-first vault writes at the registry boundary.

**Tech Stack:** TypeScript, Obsidian plugin API, Jest, existing `ToolRegistry`, existing `RAGManager`, existing provider abstractions, Zod.

---

## Execution Status

Completed on branch `route-c-trinity-refactor`.

- `1355a22` — Trinity runtime types and SPAR trace metadata.
- `6e90bad` — vault-aware Agent Sense service.
- `1ff621a` — agent memory service and history compaction.
- `d74dac7` — extracted `AutonomousAgentLoop`.
- `6fe79ec` — wired Trinity loop into Chat.
- `66b1d4a` — Zod tool schemas and proposal-first guard.
- `303e0e3` — SPAR phase labels in agent traces.
- `27f20c1` — final legacy agent-loop cleanup.
- `2dc88bc` — removed remaining unused workflow-named source residue.

Final verification:

- `npm test -- --runInBand`
- `npm run type-check`
- `npm run lint` (passes with existing 36 sentence-case warnings)
- `npm run build`
- `npm run test:e2e:ci`
- `npm run deploy`

---

## Source Design

This plan implements `docs/architecture/trinity-design.md`:

- **SPAR loop:** Sense -> Plan -> Act -> Reflect, with active note, graph neighbors, and RAG context in Sense.
- **Proposal-first tools:** vault-mutating tools return `{ type: "write_proposal", ... }`; UI applies only after user confirmation.
- **Autonomous memory:** plugin data folder stores `memory.json`; compaction inserts a "Research Log" block when context exceeds 10k estimated tokens.

## Scope Boundaries

- Build a single autonomous agent loop.
- Do not add workflow nodes, workflow canvases, workflow templates, or workflow execution state.
- Do not add multi-agent orchestration in this refactor.
- Preserve existing Chat mode behavior.
- Preserve existing Agent mode UI entry points and current Obsidian context menu commands.
- Keep MCP/OpenAPI/CLI as tool sources only; they are not LLM providers.

## File Structure

Create:

- `src/application/agents/types.ts` - SPAR runtime types, working-message types, sense context, loop options.
- `src/application/agents/agent-sense-service.ts` - active-note, graph-neighbor, reference, RAG, and memory context collector.
- `src/application/agents/history-compactor.ts` - deterministic research-log compaction for long agent sessions.
- `src/application/agents/autonomous-agent-loop.ts` - extracted SPAR loop that owns provider streaming, tool execution, reflection, usage, and callbacks.
- `src/application/agents/index.ts` - barrel exports for agent runtime files.
- `src/application/services/agent-memory-service.ts` - application service for working memory and research log updates.
- `src/infrastructure/persistence/data/agent-memory-repository.ts` - repository for `.obsidian/plugins/intelligence-assistant/data/agent-memory/memory.json`.
- `src/application/tools/tool-schema.ts` - Zod schema builders and validation helpers for all tools.
- `src/__tests__/application/agents/agent-sense-service.test.ts`
- `src/__tests__/application/agents/history-compactor.test.ts`
- `src/__tests__/application/agents/autonomous-agent-loop.test.ts`
- `src/__tests__/application/agent-memory-service.test.ts`
- `src/application/tools/__tests__/tool-schema.test.ts`

Modify:

- `package.json` - add `zod`.
- `package-lock.json` - update lockfile after installing `zod`.
- `src/constants.ts` - add agent memory data-folder constants.
- `src/types/common/tools.ts` - add Zod input schema and tool side-effect metadata.
- `src/application/services/types.ts` - remove duplicate tool type declarations by re-exporting common tool types.
- `src/application/tools/tool-registry.ts` - validate args before execution and enforce proposal-first for vault writes.
- `src/application/services/file-tools.ts` - add schemas and side-effect metadata to file tools.
- `src/application/services/search-tools.ts` - add schemas and side-effect metadata to search/note tools.
- `src/application/services/cli-tool.ts` - attach schemas to generated CLI tools.
- `src/application/services/mcp-tool-wrapper.ts` - convert MCP schemas to Zod input schemas.
- `src/application/tools/sources/openapi-loader-core.ts` - attach schemas to generated OpenAPI tools.
- `src/application/tools/sources/__tests__/builtin-tool-source.test.ts`
- `src/application/tools/sources/__tests__/cli-tool-source.test.ts`
- `src/application/tools/sources/__tests__/mcp-tool-source.test.ts`
- `src/application/tools/sources/__tests__/openapi-loader-core.test.ts`
- `src/application/tools/__tests__/tool-registry.test.ts`
- `src/application/services/write-proposal-service.ts` - add assertion helper for registry enforcement.
- `src/__tests__/application/write-proposal-service.test.ts`
- `src/application/services/chat.service.ts` - delegate Agent mode to `AutonomousAgentLoop`.
- `src/presentation/views/chat-view.ts` - construct Sense, Memory, Compactor, and Loop dependencies.
- `src/presentation/components/chat/controllers/chat-controller.ts` - pass message references into Agent loop options.
- `src/presentation/components/chat/handlers/tool-call-handler.ts` - render SPAR phase labels in existing trace.
- `src/presentation/components/chat/message-renderer.ts` - keep write proposal cards after trace rendering.
- `src/types/common/reasoning.ts` - add optional `phase` to `AgentExecutionStep`.
- `src/infrastructure/persistence/data/index.ts` - export the memory repository.
- `src/application/services/plugin-data-service.ts` - initialize and expose the memory repository.

---

### Task 1: Agent Runtime Types

**Files:**
- Create: `src/application/agents/types.ts`
- Create: `src/application/agents/index.ts`
- Modify: `src/types/common/reasoning.ts`

- [x] **Step 1: Write the failing type usage test**

Create `src/__tests__/application/agents/history-compactor.test.ts` with the first compile-time and runtime assertion for the upcoming types:

```ts
import type { AgentSenseContext, AgentWorkingMessage } from '@/application/agents';

describe('agent runtime types', () => {
	it('allows a system research log working message', () => {
		const context: AgentSenseContext = {
			userQuery: 'organize this project',
			activeFilePath: 'Projects/A.md',
			references: [],
			sections: [{ title: 'Active note', content: 'A', source: 'active-note' }],
			ragSources: [],
			memory: null,
		};
		const msg: AgentWorkingMessage = {
			role: 'system',
			content: `Research Log:\n${context.sections[0].content}`,
		};

		expect(msg.content).toContain('Research Log');
		expect(context.sections[0].source).toBe('active-note');
	});
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/__tests__/application/agents/history-compactor.test.ts --runInBand
```

Expected: FAIL with `Cannot find module '@/application/agents'`.

- [x] **Step 3: Add the runtime type file**

Create `src/application/agents/types.ts`:

```ts
import type { App } from 'obsidian';
import type { Message, RAGSource, WebSearchResult, Agent, FileReference } from '@/types';
import type { StreamChunk, ILLMProvider } from '@/types/common/llm';
import type { AgentExecutionStep } from '@/types/common/reasoning';

export type SparPhase = 'sense' | 'plan' | 'act' | 'reflect' | 'final';

export interface AgentContextSection {
	title: string;
	content: string;
	source: 'active-note' | 'graph-neighbor' | 'reference' | 'rag' | 'memory';
	path?: string;
}

export interface AgentMemorySnapshot {
	agentId: string;
	workingNotes: string[];
	researchLog: string;
	preferences: Record<string, string>;
	updatedAt: number;
}

export interface AgentSenseContext {
	userQuery: string;
	activeFilePath: string | null;
	references: FileReference[];
	sections: AgentContextSection[];
	ragSources: RAGSource[];
	memory: AgentMemorySnapshot | null;
}

export interface AgentLoopCallbacks {
	onChunk: (chunk: StreamChunk) => void;
	onToolCall: (toolName: string, args: Record<string, unknown>, thinking?: string, phase?: SparPhase) => void;
	onToolResult: (toolName: string, success: boolean, output: string, phase?: SparPhase) => void;
	onThought: (thought: string, phase?: SparPhase) => void;
	onComplete: (finalMessage: Message) => void;
	onError: (error: Error) => void;
	onTokenUsage?: (step: number, cumulativeTokens: number, budget: number) => void;
	checkAbort?: () => boolean;
}

export interface AgentLoopOptions {
	model: string;
	mode: 'agent';
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	enableRAG?: boolean;
	enableWebSearch?: boolean;
	activeSystemPrompts?: Message[];
	contextWindow?: number;
	conversationId?: string;
	agentId?: string;
	agents?: Agent[];
	isGenericAgent?: boolean;
	references?: FileReference[];
}

export type ToolResultEntry = { role: 'tool'; content: string; tool_call_id: string };

export type AssistantWithCalls = Message & {
	tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
	reasoning_content?: string;
};

export type AgentWorkingMessage = Message | ToolResultEntry | AssistantWithCalls;

export interface AgentLoopDependencies {
	app: App;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: (record: { model: string; provider: string; promptTokens: number; completionTokens: number; totalTokens: number; timestamp: number; conversationId?: string }) => Promise<void>;
}

export interface AgentLoopResult {
	message: Message;
	steps: AgentExecutionStep[];
	sense: AgentSenseContext;
}
```

- [x] **Step 4: Export agent runtime types**

Create `src/application/agents/index.ts`:

```ts
export * from './types';
```

- [x] **Step 5: Add SPAR phase metadata to trace steps**

Modify `src/types/common/reasoning.ts`:

```ts
export interface AgentExecutionStep {
	type: 'thought' | 'action' | 'observation' | 'response';
	content: string;
	timestamp: number;
	status?: 'pending' | 'success' | 'error';
	phase?: 'sense' | 'plan' | 'act' | 'reflect' | 'final';
	toolName?: string;
	args?: Record<string, unknown>;
	result?: string;
	thinking?: string;
}
```

- [x] **Step 6: Verify the type scaffold passes**

Run:

```bash
npm test -- src/__tests__/application/agents/history-compactor.test.ts --runInBand
npm run type-check
```

Expected: PASS for the test and type-check.

- [x] **Step 7: Commit**

```bash
git add src/application/agents/types.ts src/application/agents/index.ts src/types/common/reasoning.ts src/__tests__/application/agents/history-compactor.test.ts
git commit -m "feat: add trinity agent runtime types"
```

---

### Task 2: Vault-Aware Sense Service

**Files:**
- Create: `src/application/agents/agent-sense-service.ts`
- Modify: `src/application/agents/index.ts`
- Test: `src/__tests__/application/agents/agent-sense-service.test.ts`

- [x] **Step 1: Write failing Sense tests**

Create `src/__tests__/application/agents/agent-sense-service.test.ts`:

```ts
import { TFile } from 'obsidian';
import { AgentSenseService } from '@/application/agents';

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split('/').pop() ?? path;
	file.basename = file.name.replace(/\.md$/, '');
	file.extension = 'md';
	return file;
}

describe('AgentSenseService', () => {
	it('collects active note, graph neighbors, explicit references, RAG, and memory', async () => {
		const active = makeFile('Projects/AI.md');
		const neighbor = makeFile('Research/RAG.md');
		const reference = { type: 'file' as const, path: 'Inbox/Question.md', name: 'Question.md' };

		const app = {
			workspace: { getActiveFile: jest.fn(() => active) },
			vault: {
				getAbstractFileByPath: jest.fn((path: string) => path === neighbor.path ? neighbor : path === active.path ? active : makeFile(path)),
				cachedRead: jest.fn(async (file: TFile) => `# ${file.basename}\n\ncontent for ${file.path}`),
				read: jest.fn(async (file: TFile) => `# ${file.basename}\n\ncontent for ${file.path}`),
				getMarkdownFiles: jest.fn(() => [active, neighbor]),
			},
			metadataCache: {
				getFileCache: jest.fn((file: TFile) => file.path === active.path
					? { links: [{ link: 'Research/RAG.md' }], tags: [{ tag: '#agent' }] }
					: {}),
				resolvedLinks: {
					'Research/RAG.md': { 'Projects/AI.md': 1 },
				},
			},
		} as any;

		const ragManager = {
			query: jest.fn(async () => [{
				chunk: { content: 'retrieved context', metadata: { path: 'Research/RAG.md', title: 'RAG' } },
				similarity: 0.92,
			}]),
		} as any;

		const memoryService = {
			getSnapshot: jest.fn(async () => ({
				agentId: 'agent-1',
				workingNotes: ['Use short answers'],
				researchLog: 'Previous investigation',
				preferences: { citationStyle: 'wikilinks' },
				updatedAt: 100,
			})),
		};

		const service = new AgentSenseService(app, ragManager, memoryService as any);
		const context = await service.sense({
			userQuery: 'organize this project',
			model: 'gpt-4o',
			defaultModel: 'gpt-4o',
			enableRAG: true,
			agentId: 'agent-1',
			references: [reference],
		});

		expect(context.activeFilePath).toBe('Projects/AI.md');
		expect(context.sections.map(s => s.source)).toEqual(expect.arrayContaining(['active-note', 'graph-neighbor', 'reference', 'rag', 'memory']));
		expect(context.ragSources[0].path).toBe('Research/RAG.md');
		expect(context.memory?.researchLog).toContain('Previous investigation');
	});
});
```

- [x] **Step 2: Run failing Sense tests**

Run:

```bash
npm test -- src/__tests__/application/agents/agent-sense-service.test.ts --runInBand
```

Expected: FAIL with `AgentSenseService` missing.

- [x] **Step 3: Implement Sense service**

Create `src/application/agents/agent-sense-service.ts`:

```ts
import type { App, TAbstractFile } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import type { FileReference, RAGSource } from '@/types';
import type { RAGManager } from '@/infrastructure/rag-manager';
import { buildObsidianContextSnapshot } from '@/application/services/obsidian-context-builder';
import type { AgentMemoryService } from '@/application/services/agent-memory-service';
import type { AgentContextSection, AgentSenseContext } from './types';

interface SenseInput {
	userQuery: string;
	model: string;
	defaultModel?: string;
	enableRAG?: boolean;
	agentId?: string;
	references?: FileReference[];
}

type AppWithResolvedLinks = App & {
	metadataCache: App['metadataCache'] & {
		resolvedLinks?: Record<string, Record<string, number>>;
	};
};

const MAX_GRAPH_NEIGHBORS = 8;

export class AgentSenseService {
	constructor(
		private readonly app: App,
		private readonly ragManager: RAGManager,
		private readonly memoryService?: Pick<AgentMemoryService, 'getSnapshot'>,
	) {}

	async sense(input: SenseInput): Promise<AgentSenseContext> {
		const sections: AgentContextSection[] = [];
		const activeFile = this.app.workspace.getActiveFile();
		const references = input.references ?? [];

		if (activeFile instanceof TFile) {
			const activeSnapshot = await buildObsidianContextSnapshot(this.app, [activeFile], { maxFileChars: 12000 });
			if (activeSnapshot.trim()) {
				sections.push({ title: 'Active note', content: activeSnapshot, source: 'active-note', path: activeFile.path });
			}

			const graphNeighbors = this.getGraphNeighbors(activeFile);
			if (graphNeighbors.length > 0) {
				const graphSnapshot = await buildObsidianContextSnapshot(this.app, graphNeighbors, { maxFileChars: 4000 });
				if (graphSnapshot.trim()) {
					sections.push({ title: 'Graph neighbors', content: graphSnapshot, source: 'graph-neighbor' });
				}
			}
		}

		const referenceFiles = this.resolveReferences(references);
		if (referenceFiles.length > 0) {
			const referenceSnapshot = await buildObsidianContextSnapshot(this.app, referenceFiles, { maxFileChars: 8000 });
			if (referenceSnapshot.trim()) {
				sections.push({ title: 'Explicit references', content: referenceSnapshot, source: 'reference' });
			}
		}

		const ragSources = await this.queryRag(input);
		if (ragSources.length > 0) {
			sections.push({
				title: 'RAG context',
				content: ragSources.map(source => `Document: ${source.path}\nContent: ${source.content}`).join('\n\n'),
				source: 'rag',
			});
		}

		const memory = input.agentId && this.memoryService
			? await this.memoryService.getSnapshot(input.agentId)
			: null;
		if (memory) {
			sections.push({
				title: 'Agent memory',
				content: [
					`Research Log:\n${memory.researchLog || '(empty)'}`,
					`Working Notes:\n${memory.workingNotes.map(note => `- ${note}`).join('\n') || '(empty)'}`,
					`Preferences:\n${Object.entries(memory.preferences).map(([key, value]) => `- ${key}: ${value}`).join('\n') || '(empty)'}`,
				].join('\n\n'),
				source: 'memory',
			});
		}

		return {
			userQuery: input.userQuery,
			activeFilePath: activeFile instanceof TFile ? activeFile.path : null,
			references,
			sections,
			ragSources,
			memory,
		};
	}

	formatSenseContext(context: AgentSenseContext): string {
		if (context.sections.length === 0) {
			return 'No Obsidian context was available for this request.';
		}
		return [
			'## Vault-Aware Sense Context',
			`User request: ${context.userQuery}`,
			context.activeFilePath ? `Active file: [[${context.activeFilePath}]]` : 'Active file: none',
			'',
			...context.sections.map(section => `### ${section.title}\n${section.content}`),
		].join('\n');
	}

	private async queryRag(input: SenseInput): Promise<RAGSource[]> {
		if (!input.enableRAG) return [];
		const results = await this.ragManager.query(input.userQuery, input.model, input.defaultModel);
		return results.map(result => ({
			path: result.chunk.metadata.path,
			content: result.chunk.content,
			similarity: result.similarity,
			title: result.chunk.metadata.title,
		}));
	}

	private resolveReferences(references: FileReference[]): Array<TFile | TFolder> {
		const resolved: Array<TFile | TFolder> = [];
		for (const reference of references) {
			const file = this.app.vault.getAbstractFileByPath(reference.path);
			if (file instanceof TFile || file instanceof TFolder) {
				resolved.push(file);
			}
		}
		return resolved;
	}

	private getGraphNeighbors(file: TFile): TFile[] {
		const app = this.app as AppWithResolvedLinks;
		const cache = app.metadataCache.getFileCache(file);
		const outgoing = (cache?.links ?? [])
			.map(link => link.link ?? '')
			.filter(Boolean);
		const backlinks = Object.entries(app.metadataCache.resolvedLinks ?? {})
			.filter(([, targets]) => Boolean(targets[file.path]))
			.map(([sourcePath]) => sourcePath);

		const paths = Array.from(new Set([...outgoing, ...backlinks])).slice(0, MAX_GRAPH_NEIGHBORS);
		return paths
			.map(path => this.app.vault.getAbstractFileByPath(path))
			.filter((candidate: TAbstractFile | null): candidate is TFile => candidate instanceof TFile);
	}
}
```

- [x] **Step 4: Export Sense service**

Modify `src/application/agents/index.ts`:

```ts
export * from './types';
export * from './agent-sense-service';
```

- [x] **Step 5: Verify Sense service**

Run:

```bash
npm test -- src/__tests__/application/agents/agent-sense-service.test.ts src/__tests__/application/obsidian-context-builder.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/application/agents/agent-sense-service.ts src/application/agents/index.ts src/__tests__/application/agents/agent-sense-service.test.ts
git commit -m "feat: add vault-aware agent sense service"
```

---

### Task 3: Agent Memory And History Compaction

**Files:**
- Create: `src/infrastructure/persistence/data/agent-memory-repository.ts`
- Create: `src/application/services/agent-memory-service.ts`
- Create: `src/application/agents/history-compactor.ts`
- Modify: `src/constants.ts`
- Modify: `src/infrastructure/persistence/data/index.ts`
- Modify: `src/application/services/plugin-data-service.ts`
- Modify: `src/application/agents/index.ts`
- Test: `src/__tests__/application/agent-memory-service.test.ts`
- Test: `src/__tests__/application/agents/history-compactor.test.ts`

- [x] **Step 1: Replace the scaffold test with compaction tests**

Replace `src/__tests__/application/agents/history-compactor.test.ts`:

```ts
import { HistoryCompactor } from '@/application/agents';
import type { AgentWorkingMessage } from '@/application/agents';

describe('HistoryCompactor', () => {
	it('keeps short histories unchanged', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 10000 });
		const messages: AgentWorkingMessage[] = [
			{ role: 'user', content: 'small request' },
			{ role: 'assistant', content: 'small answer' },
		];

		const result = compactor.compact(messages);

		expect(result.compacted).toBe(false);
		expect(result.messages).toEqual(messages);
	});

	it('replaces middle tool history with a Research Log block', () => {
		const compactor = new HistoryCompactor({ maxEstimatedTokens: 20, keepLastMessages: 2 });
		const messages: AgentWorkingMessage[] = [
			{ role: 'system', content: 'base system' },
			{ role: 'user', content: 'first question with many many many words' },
			{ role: 'assistant', content: 'tool analysis with many many many words' },
			{ role: 'tool', tool_call_id: 'call-1', content: 'tool output with many many many words' },
			{ role: 'assistant', content: 'latest thought' },
			{ role: 'user', content: 'latest request' },
		];

		const result = compactor.compact(messages);

		expect(result.compacted).toBe(true);
		expect(result.messages.some(message => message.content.includes('Research Log'))).toBe(true);
		expect(result.messages.at(-1)?.content).toBe('latest request');
		expect(result.summary).toContain('first question');
	});
});
```

- [x] **Step 2: Write memory service tests**

Create `src/__tests__/application/agent-memory-service.test.ts`:

```ts
import { AgentMemoryService } from '@/application/services/agent-memory-service';

describe('AgentMemoryService', () => {
	it('creates empty memory for an unknown agent and persists research log updates', async () => {
		const repository = {
			load: jest.fn(async () => ({ version: 1, updatedAt: 0, agents: {} })),
			save: jest.fn(async () => undefined),
		};
		const service = new AgentMemoryService(repository);

		const initial = await service.getSnapshot('agent-1');
		expect(initial.agentId).toBe('agent-1');
		expect(initial.researchLog).toBe('');

		await service.appendResearchLog('agent-1', 'Inspected Projects/AI.md');

		expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
			agents: expect.objectContaining({
				'agent-1': expect.objectContaining({
					researchLog: 'Inspected Projects/AI.md',
				}),
			}),
		}));
	});

	it('stores user preferences as key value memory', async () => {
		const repository = {
			load: jest.fn(async () => ({ version: 1, updatedAt: 0, agents: {} })),
			save: jest.fn(async () => undefined),
		};
		const service = new AgentMemoryService(repository);

		await service.setPreference('agent-1', 'citationStyle', 'wikilinks');
		const snapshot = await service.getSnapshot('agent-1');

		expect(snapshot.preferences.citationStyle).toBe('wikilinks');
	});
});
```

- [x] **Step 3: Run failing tests**

Run:

```bash
npm test -- src/__tests__/application/agents/history-compactor.test.ts src/__tests__/application/agent-memory-service.test.ts --runInBand
```

Expected: FAIL with missing `HistoryCompactor` and `AgentMemoryService`.

- [x] **Step 4: Add memory constants**

Modify `src/constants.ts`:

```ts
export const AGENT_MEMORY_DATA_FOLDER = `${DATA_FOLDER}/agent-memory`;
export const AGENT_MEMORY_PATH = `${AGENT_MEMORY_DATA_FOLDER}/memory.json`;
```

Also add these keys to the object returned by `getPluginPaths(configDir: string)`:

```ts
AGENT_MEMORY_DATA_FOLDER: `${dataFolder}/agent-memory`,
AGENT_MEMORY_PATH: `${dataFolder}/agent-memory/memory.json`,
```

- [x] **Step 5: Implement memory repository**

Create `src/infrastructure/persistence/data/agent-memory-repository.ts`:

```ts
import { App } from 'obsidian';
import { AGENT_MEMORY_DATA_FOLDER, AGENT_MEMORY_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';
import type { AgentMemorySnapshot } from '@/application/agents';

export interface AgentMemoryFile {
	version: 1;
	updatedAt: number;
	agents: Record<string, AgentMemorySnapshot>;
}

export class AgentMemoryRepository {
	private initialized = false;

	constructor(private readonly app: App, private readonly filePath = AGENT_MEMORY_PATH) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.app.vault.adapter, AGENT_MEMORY_DATA_FOLDER);
		if (!(await this.app.vault.adapter.exists(this.filePath))) {
			await this.save({ version: 1, updatedAt: Date.now(), agents: {} });
		}
		this.initialized = true;
	}

	async load(): Promise<AgentMemoryFile> {
		await this.initialize();
		try {
			const raw = await this.app.vault.adapter.read(this.filePath);
			const parsed = JSON.parse(raw) as AgentMemoryFile;
			return {
				version: 1,
				updatedAt: parsed.updatedAt ?? 0,
				agents: parsed.agents ?? {},
			};
		} catch {
			return { version: 1, updatedAt: 0, agents: {} };
		}
	}

	async save(file: AgentMemoryFile): Promise<void> {
		await this.initialize();
		await this.app.vault.adapter.write(
			this.filePath,
			JSON.stringify({ ...file, updatedAt: Date.now() }, null, 2),
		);
	}
}
```

- [x] **Step 6: Implement memory service**

Create `src/application/services/agent-memory-service.ts`:

```ts
import type { AgentMemorySnapshot } from '@/application/agents';
import type { AgentMemoryFile, AgentMemoryRepository } from '@/infrastructure/persistence';

function emptySnapshot(agentId: string): AgentMemorySnapshot {
	return {
		agentId,
		workingNotes: [],
		researchLog: '',
		preferences: {},
		updatedAt: Date.now(),
	};
}

export class AgentMemoryService {
	private cache: AgentMemoryFile | null = null;

	constructor(private readonly repository: Pick<AgentMemoryRepository, 'load' | 'save'>) {}

	async getSnapshot(agentId: string): Promise<AgentMemorySnapshot> {
		const file = await this.getFile();
		const existing = file.agents[agentId];
		return existing ? { ...existing, preferences: { ...existing.preferences }, workingNotes: [...existing.workingNotes] } : emptySnapshot(agentId);
	}

	async appendResearchLog(agentId: string, entry: string): Promise<void> {
		const file = await this.getFile();
		const snapshot = file.agents[agentId] ?? emptySnapshot(agentId);
		const nextLog = [snapshot.researchLog.trim(), entry.trim()].filter(Boolean).join('\n');
		file.agents[agentId] = { ...snapshot, researchLog: nextLog, updatedAt: Date.now() };
		await this.save(file);
	}

	async setPreference(agentId: string, key: string, value: string): Promise<void> {
		const file = await this.getFile();
		const snapshot = file.agents[agentId] ?? emptySnapshot(agentId);
		file.agents[agentId] = {
			...snapshot,
			preferences: { ...snapshot.preferences, [key]: value },
			updatedAt: Date.now(),
		};
		await this.save(file);
	}

	private async getFile(): Promise<AgentMemoryFile> {
		if (!this.cache) {
			this.cache = await this.repository.load();
		}
		return this.cache;
	}

	private async save(file: AgentMemoryFile): Promise<void> {
		this.cache = file;
		await this.repository.save(file);
	}
}
```

- [x] **Step 7: Implement history compactor**

Create `src/application/agents/history-compactor.ts`:

```ts
import type { AgentWorkingMessage } from './types';

interface HistoryCompactorOptions {
	maxEstimatedTokens?: number;
	keepLastMessages?: number;
}

interface CompactionResult {
	messages: AgentWorkingMessage[];
	compacted: boolean;
	summary: string;
}

const DEFAULT_MAX_ESTIMATED_TOKENS = 10000;
const DEFAULT_KEEP_LAST_MESSAGES = 8;

export class HistoryCompactor {
	constructor(private readonly options: HistoryCompactorOptions = {}) {}

	compact(messages: AgentWorkingMessage[]): CompactionResult {
		const maxEstimatedTokens = this.options.maxEstimatedTokens ?? DEFAULT_MAX_ESTIMATED_TOKENS;
		const estimated = this.estimateMessages(messages);
		if (estimated <= maxEstimatedTokens) {
			return { messages, compacted: false, summary: '' };
		}

		const keepLast = this.options.keepLastMessages ?? DEFAULT_KEEP_LAST_MESSAGES;
		const systemMessages = messages.filter(message => message.role === 'system');
		const tail = messages.slice(-keepLast);
		const middleStart = systemMessages.length;
		const middleEnd = Math.max(middleStart, messages.length - keepLast);
		const middle = messages.slice(middleStart, middleEnd);
		const summary = this.buildResearchLog(middle);

		return {
			messages: [
				...systemMessages,
				{ role: 'system', content: `Research Log:\n${summary}` },
				...tail,
			],
			compacted: true,
			summary,
		};
	}

	estimateMessages(messages: AgentWorkingMessage[]): number {
		return messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0);
	}

	private buildResearchLog(messages: AgentWorkingMessage[]): string {
		return messages
			.map((message, index) => {
				const compactContent = message.content.replace(/\s+/g, ' ').trim().slice(0, 240);
				return `${index + 1}. ${message.role}: ${compactContent}`;
			})
			.filter(line => line.trim().length > 0)
			.join('\n');
	}
}
```

- [x] **Step 8: Export memory and compactor**

Modify `src/infrastructure/persistence/data/index.ts`:

```ts
export * from './agent-memory-repository';
```

Modify `src/application/agents/index.ts`:

```ts
export * from './types';
export * from './agent-sense-service';
export * from './history-compactor';
```

Modify `src/application/services/index.ts`:

```ts
export * from './agent-memory-service';
```

- [x] **Step 9: Wire repository into PluginDataService**

Modify `src/application/services/plugin-data-service.ts` imports:

```ts
import {
	AgentRepository,
	PromptRepository,
	ModelCacheRepository,
	ProviderRepository,
	McpServerRepository,
	McpToolCacheRepository,
	TokenUsageRepository,
	AgentMemoryRepository,
} from '@/infrastructure/persistence';
```

Add a public field:

```ts
public agentMemoryRepo!: AgentMemoryRepository;
```

Initialize it in `initialize()`:

```ts
this.agentMemoryRepo = new AgentMemoryRepository(this.app);
```

Add it to the initialization `Promise.all`:

```ts
this.agentMemoryRepo.initialize(),
```

- [x] **Step 10: Verify memory and compaction**

Run:

```bash
npm test -- src/__tests__/application/agents/history-compactor.test.ts src/__tests__/application/agent-memory-service.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 11: Commit**

```bash
git add src/constants.ts src/infrastructure/persistence/data/agent-memory-repository.ts src/infrastructure/persistence/data/index.ts src/application/services/agent-memory-service.ts src/application/services/plugin-data-service.ts src/application/services/index.ts src/application/agents/history-compactor.ts src/application/agents/index.ts src/__tests__/application/agents/history-compactor.test.ts src/__tests__/application/agent-memory-service.test.ts
git commit -m "feat: add agent memory and history compaction"
```

---

### Task 4: Autonomous Agent Loop

**Files:**
- Create: `src/application/agents/autonomous-agent-loop.ts`
- Modify: `src/application/agents/index.ts`
- Test: `src/__tests__/application/agents/autonomous-agent-loop.test.ts`

- [x] **Step 1: Write failing loop tests**

Create `src/__tests__/application/agents/autonomous-agent-loop.test.ts`:

```ts
import { AutonomousAgentLoop, HistoryCompactor } from '@/application/agents';
import type { Message } from '@/types';

describe('AutonomousAgentLoop', () => {
	it('injects sense context and completes when no tools are requested', async () => {
		const provider = {
			streamChat: jest.fn(async (_request, onChunk) => {
				onChunk({ content: 'final answer' });
				onChunk({ usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 } });
			}),
		};
		const senseService = {
			sense: jest.fn(async () => ({
				userQuery: 'summarize',
				activeFilePath: 'A.md',
				references: [],
				sections: [{ title: 'Active note', content: 'note content', source: 'active-note' }],
				ragSources: [],
				memory: null,
			})),
			formatSenseContext: jest.fn(() => '## Vault-Aware Sense Context\nnote content'),
		};
		const registry = {
			resolveForAgent: jest.fn(() => []),
			toOpenAIFunctions: jest.fn(() => []),
			executeTool: jest.fn(),
		};
		const loop = new AutonomousAgentLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		const completed: Message[] = [];
		await loop.execute(
			[{ role: 'user', content: 'summarize' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult: jest.fn(),
				onThought: jest.fn(),
				onComplete: message => completed.push(message),
				onError: error => { throw error; },
			},
		);

		expect(senseService.sense).toHaveBeenCalled();
		expect(provider.streamChat.mock.calls[0][0].messages[0].content).toContain('Vault-Aware Sense Context');
		expect(completed[0].content).toBe('final answer');
	});

	it('executes a native tool call and appends a tool result message', async () => {
		const provider = {
			streamChat: jest.fn()
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({
						toolCalls: [{
							id: 'call-1',
							function: { name: 'read_file', arguments: JSON.stringify({ path: 'A.md' }) },
						}],
					});
				})
				.mockImplementationOnce(async (_request, onChunk) => {
					onChunk({ content: 'I read A.md' });
				}),
		};
		const registry = {
			resolveForAgent: jest.fn(() => [{ llmName: 'read_file', toolId: 'builtin:builtin:read_file', definition: { description: 'Read file' } }]),
			toOpenAIFunctions: jest.fn(() => [{ type: 'function', function: { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } } }]),
			executeTool: jest.fn(async () => ({ success: true, result: 'file contents' })),
		};
		const senseService = {
			sense: jest.fn(async () => ({ userQuery: 'read', activeFilePath: null, references: [], sections: [], ragSources: [], memory: null })),
			formatSenseContext: jest.fn(() => 'sense context'),
		};
		const onToolResult = jest.fn();
		const loop = new AutonomousAgentLoop({
			toolRegistry: registry as any,
			senseService: senseService as any,
			historyCompactor: new HistoryCompactor(),
			webSearchService: { search: jest.fn(), formatResultsAsContext: jest.fn() } as any,
			createProvider: jest.fn(() => ({ provider: provider as any, providerId: 'openai' })),
		});

		await loop.execute(
			[{ role: 'user', content: 'read A.md' }],
			{ model: 'gpt-4o', mode: 'agent', agentId: 'agent-1', agents: [{ id: 'agent-1', maxSteps: 3, contextWindow: 20, toolAccess: { sources: { 'builtin:builtin': 'all' } } } as any] },
			{
				onChunk: jest.fn(),
				onToolCall: jest.fn(),
				onToolResult,
				onThought: jest.fn(),
				onComplete: jest.fn(),
				onError: error => { throw error; },
			},
		);

		expect(registry.executeTool).toHaveBeenCalledWith('read_file', { path: 'A.md' });
		expect(onToolResult).toHaveBeenCalledWith('read_file', true, JSON.stringify('file contents'), 'act');
		expect(provider.streamChat).toHaveBeenCalledTimes(2);
	});
});
```

- [x] **Step 2: Run failing loop tests**

Run:

```bash
npm test -- src/__tests__/application/agents/autonomous-agent-loop.test.ts --runInBand
```

Expected: FAIL with missing `AutonomousAgentLoop`.

- [x] **Step 3: Implement `AutonomousAgentLoop`**

Create `src/application/agents/autonomous-agent-loop.ts` with the extracted loop:

```ts
import type { Message, RAGSource, WebSearchResult, Agent } from '@/types';
import type { ToolRegistry } from '@/application/tools/tool-registry';
import type { WebSearchService } from '@/application/services/web-search-service';
import type { StreamChunk, ILLMProvider } from '@/types/common/llm';
import { deduplicateMessages } from '@/application/services/chat.service';
import type { AgentLoopCallbacks, AgentLoopOptions, AgentWorkingMessage, AssistantWithCalls, ToolResultEntry } from './types';
import { HistoryCompactor } from './history-compactor';
import type { AgentSenseService } from './agent-sense-service';

interface AutonomousAgentLoopDeps {
	toolRegistry: ToolRegistry;
	senseService: AgentSenseService;
	historyCompactor: HistoryCompactor;
	webSearchService: WebSearchService;
	createProvider: (modelId: string) => { provider: ILLMProvider; providerId: string } | null;
	recordUsage?: (record: { model: string; provider: string; promptTokens: number; completionTokens: number; totalTokens: number; timestamp: number; conversationId?: string }) => Promise<void>;
	defaultModel?: string;
}

const MAX_CONSECUTIVE_FAILURES = 3;

export class AutonomousAgentLoop {
	constructor(private readonly deps: AutonomousAgentLoopDeps) {}

	async execute(messages: Message[], options: AgentLoopOptions, callbacks: AgentLoopCallbacks): Promise<void> {
		try {
			const providerBundle = this.deps.createProvider(options.model);
			if (!providerBundle) {
				callbacks.onError(new Error(`No provider configuration found for model: ${options.model}`));
				return;
			}

			const activeAgent = this.getActiveAgent(options);
			const contextWindow = options.contextWindow ?? activeAgent?.contextWindow ?? 20;
			const maxSteps = activeAgent?.maxSteps ?? 10;
			const userQuery = messages[messages.length - 1]?.content ?? '';
			const sense = await this.deps.senseService.sense({
				userQuery,
				model: options.model,
				defaultModel: this.deps.defaultModel,
				enableRAG: options.enableRAG,
				agentId: activeAgent?.id,
				references: options.references,
			});

			callbacks.onThought('Sensed active note, graph neighbors, references, RAG context, and memory.', 'sense');

			const ragSources: RAGSource[] = [...sense.ragSources];
			const webResults = await this.loadWebResults(userQuery, options);
			const baseSystemMessages = this.buildBaseSystemMessages(options, activeAgent, this.deps.senseService.formatSenseContext(sense), webResults);
			const workingMessages: AgentWorkingMessage[] = [...messages];
			const resolvedTools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
			const nativeTools = this.deps.toolRegistry.toOpenAIFunctions(resolvedTools);
			const consecutiveFailures = new Map<string, number>();
			let lastContent = '';
			let lastReasoning = '';
			let lastStepUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;

			for (let step = 0; step < maxSteps; step++) {
				if (callbacks.checkAbort?.()) break;

				callbacks.onThought(`Planning step ${step + 1}.`, 'plan');
				const compacted = this.deps.historyCompactor.compact(workingMessages);
				const deduped = deduplicateMessages(compacted.messages as Message[]);
				const truncated = deduped.length > contextWindow ? deduped.slice(-contextWindow) : deduped;
				const allMessages = [...baseSystemMessages, ...truncated];
				const pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
				const stepCapture: { usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null } = { usage: null };

				lastContent = '';
				lastReasoning = '';
				await providerBundle.provider.streamChat(
					{
						messages: allMessages,
						model: options.model,
						temperature: options.temperature,
						maxTokens: options.maxTokens,
						topP: options.topP,
						frequencyPenalty: options.frequencyPenalty,
						presencePenalty: options.presencePenalty,
						tools: nativeTools.length > 0 ? nativeTools : undefined,
						toolChoice: nativeTools.length > 0 ? 'auto' : undefined,
					},
					(chunk: StreamChunk) => {
						if (callbacks.checkAbort?.()) return;
						if (chunk.content) {
							lastContent += chunk.content;
							callbacks.onChunk(chunk);
						}
						if (chunk.reasoning) lastReasoning += chunk.reasoning;
						if (chunk.usage) stepCapture.usage = chunk.usage;
						if (chunk.toolCalls) {
							for (const toolCall of chunk.toolCalls) {
								pendingToolCalls.push({
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: this.parseToolArguments(toolCall.function.arguments),
								});
							}
						}
					},
				);

				lastStepUsage = stepCapture.usage;
				if (lastStepUsage && this.deps.recordUsage) {
					void this.deps.recordUsage({
						model: options.model,
						provider: providerBundle.providerId,
						promptTokens: lastStepUsage.promptTokens,
						completionTokens: lastStepUsage.completionTokens,
						totalTokens: lastStepUsage.totalTokens,
						timestamp: Date.now(),
						conversationId: options.conversationId,
					});
				}

				if (pendingToolCalls.length === 0) break;

				workingMessages.push(this.createAssistantWithCalls(options.model, lastContent, lastReasoning, pendingToolCalls));
				for (const result of await this.executeTools(pendingToolCalls, resolvedTools, consecutiveFailures, callbacks)) {
					workingMessages.push(result);
				}
				callbacks.onThought(`Reflected on ${pendingToolCalls.length} tool result(s).`, 'reflect');
			}

			callbacks.onComplete({
				role: 'assistant',
				content: lastContent,
				model: options.model,
				ragSources: ragSources.length > 0 ? ragSources : undefined,
				webSearchResults: webResults.length > 0 ? webResults : undefined,
				tokenUsage: lastStepUsage ?? undefined,
			});
		} catch (error) {
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private getActiveAgent(options: AgentLoopOptions): Agent | undefined {
		return options.agentId ? (options.agents ?? []).find(agent => agent.id === options.agentId) : undefined;
	}

	private buildBaseSystemMessages(options: AgentLoopOptions, activeAgent: Agent | undefined, senseContext: string, webResults: WebSearchResult[]): Message[] {
		const messages: Message[] = [
			...(options.activeSystemPrompts ?? []),
			{ role: 'system', content: this.buildAgentInstruction(options.isGenericAgent ?? !options.agentId, activeAgent) },
			{ role: 'system', content: senseContext },
		];
		if (webResults.length > 0) {
			messages.push({ role: 'system', content: this.deps.webSearchService.formatResultsAsContext(webResults) });
		}
		return messages;
	}

	private buildAgentInstruction(isGenericAgent: boolean, activeAgent: Agent | undefined): string {
		const tools = this.deps.toolRegistry.resolveForAgent(activeAgent?.toolAccess ?? { sources: {} });
		const toolDescriptions = tools.map(tool => `- ${tool.llmName}: ${tool.definition.description}`).join('\n');
		const agentName = isGenericAgent ? 'the default Obsidian knowledge agent' : `Agent "${activeAgent?.name ?? 'unknown'}"`;
		return [
			`You are ${agentName}.`,
			'Run a Sense-Plan-Act-Reflect loop for Obsidian knowledge work.',
			'Use vault context before external context.',
			'Never claim a vault write was applied unless the user approved a write proposal.',
			toolDescriptions ? `Available tools:\n${toolDescriptions}` : 'No tools are enabled for this agent.',
		].join('\n\n');
	}

	private async loadWebResults(userQuery: string, options: AgentLoopOptions): Promise<WebSearchResult[]> {
		if (!options.enableWebSearch) return [];
		return await this.deps.webSearchService.search(userQuery);
	}

	private parseToolArguments(raw: string): Record<string, unknown> {
		try {
			const parsed = JSON.parse(raw) as unknown;
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}

	private createAssistantWithCalls(
		model: string,
		content: string,
		reasoning: string,
		pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
	): AssistantWithCalls {
		return {
			role: 'assistant',
			content,
			model,
			tool_calls: pendingToolCalls.map(toolCall => ({
				id: toolCall.id,
				type: 'function' as const,
				function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
			})),
			reasoning_content: reasoning || undefined,
		};
	}

	private async executeTools(
		pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
		resolvedTools: Array<{ llmName: string }>,
		consecutiveFailures: Map<string, number>,
		callbacks: AgentLoopCallbacks,
	): Promise<ToolResultEntry[]> {
		const entries: ToolResultEntry[] = [];
		for (const toolCall of pendingToolCalls) {
			callbacks.onToolCall(toolCall.name, toolCall.arguments, undefined, 'act');
			const isAllowed = resolvedTools.some(tool => tool.llmName === toolCall.name);
			const result = isAllowed
				? await this.deps.toolRegistry.executeTool(toolCall.name, toolCall.arguments)
				: { success: false, error: `Tool "${toolCall.name}" is not enabled for this agent` };

			if (result.success) {
				consecutiveFailures.delete(toolCall.name);
			} else {
				const failures = (consecutiveFailures.get(toolCall.name) ?? 0) + 1;
				consecutiveFailures.set(toolCall.name, failures);
				if (failures >= MAX_CONSECUTIVE_FAILURES) {
					throw new Error(`Tool "${toolCall.name}" failed ${failures} consecutive times.`);
				}
			}

			const output = result.success ? JSON.stringify(result.result) : `Tool "${toolCall.name}" failed: ${result.error ?? 'Unknown error'}`;
			callbacks.onToolResult(toolCall.name, result.success, output, 'act');
			entries.push({ role: 'tool', content: output, tool_call_id: toolCall.id });
		}
		return entries;
	}
}
```

- [x] **Step 4: Export loop**

Modify `src/application/agents/index.ts`:

```ts
export * from './types';
export * from './agent-sense-service';
export * from './history-compactor';
export * from './autonomous-agent-loop';
```

- [x] **Step 5: Verify autonomous loop**

Run:

```bash
npm test -- src/__tests__/application/agents/autonomous-agent-loop.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/application/agents/autonomous-agent-loop.ts src/application/agents/index.ts src/__tests__/application/agents/autonomous-agent-loop.test.ts
git commit -m "feat: extract autonomous agent loop"
```

---

### Task 5: Wire Trinity Loop Into Chat

**Files:**
- Modify: `src/application/services/chat.service.ts`
- Modify: `src/presentation/views/chat-view.ts`
- Modify: `src/presentation/components/chat/controllers/chat-controller.ts`
- Test: `src/__tests__/application/chat-service-streaming.test.ts`
- Test: `src/__tests__/presentation/chat-controller-message.test.ts`

- [x] **Step 1: Add a ChatService delegation test**

Append to `src/__tests__/application/chat-service-streaming.test.ts`:

```ts
describe('ChatService agent delegation', () => {
	it('delegates executeAgentLoop to AutonomousAgentLoop when one is configured', async () => {
		const loop = { execute: jest.fn(async () => undefined) };
		const service = new ChatService(
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			[],
			undefined,
			'gpt-4o',
			loop as any,
		);
		const callbacks = {
			onChunk: jest.fn(),
			onToolCall: jest.fn(),
			onToolResult: jest.fn(),
			onThought: jest.fn(),
			onComplete: jest.fn(),
			onError: jest.fn(),
		};

		await service.executeAgentLoop(
			[{ role: 'user', content: 'hello' }],
			{ model: 'gpt-4o', mode: 'agent', references: [{ type: 'file', path: 'A.md', name: 'A.md' }] } as any,
			callbacks,
		);

		expect(loop.execute).toHaveBeenCalledWith(
			[{ role: 'user', content: 'hello' }],
			expect.objectContaining({ references: [{ type: 'file', path: 'A.md', name: 'A.md' }] }),
			callbacks,
		);
	});
});
```

- [x] **Step 2: Run failing delegation test**

Run:

```bash
npm test -- src/__tests__/application/chat-service-streaming.test.ts --runInBand
```

Expected: FAIL because the `ChatService` constructor does not accept the loop.

- [x] **Step 3: Modify ChatService constructor and callbacks**

Modify imports in `src/application/services/chat.service.ts`:

```ts
import type { AutonomousAgentLoop, AgentLoopCallbacks } from '@/application/agents';
```

Remove the local `AgentLoopCallbacks` interface from `chat.service.ts`.

Add the optional constructor dependency:

```ts
constructor(
	private fileSystem: IFileSystem,
	private toolRegistry: ToolRegistry,
	private ragManager: RAGManager,
	private webSearchService: WebSearchService,
	private llmConfigs: LLMConfig[],
	private usageRepo?: { recordUsage: (r: {model:string;provider:string;promptTokens:number;completionTokens:number;totalTokens:number;timestamp:number;conversationId?:string}) => Promise<void> },
	private defaultModel?: string,
	private autonomousAgentLoop?: AutonomousAgentLoop,
) {}
```

At the top of `executeAgentLoop`, add:

```ts
if (this.autonomousAgentLoop) {
	await this.autonomousAgentLoop.execute(messages, options, callbacks);
	return;
}
```

Keep the existing loop code below as a rollback path until Task 8 final cleanup.

- [x] **Step 4: Pass references from ChatController into Agent loop**

Modify the `runAgentLoop` call in `src/presentation/components/chat/controllers/chat-controller.ts`:

```ts
await this.runAgentLoop(
	llmMessages,
	selectedModel,
	contextWindow,
	activeSystemPrompts,
	placeholderAssistant,
	assistantMessageEl,
	contentEl,
	targetMessage.references ?? [],
);
```

Modify the private method signature:

```ts
private async runAgentLoop(
	llmMessages: Message[],
	selectedModel: string,
	contextWindow: number,
	activeSystemPrompts: Message[],
	placeholderAssistant: Message,
	assistantMessageEl: HTMLElement,
	contentEl: HTMLElement | null,
	references: FileReference[],
): Promise<void> {
```

Add `references` to `executeAgentLoop` options:

```ts
references,
```

- [x] **Step 5: Construct Trinity dependencies in ChatView**

Modify imports in `src/presentation/views/chat-view.ts`:

```ts
import { AgentSenseService, AutonomousAgentLoop, HistoryCompactor } from '@/application/agents';
import { AgentMemoryService } from '@/application/services/agent-memory-service';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { ModelManager } from '@/infrastructure/llm/model-manager';
```

Before `new ChatService(...)`, create the loop:

```ts
const agentMemoryService = new AgentMemoryService(this.plugin.getAgentMemoryRepository());
const senseService = new AgentSenseService(this.app, this.ragManager, agentMemoryService);
const autonomousAgentLoop = new AutonomousAgentLoop({
	toolRegistry: this.plugin.getToolRegistry(),
	senseService,
	historyCompactor: new HistoryCompactor(),
	webSearchService: this.webSearchService,
	createProvider: (modelId) => {
		const config = ModelManager.findConfigForModelByProvider(modelId, this.plugin.settings.llmConfigs);
		return config ? { provider: ProviderFactory.createProvider(config), providerId: config.provider } : null;
	},
	recordUsage: this.plugin.tokenUsageRepo ? (record) => this.plugin.tokenUsageRepo!.recordUsage(record) : undefined,
	defaultModel: this.plugin.settings.defaultModel,
});
```

Pass it to `ChatService`:

```ts
this.chatService = new ChatService(
	new ObsidianFileSystem(this.app),
	this.plugin.getToolRegistry(),
	this.ragManager,
	this.webSearchService,
	this.plugin.settings.llmConfigs,
	this.plugin.tokenUsageRepo ?? undefined,
	this.plugin.settings.defaultModel,
	autonomousAgentLoop,
);
```

- [x] **Step 6: Expose the memory repository from plugin**

Modify `main.ts`:

```ts
import type { AgentMemoryRepository } from './src/infrastructure/persistence';
```

Add a method to `IntelligenceAssistantPlugin`:

```ts
public getAgentMemoryRepository(): AgentMemoryRepository {
	return this.dataService.agentMemoryRepo;
}
```

- [x] **Step 7: Preserve SPAR phase in UI trace callbacks**

Modify `src/presentation/components/chat/controllers/chat-controller.ts` callback implementations:

```ts
onToolCall: (toolName, args, thinking, phase) => {
	this.state.agentExecutionSteps.push({
		type: 'action',
		content: `${toolName}(${JSON.stringify(args)})`,
		toolName,
		args,
		thinking: thinking || undefined,
		phase,
		timestamp: Date.now(),
		status: 'pending',
	});
},
onToolResult: (_toolName, success, output, phase) => {
	const lastAction = [...this.state.agentExecutionSteps].reverse().find(s => s.type === 'action' && s.status === 'pending');
	if (lastAction) {
		lastAction.status = success ? 'success' : 'error';
		lastAction.result = output;
		lastAction.phase = lastAction.phase ?? phase;
	}
},
onThought: (thought, phase) => {
	this.state.agentExecutionSteps.push({
		type: 'thought',
		content: thought,
		phase,
		timestamp: Date.now(),
	});
},
```

- [x] **Step 8: Verify chat wiring**

Run:

```bash
npm test -- src/__tests__/application/chat-service-streaming.test.ts src/__tests__/presentation/chat-controller-message.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add main.ts src/application/services/chat.service.ts src/presentation/views/chat-view.ts src/presentation/components/chat/controllers/chat-controller.ts src/__tests__/application/chat-service-streaming.test.ts
git commit -m "feat: wire trinity loop into agent chat"
```

---

### Task 6: Zod Tool Schemas And Proposal-First Enforcement

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/application/tools/tool-schema.ts`
- Modify: `src/types/common/tools.ts`
- Modify: `src/application/services/types.ts`
- Modify: `src/application/tools/tool-registry.ts`
- Modify: `src/application/services/file-tools.ts`
- Modify: `src/application/services/search-tools.ts`
- Modify: `src/application/services/cli-tool.ts`
- Modify: `src/application/services/mcp-tool-wrapper.ts`
- Modify: `src/application/tools/sources/openapi-loader-core.ts`
- Modify: `src/application/services/write-proposal-service.ts`
- Test: `src/application/tools/__tests__/tool-schema.test.ts`
- Test: `src/application/tools/__tests__/tool-registry.test.ts`
- Test: `src/__tests__/application/write-proposal-service.test.ts`

- [x] **Step 1: Install Zod**

Run:

```bash
npm install zod
```

Expected: `package.json` and `package-lock.json` include `zod`.

- [x] **Step 2: Write schema helper tests**

Create `src/application/tools/__tests__/tool-schema.test.ts`:

```ts
import { z } from 'zod';
import { createToolDefinition, validateToolArguments } from '@/application/tools/tool-schema';

describe('tool-schema', () => {
	it('validates required string arguments', () => {
		const definition = createToolDefinition({
			name: 'read_file',
			description: 'Read file',
			parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
			inputSchema: z.object({ path: z.string().min(1) }),
		});

		expect(validateToolArguments(definition, { path: 'A.md' }).success).toBe(true);
		expect(validateToolArguments(definition, { path: '' }).success).toBe(false);
	});

	it('falls back to parameter-derived schema when inputSchema is absent', () => {
		const definition = createToolDefinition({
			name: 'search_files',
			description: 'Search',
			parameters: [
				{ name: 'query', type: 'string', description: 'Query', required: true },
				{ name: 'limit', type: 'number', description: 'Limit', required: false },
			],
		});

		const valid = validateToolArguments(definition, { query: 'ai', limit: 5 });
		const invalid = validateToolArguments(definition, { limit: 5 });

		expect(valid.success).toBe(true);
		expect(invalid.success).toBe(false);
	});
});
```

- [x] **Step 3: Write registry enforcement tests**

Append to `src/application/tools/__tests__/tool-registry.test.ts`:

```ts
it('rejects invalid tool arguments before execution', async () => {
	const registry = new ToolRegistry();
	const execute = jest.fn(async () => ({ success: true, result: 'ok' }));
	registry.registerSource({
		kind: 'builtin',
		id: 'builtin',
		label: 'Built-in Tools',
		load: async () => [{
			definition: createToolDefinition({
				name: 'read_file',
				description: 'Read file',
				parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
				inputSchema: z.object({ path: z.string().min(1) }),
			}),
			execute,
		}],
		dispose: async () => undefined,
	});
	await registry.reload();

	const result = await registry.executeTool('read_file', { path: '' });

	expect(result.success).toBe(false);
	expect(result.error).toContain('Invalid arguments');
	expect(execute).not.toHaveBeenCalled();
});

it('rejects vault-write tools that do not return write proposals', async () => {
	const registry = new ToolRegistry();
	registry.registerSource({
		kind: 'builtin',
		id: 'builtin',
		label: 'Built-in Tools',
		load: async () => [{
			definition: createToolDefinition({
				name: 'write_file',
				description: 'Write file',
				parameters: [{ name: 'path', type: 'string', description: 'Path', required: true }],
				sideEffects: { vaultWrite: true },
			}),
			execute: async () => ({ success: true, result: 'wrote directly' }),
		}],
		dispose: async () => undefined,
	});
	await registry.reload();

	const result = await registry.executeTool('write_file', { path: 'A.md' });

	expect(result.success).toBe(false);
	expect(result.error).toContain('must return a write proposal');
});
```

Add imports at the top of the test file:

```ts
import { z } from 'zod';
import { createToolDefinition } from '@/application/tools/tool-schema';
```

- [x] **Step 4: Run failing tool tests**

Run:

```bash
npm test -- src/application/tools/__tests__/tool-schema.test.ts src/application/tools/__tests__/tool-registry.test.ts --runInBand
```

Expected: FAIL before implementation.

- [x] **Step 5: Extend tool types**

Modify `src/types/common/tools.ts`:

```ts
import type { z } from 'zod';

export interface ToolSideEffects {
	vaultWrite?: boolean;
	externalWrite?: boolean;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: ToolParameter[];
	inputSchema?: z.ZodObject<z.ZodRawShape>;
	sideEffects?: ToolSideEffects;
}
```

- [x] **Step 6: Remove duplicate service tool types**

Replace `src/application/services/types.ts` with:

```ts
export type {
	ToolParameter,
	ToolDefinition,
	ToolCall,
	ToolResult,
	Tool,
} from '@/types/common/tools';
```

- [x] **Step 7: Implement schema helper**

Create `src/application/tools/tool-schema.ts`:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolParameter } from '@/types/common/tools';

interface CreateToolDefinitionInput extends ToolDefinition {}

export function createToolDefinition(input: CreateToolDefinitionInput): ToolDefinition {
	return {
		...input,
		inputSchema: input.inputSchema ?? parametersToZodObject(input.parameters),
	};
}

export function validateToolArguments(definition: ToolDefinition, args: Record<string, unknown>): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
	const schema = definition.inputSchema ?? parametersToZodObject(definition.parameters);
	const result = schema.safeParse(args);
	if (!result.success) {
		return { success: false, error: result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ') };
	}
	return { success: true, data: result.data };
}

export function parametersToZodObject(parameters: ToolParameter[]): z.ZodObject<z.ZodRawShape> {
	const shape: z.ZodRawShape = {};
	for (const parameter of parameters) {
		let field = zodForParameter(parameter);
		if (!parameter.required) {
			field = field.optional();
		}
		shape[parameter.name] = field;
	}
	return z.object(shape);
}

function zodForParameter(parameter: ToolParameter): z.ZodTypeAny {
	if (parameter.enum?.length) {
		return z.enum(parameter.enum as [string, ...string[]]);
	}
	switch (parameter.type) {
		case 'number':
			return z.number();
		case 'boolean':
			return z.boolean();
		case 'array':
			return z.array(z.unknown());
		case 'object':
			return z.record(z.string(), z.unknown());
		case 'string':
		default:
			return z.string();
	}
}
```

- [x] **Step 8: Add write proposal assertion**

Modify `src/application/services/write-proposal-service.ts`:

```ts
export function assertWriteProposalResult(value: unknown): { success: true } | { success: false; error: string } {
	if (isWriteProposal(value)) {
		return { success: true };
	}
	return { success: false, error: 'Vault write tools must return a write proposal and must not write directly.' };
}
```

Add tests to `src/__tests__/application/write-proposal-service.test.ts`:

```ts
import { assertWriteProposalResult, createWriteProposal } from '@/application/services/write-proposal-service';

it('accepts write proposal results', () => {
	const proposal = createWriteProposal({ operation: 'create', path: 'A.md', content: 'A' });
	expect(assertWriteProposalResult(proposal)).toEqual({ success: true });
});

it('rejects non proposal write results', () => {
	const result = assertWriteProposalResult('direct write complete');
	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toContain('must return a write proposal');
	}
});
```

- [x] **Step 9: Enforce validation and proposal-first in registry**

Modify `src/application/tools/tool-registry.ts` imports:

```ts
import { validateToolArguments } from './tool-schema';
import { assertWriteProposalResult } from '@/application/services/write-proposal-service';
```

Replace `executeTool` with:

```ts
async executeTool(llmName: string, args: Record<string, unknown>): Promise<ToolResult> {
	const tool = this.byLlmName.get(llmName);
	if (!tool) {
		return { success: false, error: `Tool not found: ${llmName}` };
	}
	const validation = validateToolArguments(tool.definition, args);
	if (!validation.success) {
		return { success: false, error: `Invalid arguments for ${llmName}: ${validation.error}` };
	}
	try {
		const result = await tool.execute(validation.data);
		if (result.success && tool.definition.sideEffects?.vaultWrite) {
			const proposalCheck = assertWriteProposalResult(result.result);
			if (!proposalCheck.success) {
				return { success: false, error: proposalCheck.error };
			}
		}
		return result;
	} catch (err) {
		return {
			success: false,
			error: `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
		};
	}
}
```

- [x] **Step 10: Convert built-in vault tools**

Modify `src/application/services/file-tools.ts` and `src/application/services/search-tools.ts`:

```ts
import { z } from 'zod';
import { createToolDefinition } from '@/application/tools/tool-schema';
```

For `ReadFileTool.definition`:

```ts
definition: ToolDefinition = createToolDefinition({
	name: 'read_file',
	description: 'Read the contents of a file from the vault',
	parameters: [{ name: 'path', type: 'string', description: 'Path to the file to read', required: true }],
	inputSchema: z.object({ path: z.string().min(1) }),
});
```

For `WriteFileTool.definition`:

```ts
definition: ToolDefinition = createToolDefinition({
	name: 'write_file',
	description: 'Prepare a proposal to write or update a vault file. This does not modify the vault until the user confirms.',
	parameters: [
		{ name: 'path', type: 'string', description: 'Path to the file to write', required: true },
		{ name: 'content', type: 'string', description: 'Content to write to the file', required: true },
	],
	inputSchema: z.object({ path: z.string().min(1), content: z.string() }),
	sideEffects: { vaultWrite: true },
});
```

For `CreateNoteTool.definition`, add `sideEffects: { vaultWrite: true }` and schema:

```ts
inputSchema: z.object({
	title: z.string().min(1),
	content: z.string(),
	folder: z.string().optional(),
}),
```

For `AppendToNoteTool.definition`, add `sideEffects: { vaultWrite: true }` and schema:

```ts
inputSchema: z.object({
	path: z.string().min(1),
	content: z.string(),
}),
```

For `SearchFilesTool.definition`, add schema:

```ts
inputSchema: z.object({
	query: z.string().min(1),
	search_content: z.boolean().optional(),
	limit: z.number().positive().optional(),
}),
```

For `ListFilesTool.definition`, add schema:

```ts
inputSchema: z.object({
	folder: z.string().optional(),
	extension: z.string().optional(),
}),
```

- [x] **Step 11: Convert dynamic tool wrappers**

Modify `src/application/services/cli-tool.ts` constructor:

```ts
this.definition = createToolDefinition({
	name: config.name,
	description: config.description,
	parameters: this.convertParameters(config.parameters || []),
});
```

Modify `src/application/services/mcp-tool-wrapper.ts` in `convertMCPToolToDefinition`:

```ts
return createToolDefinition({
	name: mcpTool.name,
	description: mcpTool.description || '',
	parameters,
});
```

Modify `src/application/tools/sources/openapi-loader-core.ts` when building `definition`:

```ts
const definition: ToolDefinition = createToolDefinition({
	name: operationId,
	description,
	parameters: [...parameters, ...requestBody],
	sideEffects: ['post', 'put', 'delete', 'patch'].includes(method) ? { externalWrite: true } : undefined,
});
```

- [x] **Step 12: Verify tool schema refactor**

Run:

```bash
npm test -- src/application/tools/__tests__/tool-schema.test.ts src/application/tools/__tests__/tool-registry.test.ts src/application/tools/sources/__tests__/builtin-tool-source.test.ts src/application/tools/sources/__tests__/cli-tool-source.test.ts src/application/tools/sources/__tests__/mcp-tool-source.test.ts src/application/tools/sources/__tests__/openapi-loader-core.test.ts src/__tests__/application/write-proposal-service.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 13: Commit**

```bash
git add package.json package-lock.json src/types/common/tools.ts src/application/services/types.ts src/application/tools/tool-schema.ts src/application/tools/tool-registry.ts src/application/services/file-tools.ts src/application/services/search-tools.ts src/application/services/cli-tool.ts src/application/services/mcp-tool-wrapper.ts src/application/tools/sources/openapi-loader-core.ts src/application/services/write-proposal-service.ts src/application/tools/__tests__/tool-schema.test.ts src/application/tools/__tests__/tool-registry.test.ts src/application/tools/sources/__tests__/builtin-tool-source.test.ts src/application/tools/sources/__tests__/cli-tool-source.test.ts src/application/tools/sources/__tests__/mcp-tool-source.test.ts src/application/tools/sources/__tests__/openapi-loader-core.test.ts src/__tests__/application/write-proposal-service.test.ts
git commit -m "feat: standardize tool schemas with proposal guard"
```

---

### Task 7: SPAR Trace Rendering

**Files:**
- Modify: `src/presentation/components/chat/handlers/tool-call-handler.ts`
- Modify: `src/presentation/components/chat/message-renderer.ts`
- Modify: `src/presentation/components/chat/settings.css`
- Test: `src/presentation/components/chat/__tests__/message-renderer.test.ts`
- Test: `src/presentation/components/chat/__tests__/message-renderer-write-proposals.test.ts`

- [x] **Step 1: Add renderer test for SPAR phase labels**

Append to `src/presentation/components/chat/__tests__/message-renderer.test.ts`:

```ts
it('renders SPAR phase labels in agent traces', () => {
	const container = document.createElement('div');
	const message = {
		role: 'assistant' as const,
		content: 'Done',
		agentExecutionSteps: [
			{ type: 'thought' as const, phase: 'sense' as const, content: 'Sensed active note', timestamp: 1 },
			{ type: 'action' as const, phase: 'act' as const, content: 'read_file({"path":"A.md"})', toolName: 'read_file', args: { path: 'A.md' }, status: 'success' as const, result: '"A"', timestamp: 2 },
		],
	};

	const el = renderMessage(container, message, mockContext);

	expect(el.textContent).toContain('Sense');
	expect(el.textContent).toContain('Act');
});
```

- [x] **Step 2: Run failing renderer tests**

Run:

```bash
npm test -- src/presentation/components/chat/__tests__/message-renderer.test.ts src/presentation/components/chat/__tests__/message-renderer-write-proposals.test.ts --runInBand
```

Expected: phase label assertion fails.

- [x] **Step 3: Render phase labels in trace handler**

Modify `src/presentation/components/chat/handlers/tool-call-handler.ts`:

```ts
function formatPhaseLabel(phase?: AgentExecutionStep['phase']): string | null {
	if (!phase) return null;
	return phase.charAt(0).toUpperCase() + phase.slice(1);
}
```

In `renderThinkingBlock`, add optional phase parameter:

```ts
function renderThinkingBlock(container: HTMLElement, content: string, phase?: AgentExecutionStep['phase']): void {
```

After the label is created:

```ts
const phaseLabel = formatPhaseLabel(phase);
if (phaseLabel) {
	labelRow.createSpan('agent-phase-badge').setText(phaseLabel);
}
```

Update callers:

```ts
renderThinkingBlock(container, step.content, step.phase);
renderThinkingBlock(container, actionStep.thinking, actionStep.phase);
```

In `renderToolCallCard`, after the title row starts:

```ts
const phaseLabel = formatPhaseLabel(actionStep.phase);
if (phaseLabel) {
	titleRow.createSpan('agent-phase-badge').setText(phaseLabel);
}
```

- [x] **Step 4: Add CSS for phase badges**

Append to `src/presentation/components/chat/settings.css`:

```css
.agent-phase-badge {
	display: inline-flex;
	align-items: center;
	height: 18px;
	padding: 0 6px;
	border-radius: 6px;
	background: var(--background-modifier-border);
	color: var(--text-muted);
	font-size: 11px;
	font-weight: 600;
	line-height: 1;
}
```

- [x] **Step 5: Verify proposal cards still render**

Run:

```bash
npm test -- src/presentation/components/chat/__tests__/message-renderer.test.ts src/presentation/components/chat/__tests__/message-renderer-write-proposals.test.ts --runInBand
npm run type-check
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/presentation/components/chat/handlers/tool-call-handler.ts src/presentation/components/chat/message-renderer.ts src/presentation/components/chat/settings.css src/presentation/components/chat/__tests__/message-renderer.test.ts
git commit -m "feat: show spar phases in agent traces"
```

---

### Task 8: Final Cleanup, Verification, And Deployment

**Files:**
- Modify: `src/application/services/chat.service.ts`

- [x] **Step 1: Remove legacy Agent loop fallback**

After Tasks 4-7 are green, remove the old `executeAgentLoop` implementation body from `src/application/services/chat.service.ts` and leave only the delegation path plus an explicit configuration error:

```ts
async executeAgentLoop(
	messages: Message[],
	options: ChatOptions & {
		agentId?: string;
		agents?: Agent[];
		isGenericAgent?: boolean;
		references?: FileReference[];
	},
	callbacks: AgentLoopCallbacks,
): Promise<void> {
	if (!this.autonomousAgentLoop) {
		callbacks.onError(new Error('AutonomousAgentLoop is not configured'));
		return;
	}
	await this.autonomousAgentLoop.execute(messages, { ...options, mode: 'agent' }, callbacks);
}
```

- [x] **Step 2: Remove unused private ChatService helpers**

In `src/application/services/chat.service.ts`, remove methods that become unused after the extraction:

- `buildAgentSystemMessages`
- `diagnoseToolError`

Run `npm run type-check` after removal. If TypeScript reports an unused import, delete that import in the same file.

- [x] **Step 3: Run targeted verification**

Run:

```bash
npm test -- src/__tests__/application/chat-service-streaming.test.ts src/__tests__/application/agents/agent-sense-service.test.ts src/__tests__/application/agents/history-compactor.test.ts src/__tests__/application/agents/autonomous-agent-loop.test.ts src/__tests__/application/agent-memory-service.test.ts src/application/tools/__tests__/tool-schema.test.ts src/application/tools/__tests__/tool-registry.test.ts src/presentation/components/chat/__tests__/message-renderer.test.ts src/presentation/components/chat/__tests__/message-renderer-write-proposals.test.ts --runInBand
```

Expected: all listed suites pass.

- [x] **Step 4: Run full verification**

Run:

```bash
npm test
npm run type-check
npm run build
```

Expected: all commands pass.

- [x] **Step 5: Deploy locally**

Run:

```bash
npm run deploy
```

Expected: deploy script completes and updates the local Obsidian plugin bundle.

- [x] **Step 6: Commit final cleanup**

```bash
git add src/application/services/chat.service.ts
git commit -m "refactor: complete trinity agent loop migration"
```

- [x] **Step 7: Push**

```bash
git push
```

Expected: push succeeds.

---

## Self-Review

**Spec coverage:**

- SPAR loop from `docs/architecture/trinity-design.md` is implemented by Tasks 1, 2, 4, 5, and 7.
- Active note, graph neighbors, and RAG context in Sense are implemented by Task 2.
- Proposal-first vault writes are implemented by Task 6 and rendered by existing proposal UI verified in Task 7.
- `memory.json` research workspace is implemented by Task 3.
- 10k-token history compaction with a Research Log block is implemented by Task 3.
- `ChatService` extraction into `AutonomousAgentLoop` is implemented by Tasks 4, 5, and 8.
- Zod schema standardization is implemented by Task 6.

**Placeholder scan:**

- No implementation step relies on an unspecified file path.
- No step asks the implementer to add generic validation without code.
- No task uses workflow or multi-agent implementation.

**Type consistency:**

- `AgentLoopCallbacks` is defined once in `src/application/agents/types.ts` and imported by `ChatService`.
- `AgentExecutionStep.phase` uses the same SPAR phase union as `SparPhase`.
- Tool definitions keep the existing `parameters` field for provider JSON schema conversion and add `inputSchema` for Zod validation.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/obsidian-trinity-refactor.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
