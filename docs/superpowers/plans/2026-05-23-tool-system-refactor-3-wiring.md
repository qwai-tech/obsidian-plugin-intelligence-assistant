# 工具系统重构 第 3 期:装配与收敛 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire ToolRegistry into main.ts, converge chat.service filtering to resolveForAgent, add per-agent toolAccess model, migrate old agent tool fields, update UI files.

- 日期:2026-05-23
- 总设计:`docs/superpowers/specs/2026-05-22-tool-system-refactor-design.md`
- 分支:`tool-system-refactor`

## 背景与边界

Phases 1-2 已完成(ToolRegistry + 4 个 ToolSource 实现 + loadOpenApiTools)。新架构已就绪但未接线 —— main.ts 仍用旧 ToolManager/CLIToolLoader/OpenApiToolLoader,chat.service 仍用字符串 provider 解析。

本期只做:agent 类型改动 + 迁移函数、agent.model 更新、main.ts 装配、chat.service 收敛、UI 文件最小改动。

严格不做:config schema 统一(第 4 期)、tools-tab 拆分(第 5 期)、mcp-tab 完全迁移(保留旧 ToolManager 用于连接生命周期,第 4 期完成)。

约束:代码全英文,tab 缩进,TypeScript strict,路径别名 `@/*`。测试基线约 88 个 pre-existing 失败,不引入新失败。

## 文件改动概览

| 文件 | 改动 |
|---|---|
| `src/types/core/agent.ts` | 加 `toolAccess?: AgentToolAccess`,import |
| `src/application/tools/tool-migrations.ts` | **新增** |
| `src/application/tools/__tests__/tool-migrations.test.ts` | **新增** |
| `src/domain/agent/agent.model.ts` | `canUseTooling`/`getToolsCount` 读 `toolAccess` |
| `main.ts` | 加 `ToolRegistry`/`initToolRegistry`/迁移调用/onunload |
| `src/application/services/chat.service.ts` | ToolManager→ToolRegistry,删 `isToolAllowed`,改 `buildAgentSystemMessages`,`executeAgentLoop` 工具分辨 |
| `src/presentation/views/chat-view.ts` | ChatService 传 ToolRegistry,删 `applyAgentConfig` 工具块,简化 `initializeMCPServers` |
| `src/presentation/components/tabs/tools-tab.ts` | 用 `registry.getTools()` 读工具 |
| `src/presentation/components/tabs/mcp-tab.ts` | 用 registry 读工具,保持连接生命周期用旧 toolManager |
| `src/application/tools/sources/mcp-tool-source.ts` | 加调试性 `getCachedTools` (Phase 3 过渡用) |

---

## Task 1:Agent 类型 + 迁移函数 + 测试

### 1.1 修改 Agent 类型

在 `src/types/core/agent.ts` 顶部加 import:
```ts
import type { AgentToolAccess } from '@/types/common/tools';
```

在 `Agent` 接口中 `enabledAllCLITools` 之后、`memoryType` 之前加:
```ts
	/** Per-agent tool access. Migrated from the 5 legacy fields. Runtime code reads only this. */
	toolAccess?: AgentToolAccess;
```

### 1.2 新建迁移文件

`src/application/tools/tool-migrations.ts`:

```ts
/**
 * Agent tool-config migration.
 * Phase 3: migrates the 5 legacy per-agent tool fields into AgentToolAccess.
 */
import type { Agent } from '@/types/core/agent';
import type { AgentToolAccess } from '@/types/common/tools';

/**
 * Migrate a single agent's legacy tool fields into toolAccess.
 * Idempotent: returns early if toolAccess already exists.
 * Mutates the agent in place.
 *
 * @param agent - agent to migrate
 * @param allCliToolIds - known CLI tool config IDs (for enabledAllCLITools)
 * @returns true if the agent was mutated
 */
export function migrateAgentToolAccess(
	agent: Agent,
	allCliToolIds: string[],
): boolean {
	if (agent.toolAccess) {
		return false;
	}

	const sources: Record<string, 'all' | string[]> = {};

	// 1. Built-in tools: translate names to toolIds
	if (agent.enabledBuiltInTools.length > 0) {
		sources['builtin:builtin'] = agent.enabledBuiltInTools.map(
			(name) => `builtin:builtin:${name}`,
		);
	}

	// 2. MCP servers: each listed server becomes 'all'
	for (const serverName of agent.enabledMcpServers) {
		sources[`mcp:${serverName}`] = 'all';
	}

	// 3. MCP individual tools NOT already covered by enabledMcpServers
	if (agent.enabledMcpTools && agent.enabledMcpTools.length > 0) {
		const toolByServer = new Map<string, string[]>();
		for (const fullKey of agent.enabledMcpTools) {
			const sepIdx = fullKey.indexOf('::');
			if (sepIdx === -1) continue;
			const server = fullKey.substring(0, sepIdx);
			const toolName = fullKey.substring(sepIdx + 2);
			if (!agent.enabledMcpServers.includes(server)) {
				if (!toolByServer.has(server)) {
					toolByServer.set(server, []);
				}
				toolByServer.get(server)!.push(toolName);
			}
		}
		for (const [server, tools] of toolByServer) {
			sources[`mcp:${server}`] = tools.map((t) => `mcp:${server}:${t}`);
		}
	}

	// 4. CLI: enabledAllCLITools → 'all' for every known CLI config
	if (agent.enabledAllCLITools) {
		for (const cliId of allCliToolIds) {
			sources[`cli:${cliId}`] = 'all';
		}
	}
	if (agent.enabledCLITools && agent.enabledCLITools.length > 0) {
		for (const cliId of agent.enabledCLITools) {
			if (!sources[`cli:${cliId}`]) {
				sources[`cli:${cliId}`] = 'all';
			}
		}
	}

	agent.toolAccess = { sources };
	return true;
}

/**
 * Migrate all agents, returning the set of mutated agent IDs.
 */
export function migrateAllAgents(
	agents: Agent[],
	allCliToolIds: string[],
): Set<string> {
	const changed = new Set<string>();
	for (const agent of agents) {
		if (migrateAgentToolAccess(agent, allCliToolIds)) {
			changed.add(agent.id);
		}
	}
	return changed;
}
```

### 1.3 测试

`src/application/tools/__tests__/tool-migrations.test.ts`:

```ts
import { migrateAgentToolAccess, migrateAllAgents } from '../tool-migrations';
import type { Agent } from '@/types/core/agent';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: 'test-agent',
		name: 'Test Agent',
		description: '',
		icon: 'bot',
		modelStrategy: { strategy: 'default' },
		temperature: 0.7,
		maxTokens: 4000,
		systemPromptId: 'sp-1',
		contextWindow: 20,
		enabledBuiltInTools: [],
		enabledMcpServers: [],
		enabledMcpTools: [],
		enabledCLITools: [],
		enabledAllCLITools: false,
		memoryType: 'none',
		memoryConfig: { summaryInterval: 10, maxMemories: 50 },
		ragEnabled: false,
		webSearchEnabled: false,
		maxSteps: 10,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	};
}

describe('migrateAgentToolAccess', () => {
	it('does nothing when toolAccess already exists', () => {
		const agent = makeAgent({ toolAccess: { sources: { 'builtin:builtin': 'all' } } });
		expect(migrateAgentToolAccess(agent, [])).toBe(false);
		expect(agent.toolAccess).toEqual({ sources: { 'builtin:builtin': 'all' } });
	});

	it('migrates enabledBuiltInTools into toolIds', () => {
		const agent = makeAgent({ enabledBuiltInTools: ['read_file', 'write_file'] });
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['builtin:builtin']).toEqual([
			'builtin:builtin:read_file',
			'builtin:builtin:write_file',
		]);
	});

	it('migrates enabledMcpServers to all', () => {
		const agent = makeAgent({ enabledMcpServers: ['alpha', 'beta'] });
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['mcp:alpha']).toBe('all');
		expect(agent.toolAccess!.sources['mcp:beta']).toBe('all');
	});

	it('migrates enabledMcpTools not covered by enabledMcpServers', () => {
		const agent = makeAgent({
			enabledMcpServers: ['alpha'],
			enabledMcpTools: ['alpha::builtin_tool', 'beta::extra_tool'],
		});
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess!.sources['mcp:alpha']).toBe('all');
		expect(agent.toolAccess!.sources['mcp:beta']).toEqual(['mcp:beta:extra_tool']);
	});

	it('migrates enabledAllCLITools to all for every known CLI config', () => {
		const agent = makeAgent({ enabledAllCLITools: true });
		migrateAgentToolAccess(agent, ['cli-1', 'cli-2']);
		expect(agent.toolAccess!.sources['cli:cli-1']).toBe('all');
		expect(agent.toolAccess!.sources['cli:cli-2']).toBe('all');
	});

	it('migrates individual enabledCLITools', () => {
		const agent = makeAgent({ enabledCLITools: ['custom'] });
		migrateAgentToolAccess(agent, ['custom']);
		expect(agent.toolAccess!.sources['cli:custom']).toBe('all');
	});

	it('handles an agent with no tool config at all', () => {
		const agent = makeAgent();
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess).toEqual({ sources: {} });
	});

	it('handles undefined-equivalent old fields', () => {
		const agent = makeAgent({
			enabledBuiltInTools: [],
			enabledMcpServers: [],
			enabledMcpTools: undefined,
			enabledCLITools: undefined,
			enabledAllCLITools: false,
		});
		migrateAgentToolAccess(agent, []);
		expect(agent.toolAccess).toEqual({ sources: {} });
	});
});

describe('migrateAllAgents', () => {
	it('returns IDs of mutated agents', () => {
		const agents = [
			makeAgent({ id: 'a1', enabledBuiltInTools: ['read_file'] }),
			makeAgent({ id: 'a2', toolAccess: { sources: {} } }),
		];
		const changed = migrateAllAgents(agents, []);
		expect(changed.has('a1')).toBe(true);
		expect(changed.has('a2')).toBe(false);
	});
});
```

### 1.4 确认失败

`npx jest src/application/tools/__tests__/tool-migrations.test.ts`
Expected: FAIL — `Cannot find module '../tool-migrations'`.

### 1.5 确认通过

`npx jest src/application/tools/__tests__/tool-migrations.test.ts`
Expected: 9 passed.

### 1.6 lint + commit

```
git add src/types/core/agent.ts src/application/tools/tool-migrations.ts src/application/tools/__tests__/tool-migrations.test.ts
git commit -m "feat: add AgentToolAccess migration from legacy tool fields"
```

---

## Task 2:更新 agent.model.ts

### 2.1 修改

把 `canUseTooling()` 与 `getToolsCount()` 改为优先读 `toolAccess`,fallback 旧字段:

```ts
canUseTooling(): boolean {
	if (this._data.toolAccess) {
		return Object.keys(this._data.toolAccess.sources).length > 0;
	}
	return (
		this._data.enabledBuiltInTools.length > 0 ||
		this._data.enabledMcpServers.length > 0
	);
}

getToolsCount(): number {
	if (this._data.toolAccess) {
		let count = 0;
		for (const rule of Object.values(this._data.toolAccess.sources)) {
			if (rule === 'all') {
				count += 1;
			} else {
				count += rule.length;
			}
		}
		return count;
	}
	return (
		this._data.enabledBuiltInTools.length +
		this._data.enabledMcpServers.length
	);
}
```

### 2.2 确认通过

`npx jest -- agent.model 2>&1 | tail -6`
Expected: 现有测试保持通过(fallback 分支与旧逻辑一致)。

### 2.3 lint + commit

```
git add src/domain/agent/agent.model.ts
git commit -m "feat: update agent.model to read toolAccess"
```

---

## Task 3:Chat Service 收敛

这是本期最大的改动。把 `chat.service.ts` 从 `ToolManager` 切换为 `ToolRegistry`,删除 `isToolAllowed` 和字符串 provider 解析,改为 `resolveForAgent`。

实现者须先通读 `src/application/services/chat.service.ts` 原文,然后做以下具体修改:
1. 构造函数:参数/成员从 `toolManager: ToolManager` 改为 `toolRegistry: ToolRegistry`。
2. 删除 `isToolAllowed` 方法。
3. 把 `buildAgentSystemMessages` 用 `resolveForAgent` 重写,移 `allowOpenApiTools` 参数。
4. `executeAgentLoop`:用 `resolveForAgent` 解析工具列表,执行时用 `registry.executeTool(llmName, args)`。
5. `streamResponse`:agent 模式下的工具列表用 `registry.getTools()`。

### 3.1/3.2 实现与确认

实现后:
`npm run build` — 通过
`npx jest -- chat-service` — 现有流式测试通过

### 3.3 lint + commit

```
git add src/application/services/chat.service.ts
git commit -m "feat: converge chat.service filtering to resolveForAgent"
```

---

## Task 4:main.ts 装配 + chat-view UI 更新

### 4.1 main.ts 改动

实现者须读 `main.ts` 原文,做以下具体改动:

1. 顶部加 import:`ToolRegistry`、四个 ToolSource、`ObsidianFileSystem`、`migrateAllAgents`。
2. 加 `sharedToolRegistry: ToolRegistry | null = null` 字段。
3. 加 `getToolRegistry()` 方法(懒初始化,与 `getToolManager` 对称)。
4. 加 `initToolRegistry()` 方法:遍历四个来源的 config,为每个启用的条目创建对应的 ToolSource 并 register,最后 reload。
5. `loadSettings` 末尾加迁移调用。
6. `deferredInitialization` 中加 `this.initToolRegistry()`。
7. `onunload` 中加 `sharedToolRegistry?.dispose()`。

### 4.2 chat-view.ts 改动

1. `ChatService` 构造改为传 `toolRegistry` 而非 `toolManager`。
2. 从 `applyAgentConfig` 删工具设置/MCP 注册块(toolAccess 统一管理)。
3. 简化 `initializeMCPServers` 为调试性查询。

### 4.3 确认

`npm run build` — 通过
`npx jest 2>&1 | tail -8` — 失败数不增

### 4.4 lint + commit

```
git add main.ts src/presentation/views/chat-view.ts
git commit -m "feat: wire ToolRegistry into main.ts and chat-view"
```

---

## Task 5:UI 文件最小改动

### 5.1 tools-tab.ts

把 `renderMcpTools` 中的 `toolManager.getToolsByProvider()` 改为 `registry.getTools()` 分组。删 `syncToolManagerConfig()` 调用。

### 5.2 mcp-tab.ts

读取操作用 `registry`,连接/断开生命周期保留用旧 `toolManager`(第 4 期迁移)。

### 5.3 确认 + commit

```
git add src/presentation/components/tabs/tools-tab.ts src/presentation/components/tabs/mcp-tab.ts
git commit -m "feat: update tools/mcp tabs to use ToolRegistry for reads"
```

---

## Task 6:收尾验证

- `npx jest src/application/tools` — 迁移 + registry 测试全过
- `npx jest 2>&1 | tail -8` — 失败数仍约 88,不增
- `npm run lint` — 改动文件无新增 error
- `npm run build` — 通过
- `node scripts/deploy.js --local` — 部署成功

---

## 风险与注意事项

1. **ChatService 类型不匹配**:旧 `executeTool(tc: ToolCall)` 变 `registry.executeTool(llmName, args)`.确保调用处正确改造。
2. **迁移幂等性**:若 agent 已有 `toolAccess`,迁移跳过 —— 这防止旧字段被覆盖。
3. **MCP tab 不完全迁移**:连接/断开仍用旧 `ToolManager`;工具读取用 `ToolRegistry`.这保证现有 MCP 管理功能不破。
4. **`getToolsByProvider` 消失**:用 `registry.getTools()` + 按 `origin` 分组替代。
5. **`getMCPServers` 消失**:用 `registry.getTools().filter(t => t.origin.kind === 'mcp').map(t => t.origin.sourceId)` (去重)。
