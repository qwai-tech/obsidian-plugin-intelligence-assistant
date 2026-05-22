# 工具系统重构 第 1 期:核心抽象 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建工具系统的核心抽象 —— `ToolSource` 接口、相关类型,以及聚合/消歧/查询用的 `ToolRegistry` 类;纯新增、不接线。

**Architecture:** 在 `src/application/tools/` 下新建一个插件化的工具注册中心。`ToolRegistry` 持有一组 `ToolSource`,`reload()` 时聚合各 source 产出的工具,为每个工具生成结构化 `toolId` 与一个去重后的 LLM 可见名 `llmName`,并提供按 agent 过滤、按名查找、执行、格式转换等查询能力。本期完全独立 —— 不修改 `main.ts`、`chat.service`、`tool-manager.ts` 或任何现有装配代码。

**Tech Stack:** TypeScript(strict、`noImplicitAny`、`strictNullChecks`)、Jest + ts-jest(`jsdom` 环境)、路径别名 `@/*` → `src/*`。

---

## 背景(给零上下文的工程师)

- 这是一个 Obsidian 插件,源码在 `src/`,按 `core / domain / application / infrastructure / presentation` 分层。
- 测试用 Jest:测试文件放在被测代码旁的 `__tests__/` 目录,命名 `*.test.ts`。`jest.config.js` 的 `roots` 是 `src`。
- 跑单个测试文件:`npx jest <相对路径>`。
- ⚠️ **测试基线**:跑 `npx jest` 当前已有约 88 个测试失败(9 个套件)。这些是 pre-existing 失败 —— 测试文件 import 了已移动的模块路径,以及若干与工具系统无关的逻辑失败(message-renderer、LLM provider 等),**与本重构无关**。本期验收是「新增测试全过 + 不引入新失败」,而非「全量通过」。
- 代码风格:**tab 缩进**(与 `src/types/common/tools.ts`、`src/application/services/tool-manager.ts` 一致)。
- 提交信息用 conventional commits(`feat:` / `fix:` / `docs:` / `chore:`)。
- 完整设计见 `docs/superpowers/specs/2026-05-22-tool-system-refactor-design.md`。
- 本期是 5 期重构的第 1 期(spec 第 7 节)。第 2 期(四个 `ToolSource` 实现 + 接线)会基于本期产出的真实类型签名另行编写。

## 文件结构(本期涉及)

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/types/common/tools.ts` | 工具系统共享类型 | 修改:追加 5 个新类型 |
| `src/application/tools/tool-source.ts` | `ToolSource` 行为接口 | 新建 |
| `src/application/tools/tool-registry.ts` | `ToolRegistry` 聚合/消歧/查询 | 新建 |
| `src/application/tools/__tests__/tool-registry.test.ts` | `ToolRegistry` 单元测试 | 新建 |

本期**不修改**:`main.ts`、`tool-manager.ts`、`chat.service.ts`、`src/types/core/agent.ts` 及任何 UI 代码。`AgentToolAccess` 类型本期只声明,不接到 `Agent` 接口上(那是第 3 期)。

---

## Task 1:核心类型与 `ToolSource` 接口

**Files:**
- Modify: `src/types/common/tools.ts`(在文件末尾追加)
- Create: `src/application/tools/tool-source.ts`

纯类型声明,无运行时行为,因此用编译验证而非单元测试。后续 Task 2 的测试会 import 并实际使用这些类型,等于进一步验证。

- [ ] **Step 1:在 `src/types/common/tools.ts` 末尾追加新类型**

当前文件已定义 `ToolParameter` / `ToolDefinition` / `ToolCall` / `ToolResult` / `Tool` / `BuiltInToolConfig`。在文件最末尾(`BuiltInToolConfig` 之后)追加:

```typescript

/**
 * 工具来源的种类。builtin/mcp/openapi/cli 只是「第一批」来源,
 * registry 不对它们做任何特判。
 */
export type ToolSourceKind = 'builtin' | 'mcp' | 'openapi' | 'cli';

/**
 * 一个工具的结构化来源标识,取代旧的字符串 `provider` 标签。
 * sourceId:builtin → 'builtin';mcp → server 名;openapi/cli → config.id
 */
export interface ToolOrigin {
	kind: ToolSourceKind;
	sourceId: string;
}

/**
 * 由 ToolSource.load() 产出的原始工具 —— 还没有 origin / toolId / llmName。
 */
export interface SourceTool {
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 经 ToolRegistry 聚合、消歧后的工具。
 * - toolId:全局唯一内部键 = `${kind}:${sourceId}:${rawName}`
 * - llmName:LLM 可见名,冲突时确定性去重
 */
export interface RegisteredTool {
	toolId: string;
	llmName: string;
	origin: ToolOrigin;
	definition: ToolDefinition;
	execute(_args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 单个 agent 的工具访问配置。
 * key = `${kind}:${sourceId}`(一个 source);
 * value = 'all'(该 source 全部工具)或一组 toolId。
 */
export interface AgentToolAccess {
	sources: Record<string, 'all' | string[]>;
}
```

- [ ] **Step 2:创建 `src/application/tools/tool-source.ts`**

```typescript
/**
 * ToolSource —— 工具来源的统一接口。
 * builtin / mcp / openapi / cli 四种来源都实现它;ToolRegistry 一视同仁。
 */
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

export interface ToolSource {
	/** 来源种类 */
	readonly kind: ToolSourceKind;
	/** 来源实例 id:builtin → 'builtin';mcp → server 名;openapi/cli → config.id */
	readonly id: string;
	/** 展示用名称 */
	readonly label: string;
	/** 加载该来源的工具(MCP 连接、OpenAPI 拉 spec、builtin/cli 同步构造) */
	load(): Promise<SourceTool[]>;
	/** 释放资源(MCP 断连;其余 no-op) */
	dispose(): Promise<void>;
}
```

- [ ] **Step 3:验证编译通过**

Run: `npm run build`
Expected: 构建成功,无 TypeScript 报错。

- [ ] **Step 4:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 5:提交**

```bash
git add src/types/common/tools.ts src/application/tools/tool-source.ts
git commit -m "feat: add tool system core types and ToolSource interface"
```

---

## Task 2:`ToolRegistry` — 聚合与消歧

**Files:**
- Create: `src/application/tools/tool-registry.ts`
- Create: `src/application/tools/__tests__/tool-registry.test.ts`

这是 registry 的核心:注册 source、`reload()` 聚合、生成 `toolId`、把工具名 sanitize 成合法函数名并对冲突确定性去重、按 id / llmName 查找。

- [ ] **Step 1:写失败测试**

创建 `src/application/tools/__tests__/tool-registry.test.ts`:

```typescript
import { ToolRegistry } from '../tool-registry';
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';

/** 构造一个返回固定结果的假工具。 */
function fakeTool(name: string): SourceTool {
	return {
		definition: { name, description: `${name} description`, parameters: [] },
		execute: async (args) => ({ success: true, result: { name, args } }),
	};
}

/** 构造一个假 ToolSource;可用 hooks 覆盖 load/dispose 行为。 */
function fakeSource(
	kind: ToolSourceKind,
	id: string,
	tools: SourceTool[],
	hooks: Partial<Pick<ToolSource, 'load' | 'dispose'>> = {},
): ToolSource {
	return {
		kind,
		id,
		label: id,
		load: hooks.load ?? (async () => tools),
		dispose: hooks.dispose ?? (async () => {}),
	};
}

describe('ToolRegistry — aggregation', () => {
	it('aggregates tools from registered sources after reload', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const tools = registry.getTools();
		expect(tools).toHaveLength(1);
		expect(tools[0].toolId).toBe('builtin:builtin:read_file');
		expect(tools[0].llmName).toBe('read_file');
		expect(tools[0].origin).toEqual({ kind: 'builtin', sourceId: 'builtin' });
	});

	it('returns no tools before reload is called', () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('cli', 'c1', [fakeTool('run')]));
		expect(registry.getTools()).toHaveLength(0);
	});

	it('looks tools up by id and by llm name', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		expect(registry.getToolById('builtin:builtin:read_file')?.llmName).toBe('read_file');
		expect(registry.getToolByLlmName('read_file')?.toolId).toBe('builtin:builtin:read_file');
		expect(registry.getToolById('missing')).toBeUndefined();
		expect(registry.getToolByLlmName('missing')).toBeUndefined();
	});
});

describe('ToolRegistry — llm name disambiguation', () => {
	it('suffixes colliding llm names deterministically by source order', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const [first, second] = registry.getTools();
		expect(first.llmName).toBe('search');
		expect(first.toolId).toBe('mcp:alpha:search');
		expect(second.llmName).toBe('search_2');
		expect(second.toolId).toBe('mcp:beta:search');
	});

	it('sanitizes characters illegal in function names', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('cli', 'c1', [fakeTool('my.fancy tool!')]));
		await registry.reload();
		expect(registry.getTools()[0].llmName).toBe('my_fancy_tool_');
		expect(registry.getTools()[0].toolId).toBe('cli:c1:my.fancy tool!');
	});
});

describe('ToolRegistry — reload failure isolation', () => {
	it('skips a source whose load() rejects without affecting others', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(
			fakeSource('mcp', 'broken', [], {
				load: async () => {
					throw new Error('connect failed');
				},
			}),
		);
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const tools = registry.getTools();
		expect(tools).toHaveLength(1);
		expect(tools[0].toolId).toBe('builtin:builtin:read_file');
	});
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: FAIL —— 报 `Cannot find module '../tool-registry'`(文件还不存在)。

- [ ] **Step 3:创建 `src/application/tools/tool-registry.ts`**

```typescript
/**
 * ToolRegistry —— 工具系统的注册中心。
 * 持有一组 ToolSource,聚合各 source 的工具,生成结构化 toolId 与去重后的
 * LLM 可见名,并提供按 agent 过滤、按名查找、执行、格式转换等能力。
 */
import type { RegisteredTool, SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { ToolSource } from './tool-source';

/** LLM 函数名最大长度(OpenAI / Anthropic 限制)。 */
const MAX_LLM_NAME_LENGTH = 64;

export class ToolRegistry {
	/** key = `${kind}:${id}`,按注册顺序迭代(决定消歧优先级)。 */
	private sources = new Map<string, ToolSource>();
	/** 每个 source 上次 load() 的结果,key 同上。 */
	private sourceTools = new Map<string, SourceTool[]>();
	/** 聚合 + 消歧后的工具列表。 */
	private tools: RegisteredTool[] = [];
	private byToolId = new Map<string, RegisteredTool>();
	private byLlmName = new Map<string, RegisteredTool>();

	/** 注册一个工具来源。不会立即加载;需调用 reload()。 */
	registerSource(source: ToolSource): void {
		this.sources.set(sourceKey(source.kind, source.id), source);
	}

	/** 对所有已注册 source 调用 load() 并重建索引。单个 source 失败不影响其它。 */
	async reload(): Promise<void> {
		for (const [key, source] of this.sources) {
			try {
				this.sourceTools.set(key, await source.load());
			} catch (err) {
				console.error(`[ToolRegistry] load failed for ${key}:`, err);
				this.sourceTools.set(key, []);
			}
		}
		this.rebuild();
	}

	/** 返回聚合后的全部工具。 */
	getTools(): RegisteredTool[] {
		return this.tools;
	}

	getToolById(toolId: string): RegisteredTool | undefined {
		return this.byToolId.get(toolId);
	}

	getToolByLlmName(name: string): RegisteredTool | undefined {
		return this.byLlmName.get(name);
	}

	/**
	 * 从已缓存的 source 工具重新聚合 RegisteredTool 列表并消歧。
	 * 不重新调用 source.load()。
	 */
	private rebuild(): void {
		const tools: RegisteredTool[] = [];
		const usedLlmNames = new Set<string>();
		for (const [key, source] of this.sources) {
			const sourceTools = this.sourceTools.get(key) ?? [];
			for (const st of sourceTools) {
				const rawName = st.definition.name;
				const toolId = `${source.kind}:${source.id}:${rawName}`;
				const llmName = disambiguate(sanitizeLlmName(rawName), usedLlmNames);
				usedLlmNames.add(llmName);
				tools.push({
					toolId,
					llmName,
					origin: { kind: source.kind, sourceId: source.id },
					definition: st.definition,
					execute: (args) => st.execute(args),
				});
			}
		}
		this.tools = tools;
		this.byToolId = new Map(tools.map((t) => [t.toolId, t]));
		this.byLlmName = new Map(tools.map((t) => [t.llmName, t]));
	}
}

/** source 索引键。 */
function sourceKey(kind: ToolSourceKind, id: string): string {
	return `${kind}:${id}`;
}

/** 把任意工具名转成合法的 LLM 函数名:仅保留 [a-zA-Z0-9_-],截断到 64。 */
function sanitizeLlmName(raw: string): string {
	const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, MAX_LLM_NAME_LENGTH);
	return cleaned.length > 0 ? cleaned : 'tool';
}

/** 若 base 已被占用,确定性地追加 `_2`、`_3`… 后缀(并保证不超长)。 */
function disambiguate(base: string, used: Set<string>): string {
	if (!used.has(base)) {
		return base;
	}
	let n = 2;
	for (;;) {
		const suffix = `_${n}`;
		const head = base.slice(0, MAX_LLM_NAME_LENGTH - suffix.length);
		const candidate = head + suffix;
		if (!used.has(candidate)) {
			return candidate;
		}
		n += 1;
	}
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: PASS —— 全部 6 个用例通过。

- [ ] **Step 5:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 6:提交**

```bash
git add src/application/tools/tool-registry.ts src/application/tools/__tests__/tool-registry.test.ts
git commit -m "feat: add ToolRegistry aggregation and llm name disambiguation"
```

---

## Task 3:`ToolRegistry.executeTool`

**Files:**
- Modify: `src/application/tools/tool-registry.ts`
- Modify: `src/application/tools/__tests__/tool-registry.test.ts`

按 LLM 可见名定位工具并执行,捕获异常转成 `ToolResult`。

- [ ] **Step 1:追加失败测试**

在 `tool-registry.test.ts` 末尾追加(`fakeTool` / `fakeSource` helper 已在文件顶部定义):

```typescript
describe('ToolRegistry — executeTool', () => {
	it('executes a tool by its llm name', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		const result = await registry.executeTool('read_file', { path: 'x' });
		expect(result.success).toBe(true);
		expect(result.result).toEqual({ name: 'read_file', args: { path: 'x' } });
	});

	it('routes a disambiguated name to the correct tool', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const result = await registry.executeTool('search_2', {});
		expect(result.result).toMatchObject({ name: 'search' });
		expect(registry.getToolByLlmName('search_2')?.toolId).toBe('mcp:beta:search');
	});

	it('returns a failure result for an unknown tool name', async () => {
		const registry = new ToolRegistry();
		const result = await registry.executeTool('nope', {});
		expect(result.success).toBe(false);
		expect(result.error).toContain('Tool not found');
	});

	it('catches errors thrown by tool execution', async () => {
		const registry = new ToolRegistry();
		const throwing: SourceTool = {
			definition: { name: 'boom', description: 'boom', parameters: [] },
			execute: async () => {
				throw new Error('kaboom');
			},
		};
		registry.registerSource(fakeSource('cli', 'c1', [throwing]));
		await registry.reload();
		const result = await registry.executeTool('boom', {});
		expect(result.success).toBe(false);
		expect(result.error).toContain('kaboom');
	});
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts -t executeTool`
Expected: FAIL —— `registry.executeTool is not a function`。

- [ ] **Step 3:实现 `executeTool`**

把 `tool-registry.ts` 顶部的类型 import 改为(追加 `ToolResult`):

```typescript
import type {
	RegisteredTool,
	SourceTool,
	ToolResult,
	ToolSourceKind,
} from '@/types/common/tools';
```

在 `ToolRegistry` 类中、`getToolByLlmName` 方法之后、`rebuild` 方法之前,添加:

```typescript
	/** 按 LLM 可见名执行工具;未找到或抛错时返回失败 ToolResult。 */
	async executeTool(llmName: string, args: Record<string, unknown>): Promise<ToolResult> {
		const tool = this.byLlmName.get(llmName);
		if (!tool) {
			return { success: false, error: `Tool not found: ${llmName}` };
		}
		try {
			return await tool.execute(args);
		} catch (err) {
			return {
				success: false,
				error: `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
			};
		}
	}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: PASS —— 全部用例通过(含新增 4 个 executeTool 用例)。

- [ ] **Step 5:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 6:提交**

```bash
git add src/application/tools/tool-registry.ts src/application/tools/__tests__/tool-registry.test.ts
git commit -m "feat: add ToolRegistry.executeTool"
```

---

## Task 4:`ToolRegistry.resolveForAgent`

**Files:**
- Modify: `src/application/tools/tool-registry.ts`
- Modify: `src/application/tools/__tests__/tool-registry.test.ts`

按 `AgentToolAccess` 过滤出某 agent 可用的工具 —— 这是整个工具系统**唯一**的 per-agent 过滤点。本期方法签名直接接受 `AgentToolAccess`;第 3 期接线时调用方传 `agent.toolAccess`。

- [ ] **Step 1:追加失败测试**

在 `tool-registry.test.ts` 顶部 import 区追加 `AgentToolAccess`,即把那一行 import 改为:

```typescript
import type { AgentToolAccess, SourceTool, ToolSourceKind } from '@/types/common/tools';
```

在文件末尾追加:

```typescript
describe('ToolRegistry — resolveForAgent', () => {
	async function registryWithTools(): Promise<ToolRegistry> {
		const registry = new ToolRegistry();
		registry.registerSource(
			fakeSource('builtin', 'builtin', [fakeTool('read_file'), fakeTool('write_file')]),
		);
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		await registry.reload();
		return registry;
	}

	it("includes every tool of a source mapped to 'all'", async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = { sources: { 'builtin:builtin': 'all' } };
		const resolved = registry.resolveForAgent(access);
		expect(resolved.map((t) => t.toolId)).toEqual([
			'builtin:builtin:read_file',
			'builtin:builtin:write_file',
		]);
	});

	it('includes only the listed tool ids when a source maps to an array', async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = {
			sources: { 'builtin:builtin': ['builtin:builtin:write_file'] },
		};
		const resolved = registry.resolveForAgent(access);
		expect(resolved.map((t) => t.toolId)).toEqual(['builtin:builtin:write_file']);
	});

	it('excludes tools whose source is absent from the access map', async () => {
		const registry = await registryWithTools();
		const access: AgentToolAccess = { sources: { 'builtin:builtin': 'all' } };
		const resolved = registry.resolveForAgent(access);
		expect(resolved.some((t) => t.origin.kind === 'mcp')).toBe(false);
	});

	it('returns nothing for an empty access map', async () => {
		const registry = await registryWithTools();
		expect(registry.resolveForAgent({ sources: {} })).toHaveLength(0);
	});
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts -t resolveForAgent`
Expected: FAIL —— `registry.resolveForAgent is not a function`。

- [ ] **Step 3:实现 `resolveForAgent`**

把 `tool-registry.ts` 顶部的类型 import 改为(追加 `AgentToolAccess`):

```typescript
import type {
	AgentToolAccess,
	RegisteredTool,
	SourceTool,
	ToolResult,
	ToolSourceKind,
} from '@/types/common/tools';
```

在 `ToolRegistry` 类中、`executeTool` 方法之后、`rebuild` 方法之前,添加:

```typescript
	/**
	 * 按 agent 的工具访问配置过滤工具。
	 * source 未在配置中 → 不可用;'all' → 全部可用;数组 → toolId 命中才可用。
	 */
	resolveForAgent(access: AgentToolAccess): RegisteredTool[] {
		return this.tools.filter((tool) => {
			const key = sourceKey(tool.origin.kind, tool.origin.sourceId);
			const rule = access.sources[key];
			if (rule === undefined) {
				return false;
			}
			if (rule === 'all') {
				return true;
			}
			return rule.includes(tool.toolId);
		});
	}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: PASS —— 全部用例通过(含新增 4 个 resolveForAgent 用例)。

- [ ] **Step 5:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 6:提交**

```bash
git add src/application/tools/tool-registry.ts src/application/tools/__tests__/tool-registry.test.ts
git commit -m "feat: add ToolRegistry.resolveForAgent"
```

---

## Task 5:`ToolRegistry` — 生命周期(`unregisterSource` / `dispose`)

**Files:**
- Modify: `src/application/tools/tool-registry.ts`
- Modify: `src/application/tools/__tests__/tool-registry.test.ts`

移除单个 source(释放资源、丢弃其工具、对剩余工具重新消歧),以及整体释放。`unregisterSource` 用已缓存的 source 工具 `rebuild()`,不重新调用其它 source 的 `load()`。

- [ ] **Step 1:追加失败测试**

在 `tool-registry.test.ts` 末尾追加:

```typescript
describe('ToolRegistry — unregisterSource', () => {
	it('disposes the source and drops its tools', async () => {
		const registry = new ToolRegistry();
		const disposed: string[] = [];
		registry.registerSource(
			fakeSource('mcp', 'alpha', [fakeTool('search')], {
				dispose: async () => {
					disposed.push('alpha');
				},
			}),
		);
		registry.registerSource(fakeSource('builtin', 'builtin', [fakeTool('read_file')]));
		await registry.reload();
		await registry.unregisterSource('mcp', 'alpha');
		expect(disposed).toEqual(['alpha']);
		expect(registry.getTools().map((t) => t.toolId)).toEqual(['builtin:builtin:read_file']);
	});

	it('re-disambiguates remaining tools after a source is removed', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		expect(registry.getToolByLlmName('search_2')?.toolId).toBe('mcp:beta:search');
		await registry.unregisterSource('mcp', 'alpha');
		expect(registry.getToolByLlmName('search')?.toolId).toBe('mcp:beta:search');
		expect(registry.getToolByLlmName('search_2')).toBeUndefined();
	});

	it('is a no-op for an unknown source', async () => {
		const registry = new ToolRegistry();
		await expect(registry.unregisterSource('cli', 'ghost')).resolves.toBeUndefined();
	});
});

describe('ToolRegistry — dispose', () => {
	it('disposes every source and clears all tools', async () => {
		const registry = new ToolRegistry();
		const disposed: string[] = [];
		registry.registerSource(
			fakeSource('mcp', 'alpha', [fakeTool('search')], {
				dispose: async () => {
					disposed.push('alpha');
				},
			}),
		);
		registry.registerSource(
			fakeSource('cli', 'c1', [fakeTool('run')], {
				dispose: async () => {
					disposed.push('c1');
				},
			}),
		);
		await registry.reload();
		await registry.dispose();
		expect(disposed.sort()).toEqual(['alpha', 'c1']);
		expect(registry.getTools()).toHaveLength(0);
	});
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts -t "unregisterSource|dispose"`
Expected: FAIL —— `registry.unregisterSource is not a function`。

- [ ] **Step 3:实现 `unregisterSource` 与 `dispose`**

在 `ToolRegistry` 类中、`resolveForAgent` 方法之后、`rebuild` 方法之前,添加:

```typescript
	/** 移除一个 source:释放其资源、丢弃其工具,并对剩余工具重新消歧。 */
	async unregisterSource(kind: ToolSourceKind, id: string): Promise<void> {
		const key = sourceKey(kind, id);
		const source = this.sources.get(key);
		if (!source) {
			return;
		}
		try {
			await source.dispose();
		} catch (err) {
			console.error(`[ToolRegistry] dispose failed for ${key}:`, err);
		}
		this.sources.delete(key);
		this.sourceTools.delete(key);
		this.rebuild();
	}

	/** 释放所有 source 并清空 registry。 */
	async dispose(): Promise<void> {
		for (const [key, source] of this.sources) {
			try {
				await source.dispose();
			} catch (err) {
				console.error(`[ToolRegistry] dispose failed for ${key}:`, err);
			}
		}
		this.sources.clear();
		this.sourceTools.clear();
		this.tools = [];
		this.byToolId.clear();
		this.byLlmName.clear();
	}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: PASS —— 全部用例通过(含新增 4 个生命周期用例)。

- [ ] **Step 5:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 6:提交**

```bash
git add src/application/tools/tool-registry.ts src/application/tools/__tests__/tool-registry.test.ts
git commit -m "feat: add ToolRegistry source lifecycle (unregisterSource, dispose)"
```

---

## Task 6:`ToolRegistry` — LLM 格式转换

**Files:**
- Modify: `src/application/tools/tool-registry.ts`
- Modify: `src/application/tools/__tests__/tool-registry.test.ts`

把 `RegisteredTool[]` 转成 OpenAI function-calling 与 Anthropic tools 两种线格式。**关键**:函数名用 `llmName`(去重后的名),而非 `definition.name`。这两个方法接受工具列表参数(通常是 `resolveForAgent` 的结果),不在内部读全量工具。

- [ ] **Step 1:追加失败测试**

在 `tool-registry.test.ts` 末尾追加:

```typescript
describe('ToolRegistry — LLM format conversion', () => {
	async function registryWithParamTool(): Promise<ToolRegistry> {
		const registry = new ToolRegistry();
		const tool: SourceTool = {
			definition: {
				name: 'search',
				description: 'Search the vault',
				parameters: [
					{ name: 'query', type: 'string', description: 'Search query', required: true },
					{ name: 'scope', type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
				],
			},
			execute: async () => ({ success: true }),
		};
		registry.registerSource(fakeSource('builtin', 'builtin', [tool]));
		await registry.reload();
		return registry;
	}

	it('converts tools to OpenAI function format using the llm name', async () => {
		const registry = await registryWithParamTool();
		const fns = registry.toOpenAIFunctions(registry.getTools());
		expect(fns).toEqual([
			{
				type: 'function',
				function: {
					name: 'search',
					description: 'Search the vault',
					parameters: {
						type: 'object',
						properties: {
							query: { type: 'string', description: 'Search query' },
							scope: { type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
						},
						required: ['query'],
					},
				},
			},
		]);
	});

	it('converts tools to Anthropic tool format using the llm name', async () => {
		const registry = await registryWithParamTool();
		const tools = registry.toAnthropicTools(registry.getTools());
		expect(tools).toEqual([
			{
				name: 'search',
				description: 'Search the vault',
				input_schema: {
					type: 'object',
					properties: {
						query: { type: 'string', description: 'Search query' },
						scope: { type: 'string', description: 'Where to search', enum: ['notes', 'all'] },
					},
					required: ['query'],
				},
			},
		]);
	});

	it('uses disambiguated names in converted output', async () => {
		const registry = new ToolRegistry();
		registry.registerSource(fakeSource('mcp', 'alpha', [fakeTool('search')]));
		registry.registerSource(fakeSource('mcp', 'beta', [fakeTool('search')]));
		await registry.reload();
		const names = registry.toOpenAIFunctions(registry.getTools()).map((f) => f.function.name);
		expect(names).toEqual(['search', 'search_2']);
	});
});
```

- [ ] **Step 2:运行测试,确认失败**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts -t "format conversion"`
Expected: FAIL —— `registry.toOpenAIFunctions is not a function`。

- [ ] **Step 3:实现格式转换**

在 `tool-registry.ts` 中,`MAX_LLM_NAME_LENGTH` 常量之后、`export class ToolRegistry` 之前,添加两个返回类型:

```typescript
/** OpenAI function-calling 格式。 */
interface OpenAIFunction {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

/** Anthropic tools 格式。 */
interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}
```

在 `ToolRegistry` 类中、`dispose` 方法之后、`rebuild` 方法之前,添加:

```typescript
	/** 把工具列表转成 OpenAI function-calling 格式(函数名用 llmName)。 */
	toOpenAIFunctions(tools: RegisteredTool[]): OpenAIFunction[] {
		return tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.llmName,
				description: tool.definition.description,
				parameters: toJsonSchema(tool),
			},
		}));
	}

	/** 把工具列表转成 Anthropic tools 格式(工具名用 llmName)。 */
	toAnthropicTools(tools: RegisteredTool[]): AnthropicTool[] {
		return tools.map((tool) => ({
			name: tool.llmName,
			description: tool.definition.description,
			input_schema: toJsonSchema(tool),
		}));
	}
```

在文件末尾、`disambiguate` 函数之后,添加共用的 JSON Schema 转换函数:

```typescript
/** 把工具的参数定义转成 JSON Schema 的 object 形态。 */
function toJsonSchema(tool: RegisteredTool): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	for (const param of tool.definition.parameters) {
		properties[param.name] = {
			type: param.type,
			description: param.description,
			...(param.enum ? { enum: param.enum } : {}),
		};
	}
	return {
		type: 'object',
		properties,
		required: tool.definition.parameters.filter((p) => p.required).map((p) => p.name),
	};
}
```

- [ ] **Step 4:运行测试,确认通过**

Run: `npx jest src/application/tools/__tests__/tool-registry.test.ts`
Expected: PASS —— 全部用例通过(含新增 3 个格式转换用例)。

- [ ] **Step 5:运行 lint**

Run: `npm run lint`
Expected: 无新增 error 或 warning。

- [ ] **Step 6:提交**

```bash
git add src/application/tools/tool-registry.ts src/application/tools/__tests__/tool-registry.test.ts
git commit -m "feat: add ToolRegistry OpenAI and Anthropic format conversion"
```

---

## Task 7:第 1 期收尾验证

**Files:** 无修改 —— 仅全量验证。

确认本期产物完整、未意外接线、构建与全量测试通过。

- [ ] **Step 1:确认未接线**

Run: `git diff --name-only 156ac4f..HEAD`
Expected: 改动文件仅限 `src/types/common/tools.ts`、`src/application/tools/` 目录下的三个文件,以及本计划文档。**关键否定校验** —— 结果中**不得**出现 `main.ts`、`src/application/services/tool-manager.ts`、`src/application/services/chat.service.ts`、`src/types/core/agent.ts`:本期为纯新增,不接线。`156ac4f` 是 spec 提交,本期所有改动均在其后。

- [ ] **Step 2:全量 lint**

Run: `npm run lint`
Expected: 通过,无 error 或 warning。

- [ ] **Step 3:全量构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4:全量测试(对比基线)**

Run: `npx jest 2>&1 | tail -8`
Expected: 新增的 `tool-registry.test.ts` 全部用例通过;整体失败数维持在 pre-existing 基线(约 88 failed / 9 suites failed),本期**不得引入新的失败**。若失败数高于基线,定位并修复本期引入的问题。

- [ ] **Step 5:部署到本地 Obsidian 沙箱(CLAUDE.md 要求)**

Run: `node scripts/deploy.js --local`
Expected: 部署成功。本期未接线,插件运行时行为与重构前一致。

---

## 自检结果(写计划时已核对)

- **Spec 覆盖**:本期对应 spec 第 7 节第 1 期「核心抽象」。`ToolOrigin`/`ToolSource`/`SourceTool`/`RegisteredTool`(spec 4.1)→ Task 1;`AgentToolAccess`(spec 4.5)→ Task 1;`ToolRegistry` 聚合 + 消歧(spec 4.1/4.3/4.4)→ Task 2;`executeTool` → Task 3;`resolveForAgent`(spec 4.6)→ Task 4;`registerSource`/`unregisterSource`/`dispose` + 失败隔离(spec 4.1/4.2)→ Task 2/5;`toOpenAIFunctions`/`toAnthropicTools`(spec 4.1)→ Task 6。`reload()` 在 Task 2 实现。四个 `ToolSource` 实现、config schema、agent 迁移、UI 拆分均属第 2–5 期,不在本期。
- **占位符**:无 TBD/TODO,每个代码步骤均给出完整代码。
- **类型一致性**:`toolId`/`llmName`/`origin`/`definition`/`execute` 在 `RegisteredTool` 定义后,Task 2–6 用法一致;`sourceKey`/`sanitizeLlmName`/`disambiguate`/`toJsonSchema` 签名在引用处一致;`ToolRegistry` 公开方法 `registerSource`/`reload`/`getTools`/`getToolById`/`getToolByLlmName`/`executeTool`/`resolveForAgent`/`unregisterSource`/`dispose`/`toOpenAIFunctions`/`toAnthropicTools` 全程一致。
