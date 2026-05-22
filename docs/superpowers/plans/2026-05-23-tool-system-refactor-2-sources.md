# 工具系统重构 第 2 期:四个 ToolSource 实现 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 builtin/mcp/openapi/cli 四种 `ToolSource`,并从 `openapi-tool-loader.ts` 抽出可复用的 `loadOpenApiTools` 函数;纯新增、不接线。

**Architecture:** 每种工具来源各实现一个 `ToolSource` 类,放在 `src/application/tools/sources/`。`load()` 复用现有的工具类(`ReadFileTool` 等 / `CLITool` / `MCPClient`+`MCPToolWrapper` / OpenAPI 生成逻辑),`dispose()` 释放资源(仅 MCP 需要)。OpenAPI 的加载逻辑从旧 loader 抽成不依赖 `ToolManager` 的纯函数,新旧两条路径共用。

**Tech Stack:** TypeScript(strict)、Jest + ts-jest、路径别名 `@/*`、tab 缩进、代码全英文。

- 日期:2026-05-23
- 总设计:`docs/superpowers/specs/2026-05-22-tool-system-refactor-design.md`
- 分支:`tool-system-refactor`

---

## 背景与边界

第 1 期已完成核心抽象(`ToolSourceKind` / `ToolOrigin` / `SourceTool` / `RegisteredTool` / `AgentToolAccess` 类型、`ToolSource` 接口、`ToolRegistry` 类)。本期**只做四个 source 实现类 + OpenAPI 加载逻辑抽取**,纯新增不接线。

严格不做:
- 不修改 `main.ts`、`tool-manager.ts`、`chat.service.ts`。
- 不删任何旧代码。
- 不处理 MCP `cachedTools` 缓存写回(留待接线期)。
- 唯一允许修改的现有文件:`src/application/services/openapi-tool-loader.ts`(抽出纯函数,保持 `OpenApiToolLoader.reloadConfig` 对外行为不变)。

约束:
- 代码文件(含注释)不得含中文,全英文。
- tab 缩进,TypeScript strict,路径别名 `@/*`。
- 测试放 `__tests__/`,Jest + ts-jest。
- `src/application/tools/sources/` 是新目录。

## 测试基线

执行 `npx jest`:当前 `Test Suites: 9 failed, 11 passed`,`Tests: 88 failed, 184 passed, 272 total`。这 88 个失败是 pre-existing(多为模块解析问题),与本期无关。

**验收标准**:本期新增的所有测试全过;`npx jest` 失败数不超过 88(不引入新失败);`npm run lint` 对新增的生产代码零报错。

## 关键事实(实现时依赖)

- `Tool` 接口(`src/application/services/types.ts`)= `{ definition; execute; provider? }`,是 `SourceTool`(`{ definition; execute }`)的结构超集,`Tool` 实例可直接赋值给 `SourceTool[]`。
- 内置工具构造签名:`new ReadFileTool(app)` 等,全部 `constructor(private _app: App)`。6 个类:`ReadFileTool` / `WriteFileTool` / `ListFilesTool`(在 `file-tools.ts`),`SearchFilesTool` / `CreateNoteTool` / `AppendToNoteTool`(在 `search-tools.ts`)。
- `CLITool` 构造签名:`new CLITool(config: CLIToolConfig)`。
- `MCPClient` 构造签名:`new MCPClient(config: MCPServerConfig)`;方法 `connect()` / `disconnect()` / `listTools(): Promise<MCPTool[]>` / `isConnected()` / `getServerName()`。
- `MCPToolWrapper` 构造签名:`new MCPToolWrapper(mcpTool: MCPTool, mcpClient: MCPClient)`。
- `IFileSystem`(`src/core/interfaces/file-system.interface.ts`):`exists / read / write / mkdir / listRecursive / getDisplayName / isDirectory`。
- jest:`moduleNameMapper` 已映射 `^obsidian$` 与 `^@/(.*)$`;`testMatch` 含 `**/__tests__/**`。`__mocks__/obsidian.ts` 的 `requestUrl` 是 `jest.fn`,`App` 可 `new`。
- 实现 Task 4 时需读 `src/application/services/openapi-tool-loader.ts` 原文(这是重构任务,必须基于原文搬迁逻辑)。

---

## Task 1 — BuiltinToolSource

### 1.1 写失败测试

新建 `src/application/tools/sources/__tests__/builtin-tool-source.test.ts`:

```ts
import { BuiltinToolSource } from '../builtin-tool-source';
import { App } from 'obsidian';

describe('BuiltinToolSource', () => {
	function makeSource(): BuiltinToolSource {
		return new BuiltinToolSource(new App());
	}

	it('exposes builtin kind and id', () => {
		const source = makeSource();
		expect(source.kind).toBe('builtin');
		expect(source.id).toBe('builtin');
		expect(source.label).toBe('Built-in Tools');
	});

	it('loads exactly the six builtin tools', async () => {
		const tools = await makeSource().load();
		const names = tools.map((t) => t.definition.name).sort();
		expect(names).toEqual(
			[
				'append_to_note',
				'create_note',
				'list_files',
				'read_file',
				'search_files',
				'write_file',
			].sort(),
		);
	});

	it('returns tools that each have a definition and an execute function', async () => {
		const tools = await makeSource().load();
		expect(tools).toHaveLength(6);
		for (const tool of tools) {
			expect(typeof tool.definition.name).toBe('string');
			expect(typeof tool.execute).toBe('function');
		}
	});

	it('returns fresh instances on each load call', async () => {
		const source = makeSource();
		const first = await source.load();
		const second = await source.load();
		expect(first[0]).not.toBe(second[0]);
	});

	it('dispose is a no-op that resolves', async () => {
		await expect(makeSource().dispose()).resolves.toBeUndefined();
	});
});
```

注意:`load()` 测试断言的工具名(`read_file` / `write_file` / `list_files` / `search_files` / `create_note` / `append_to_note`)取自现有工具类的 `definition.name`。实现者若发现实际名称不同,以现有工具类的真实 `definition.name` 为准并相应修正测试断言。

### 1.2 确认失败

Run: `npx jest src/application/tools/sources/__tests__/builtin-tool-source.test.ts`
预期:`Cannot find module '../builtin-tool-source'`,套件 fail。

### 1.3 实现

新建 `src/application/tools/sources/builtin-tool-source.ts`:

```ts
/**
 * BuiltinToolSource - the tool source for the plugin's built-in vault tools.
 * Always the single 'builtin' source; load() synchronously constructs the
 * six builtin tool instances; dispose() is a no-op.
 */
import type { App } from 'obsidian';
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import {
	ListFilesTool,
	ReadFileTool,
	WriteFileTool,
} from '@/application/services/file-tools';
import {
	AppendToNoteTool,
	CreateNoteTool,
	SearchFilesTool,
} from '@/application/services/search-tools';

export class BuiltinToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'builtin';
	readonly id: string = 'builtin';
	readonly label: string = 'Built-in Tools';

	constructor(private readonly app: App) {}

	/** Construct fresh instances of the six builtin tools. */
	load(): Promise<SourceTool[]> {
		const tools: SourceTool[] = [
			new ReadFileTool(this.app),
			new WriteFileTool(this.app),
			new ListFilesTool(this.app),
			new SearchFilesTool(this.app),
			new CreateNoteTool(this.app),
			new AppendToNoteTool(this.app),
		];
		return Promise.resolve(tools);
	}

	/** Builtin tools hold no external resources. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
```

### 1.4 确认通过

Run: `npx jest src/application/tools/sources/__tests__/builtin-tool-source.test.ts`
预期:`Tests: 5 passed`。

### 1.5 lint

Run: `npm run lint`
预期:无新增报错。

### 1.6 commit

```
git add src/application/tools/sources/builtin-tool-source.ts src/application/tools/sources/__tests__/builtin-tool-source.test.ts
git commit -m "feat: add BuiltinToolSource"
```

---

## Task 2 — CliToolSource

### 2.1 写失败测试

新建 `src/application/tools/sources/__tests__/cli-tool-source.test.ts`:

```ts
import { CliToolSource } from '../cli-tool-source';
import type { CLIToolConfig } from '@/types/features/cli-tools';

describe('CliToolSource', () => {
	function makeConfig(overrides: Partial<CLIToolConfig> = {}): CLIToolConfig {
		return {
			id: 'cli-1',
			name: 'echo_tool',
			description: 'Echoes input',
			command: 'echo',
			args: ['{{text}}'],
			enabled: true,
			parameters: [
				{ name: 'text', type: 'string', description: 'Text to echo', required: true },
			],
			...overrides,
		};
	}

	it('exposes cli kind with id and label from the config', () => {
		const source = new CliToolSource(makeConfig());
		expect(source.kind).toBe('cli');
		expect(source.id).toBe('cli-1');
		expect(source.label).toBe('echo_tool');
	});

	it('loads exactly one CLITool whose definition matches the config', async () => {
		const tools = await new CliToolSource(makeConfig()).load();
		expect(tools).toHaveLength(1);
		expect(tools[0].definition.name).toBe('echo_tool');
		expect(tools[0].definition.description).toBe('Echoes input');
		expect(tools[0].definition.parameters).toEqual([
			{ name: 'text', type: 'string', description: 'Text to echo', required: true },
		]);
	});

	it('uses distinct ids for distinct configs', () => {
		const a = new CliToolSource(makeConfig({ id: 'a', name: 'tool_a' }));
		const b = new CliToolSource(makeConfig({ id: 'b', name: 'tool_b' }));
		expect(a.id).toBe('a');
		expect(b.id).toBe('b');
	});

	it('returns a tool with an execute function', async () => {
		const tools = await new CliToolSource(makeConfig()).load();
		expect(typeof tools[0].execute).toBe('function');
	});

	it('dispose is a no-op that resolves', async () => {
		await expect(new CliToolSource(makeConfig()).dispose()).resolves.toBeUndefined();
	});
});
```

注意:`loads exactly one CLITool` 用例假定 `CLITool` 把 `config.parameters` 原样作为 `definition.parameters`。若 `CLITool` 对参数做了转换(读 `cli-tool.ts` 的 `convertParameters`),以实际转换结果修正该断言。

### 2.2 确认失败

Run: `npx jest src/application/tools/sources/__tests__/cli-tool-source.test.ts`
预期:`Cannot find module '../cli-tool-source'`。

### 2.3 实现

新建 `src/application/tools/sources/cli-tool-source.ts`:

```ts
/**
 * CliToolSource - the tool source for a single configured CLI tool.
 * One instance per CLIToolConfig; load() builds the one CLITool;
 * dispose() is a no-op.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { CLIToolConfig } from '@/types/features/cli-tools';
import { CLITool } from '@/application/services/cli-tool';

export class CliToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'cli';
	readonly id: string;
	readonly label: string;

	constructor(private readonly config: CLIToolConfig) {
		this.id = config.id;
		this.label = config.name;
	}

	/** Build the single CLITool described by this config. */
	load(): Promise<SourceTool[]> {
		return Promise.resolve([new CLITool(this.config)]);
	}

	/** CLI tools spawn processes per execution; nothing persistent to release. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
```

### 2.4 确认通过

Run: `npx jest src/application/tools/sources/__tests__/cli-tool-source.test.ts`
预期:`Tests: 5 passed`。

### 2.5 lint

Run: `npm run lint`
预期:无新增报错。

### 2.6 commit

```
git add src/application/tools/sources/cli-tool-source.ts src/application/tools/sources/__tests__/cli-tool-source.test.ts
git commit -m "feat: add CliToolSource"
```

---

## Task 3 — McpToolSource

`McpToolSource.load()` 需 `new MCPClient(config)` -> `connect()` -> `listTools()` -> 用 `MCPToolWrapper` 包装。测试必须 mock `MCPClient` 避免真实 spawn 子进程。`MCPToolWrapper` 不 mock(纯转换),但它构造时调 `mcpClient.getServerName()`,故 mock client 必须实现该方法。

### 3.1 写失败测试

新建 `src/application/tools/sources/__tests__/mcp-tool-source.test.ts`:

```ts
import { McpToolSource } from '../mcp-tool-source';
import { MCPClient } from '@/application/services/mcp-client';
import type { MCPTool } from '@/application/services/mcp-client';
import type { MCPServerConfig } from '@/types/features/mcp';

jest.mock('@/application/services/mcp-client');

/** Typed access to the auto-mocked MCPClient constructor. */
const MockedMCPClient = MCPClient as jest.MockedClass<typeof MCPClient>;

/** Sample MCP tool definitions returned by a fake server. */
const SAMPLE_TOOLS: MCPTool[] = [
	{
		name: 'search_docs',
		description: 'Search documents',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Query text' } },
			required: ['query'],
		},
	},
	{
		name: 'fetch_page',
		description: 'Fetch a page',
		inputSchema: { type: 'object', properties: {} },
	},
];

/** Build a fake MCPClient instance with overridable behaviour. */
function buildClientMock(overrides: Partial<jest.Mocked<MCPClient>> = {}): jest.Mocked<MCPClient> {
	return {
		connect: jest.fn().mockResolvedValue(undefined),
		disconnect: jest.fn().mockResolvedValue(undefined),
		listTools: jest.fn().mockResolvedValue(SAMPLE_TOOLS),
		callTool: jest.fn().mockResolvedValue('ok'),
		isConnected: jest.fn().mockReturnValue(true),
		getServerName: jest.fn().mockReturnValue('test-server'),
		...overrides,
	} as unknown as jest.Mocked<MCPClient>;
}

function makeConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
	return {
		name: 'test-server',
		command: 'node',
		args: ['server.js'],
		enabled: true,
		...overrides,
	};
}

beforeEach(() => {
	MockedMCPClient.mockClear();
});

describe('McpToolSource', () => {
	it('exposes mcp kind with id and label derived from the server name', () => {
		const source = new McpToolSource(makeConfig());
		expect(source.kind).toBe('mcp');
		expect(source.id).toBe('test-server');
		expect(source.label).toBe('test-server');
	});

	it('connects and wraps every tool returned by listTools', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		const tools = await source.load();

		expect(client.connect).toHaveBeenCalledTimes(1);
		expect(client.listTools).toHaveBeenCalledTimes(1);
		expect(tools.map((t) => t.definition.name)).toEqual(['search_docs', 'fetch_page']);
	});

	it('produces wrapped tools whose execute delegates to callTool', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		const tools = await source.load();
		const result = await tools[0].execute({ query: 'hello' });

		expect(client.callTool).toHaveBeenCalledWith('search_docs', { query: 'hello' });
		expect(result.success).toBe(true);
	});

	it('propagates a connect failure so the registry can isolate it', async () => {
		const client = buildClientMock({
			connect: jest.fn().mockRejectedValue(new Error('connection refused')),
		});
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await expect(source.load()).rejects.toThrow('connection refused');
	});

	it('disconnects the client on dispose', async () => {
		const client = buildClientMock();
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await source.load();
		await source.dispose();

		expect(client.disconnect).toHaveBeenCalledTimes(1);
	});

	it('dispose is a safe no-op when load was never called', async () => {
		const source = new McpToolSource(makeConfig());
		await expect(source.dispose()).resolves.toBeUndefined();
	});

	it('disconnects on dispose even after a failed load', async () => {
		const client = buildClientMock({
			connect: jest.fn().mockRejectedValue(new Error('connection refused')),
		});
		MockedMCPClient.mockImplementation(() => client);

		const source = new McpToolSource(makeConfig());
		await expect(source.load()).rejects.toThrow('connection refused');
		await expect(source.dispose()).resolves.toBeUndefined();
		expect(client.disconnect).toHaveBeenCalledTimes(1);
	});
});
```

注意:`produces wrapped tools whose execute delegates to callTool` 用例只断言 `callTool` 被正确调用且 `result.success === true`。`MCPToolWrapper.execute` 如何把 `callTool` 的返回值包成 `ToolResult` 由其自身实现决定;实现者跑测试时若 `result.success` 的值与预期不符,应读 `mcp-tool-wrapper.ts` 的 `execute` 实现据实修正断言(不要为迁就测试去改 `MCPToolWrapper`)。

### 3.2 确认失败

Run: `npx jest src/application/tools/sources/__tests__/mcp-tool-source.test.ts`
预期:`Cannot find module '../mcp-tool-source'`。

### 3.3 实现

新建 `src/application/tools/sources/mcp-tool-source.ts`:

```ts
/**
 * McpToolSource - the tool source for a single MCP server.
 * One instance per MCPServerConfig; load() connects the MCP client, lists
 * the server's tools, and wraps each one; dispose() disconnects the client.
 *
 * Phase 2 scope: this source does not write back the cachedTools cache;
 * that wiring is deferred to a later phase.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { MCPServerConfig } from '@/types/features/mcp';
import { MCPClient } from '@/application/services/mcp-client';
import { MCPToolWrapper } from '@/application/services/mcp-tool-wrapper';

export class McpToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'mcp';
	readonly id: string;
	readonly label: string;

	/** Lazily created on load(); kept so dispose() can release the connection. */
	private client: MCPClient | null = null;

	constructor(private readonly config: MCPServerConfig) {
		this.id = config.name;
		this.label = config.name;
	}

	/**
	 * Connect to the MCP server and wrap every tool it exposes.
	 * A connection or listing failure is allowed to propagate so the
	 * ToolRegistry can isolate this source and keep the others.
	 */
	async load(): Promise<SourceTool[]> {
		const client = new MCPClient(this.config);
		this.client = client;
		await client.connect();
		const mcpTools = await client.listTools();
		return mcpTools.map((mcpTool) => new MCPToolWrapper(mcpTool, client));
	}

	/** Disconnect the MCP client if one was created. */
	async dispose(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
		}
	}
}
```

### 3.4 确认通过

Run: `npx jest src/application/tools/sources/__tests__/mcp-tool-source.test.ts`
预期:`Tests: 7 passed`。

### 3.5 lint

Run: `npm run lint`
预期:无新增报错。

### 3.6 commit

```
git add src/application/tools/sources/mcp-tool-source.ts src/application/tools/sources/__tests__/mcp-tool-source.test.ts
git commit -m "feat: add McpToolSource"
```

---

## Task 4 — OpenAPI 加载逻辑抽取 + OpenApiToolSource

分两步:先把 `openapi-tool-loader.ts` 中不依赖 `ToolManager` 的「spec 加载 + 工具生成」逻辑抽成导出的纯函数 `loadOpenApiTools`,并让 `OpenApiToolLoader.reloadConfig` 委托它(对外行为不变);再实现 `OpenApiToolSource` 复用该函数。

**实现者须先通读 `src/application/services/openapi-tool-loader.ts` 原文。** 这是重构任务 —— 把现有的无状态方法逐行搬为模块级函数,逻辑不变,只去掉 `this.` 前缀。

### 重构方案

`openapi-tool-loader.ts` 中 `OpenApiOperationTool` 类与下列方法**不依赖** `ToolManager`:`loadSpec` / `loadLocalSpec` / `loadRemoteSpec` / `getCachePaths` / `extractServerUrl` / `sanitizeNamespace` / `generateTools` / `buildParameters` / `buildRequestBody` / `buildDescription` / `buildOperationId` / `mapSchemaType` / `describeSchema`。只有 `reloadAll` / `reloadConfig` / `removeConfig` 与 `providerMap` 字段触碰 `ToolManager`。

做法:新增导出的纯函数 `loadOpenApiTools(config, fileSystem, pluginDataPath, options?): Promise<Tool[]>`,把无状态逻辑收进它及一组模块级 helper(由原类方法逐行搬迁而来)。`OpenApiToolLoader.reloadConfig` 改为内部调 `loadOpenApiTools(...)` 拿工具列表,保留它原有的 `removeToolsByProvider` / `registerTool` / `enableTool` / `providerMap` 维护 —— 签名、返回值、副作用都不变。

### 4.1 写失败测试 — loadOpenApiTools

新建 `src/application/services/__tests__/openapi-tool-loader.load-fn.test.ts`:

```ts
import { loadOpenApiTools } from '../openapi-tool-loader';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';

/** Minimal in-memory IFileSystem for spec loading tests. */
function makeFileSystem(files: Record<string, string>): IFileSystem {
	return {
		exists: async (p: string) => p in files,
		read: async (p: string) => {
			if (!(p in files)) {
				throw new Error(`not found: ${p}`);
			}
			return files[p];
		},
		write: async () => undefined,
		mkdir: async () => undefined,
		listRecursive: async () => Object.keys(files),
		getDisplayName: (p: string) => p,
		isDirectory: async () => false,
	};
}

/** A tiny but valid OpenAPI document with two operations. */
const SPEC = JSON.stringify({
	info: { title: 'Demo API' },
	servers: [{ url: 'https://api.example.com' }],
	paths: {
		'/items': {
			get: {
				operationId: 'listItems',
				summary: 'List items',
				parameters: [
					{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
				],
			},
		},
		'/items/{id}': {
			get: {
				operationId: 'getItem',
				summary: 'Get one item',
				parameters: [
					{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
				],
			},
		},
	},
});

function makeConfig(overrides: Partial<OpenApiToolConfig> = {}): OpenApiToolConfig {
	return {
		id: 'demo',
		name: 'Demo API',
		enabled: true,
		sourceType: 'file',
		specPath: 'specs/demo.json',
		...overrides,
	};
}

describe('loadOpenApiTools', () => {
	it('generates one tool per operation from a local spec', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		expect(tools).toHaveLength(2);
	});

	it('returns an empty list when the config is disabled', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig({ enabled: false }), fs, '/plugin/data');
		expect(tools).toEqual([]);
	});

	it('tags each generated tool with the openapi provider id', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		for (const tool of tools) {
			expect(tool.provider).toBe('openapi:demo');
		}
	});

	it('throws when the spec JSON is invalid', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': 'not-json' });
		await expect(loadOpenApiTools(makeConfig(), fs, '/plugin/data')).rejects.toThrow(
			'Failed to parse OpenAPI JSON specification',
		);
	});

	it('produces tools whose definitions carry the operation parameters', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const tools = await loadOpenApiTools(makeConfig(), fs, '/plugin/data');
		const getItem = tools.find((t) => t.definition.parameters.some((p) => p.name === 'id'));
		expect(getItem).toBeDefined();
	});
});
```

注意:`'Failed to parse OpenAPI JSON specification'` 这条错误消息字符串须与实现里 `loadOpenApiTools` 抛出的消息一致。实现者落实 4.3 时若选用不同措辞,同步修正此断言。`tags each generated tool with the openapi provider id` 假定 provider 格式为 `openapi:<id>`(与现有 `OpenApiOperationTool` 一致);若读原文发现格式不同,据实修正。

### 4.2 确认失败

Run: `npx jest src/application/services/__tests__/openapi-tool-loader.load-fn.test.ts`
预期:`loadOpenApiTools is not a function` 或导入错误,套件 fail。

### 4.3 实现重构

修改 `src/application/services/openapi-tool-loader.ts`:

1. 新增导出的纯函数 `loadOpenApiTools(config, fileSystem, pluginDataPath, options?): Promise<Tool[]>`,行为:
   - `config.id` 为空 -> 抛 `Error('OpenAPI config is missing an id')`。
   - `config.enabled === false` -> 返回 `[]`。
   - 读取 spec(本地文件或远程 URL + 磁盘缓存),`JSON.parse` 失败 -> 抛 `Error('Failed to parse OpenAPI JSON specification')`。
   - 解析 baseUrl(`config.baseUrl` 优先,否则取 spec 的 server);无法确定 -> 抛 `Error('Unable to determine base URL...')`。
   - 调用 `generateTools(...)` 返回 `Tool[]`。
2. 把原类中无状态方法 `loadSpec` / `loadLocalSpec` / `loadRemoteSpec` / `getCachePaths` / `extractServerUrl` / `sanitizeNamespace` / `generateTools` / `buildParameters` / `buildRequestBody` / `buildDescription` / `buildOperationId` / `mapSchemaType` / `describeSchema` **逐行搬为模块级私有函数**(去掉 `this.` 前缀,把原本是 `this.fileSystem` / `this.pluginDataPath` 的引用改为函数参数;逻辑、算法、命名一字不改)。`OpenApiOperationTool` 类保持原样。
3. `OpenApiToolLoader.reloadConfig` 改为委托:

```ts
async reloadConfig(config: OpenApiToolConfig, options?: ReloadOptions): Promise<number> {
	if (!config.id) {
		throw new Error('OpenAPI config is missing an id');
	}

	const previousProvider = this.providerMap.get(config.id);
	if (previousProvider) {
		this.toolManager.removeToolsByProvider(previousProvider);
		this.providerMap.delete(config.id);
	}

	const tools = await loadOpenApiTools(config, this.fileSystem, this.pluginDataPath, options);
	if (tools.length === 0) {
		return 0;
	}

	for (const tool of tools) {
		this.toolManager.registerTool(tool);
		this.toolManager.enableTool(tool.definition.name);
	}

	const providerId = `openapi:${config.id}`;
	this.providerMap.set(config.id, providerId);
	return tools.length;
}
```

   `reloadAll` / `removeConfig` / 构造函数 / 字段保持不变(`reloadAll` 调 `reloadConfig`,行为透传)。删除已搬为模块函数的旧私有方法,避免重复定义。

`loadOpenApiTools` 主函数参考实现(helper 由步骤 2 搬迁得到):

```ts
/**
 * Load an OpenAPI spec for the given config and generate its HTTP tools.
 * This is the ToolManager-free core shared by the legacy OpenApiToolLoader
 * and the new OpenApiToolSource. Returns an empty list for a disabled config.
 */
export async function loadOpenApiTools(
	config: OpenApiToolConfig,
	fileSystem: IFileSystem,
	pluginDataPath: string,
	options?: ReloadOptions,
): Promise<Tool[]> {
	if (!config.id) {
		throw new Error('OpenAPI config is missing an id');
	}
	if (!config.enabled) {
		return [];
	}

	const specContent = await loadSpec(config, fileSystem, pluginDataPath, options);
	let parsedSpec: OpenApiDocumentLike;
	try {
		parsedSpec = JSON.parse(specContent) as OpenApiDocumentLike;
	} catch (_error) {
		throw new Error('Failed to parse OpenAPI JSON specification');
	}

	const baseUrl = config.baseUrl?.trim() || extractServerUrl(parsedSpec);
	if (!baseUrl) {
		throw new Error(
			'Unable to determine base URL. Provide a Base URL override or add a server entry in the spec.',
		);
	}

	const namespace = sanitizeNamespace(config.name || config.id);
	const providerId = `openapi:${config.id}`;
	const auth: AuthConfig = {
		type: config.authType ?? 'none',
		key: config.authKey?.trim() || undefined,
		value: config.authValue?.trim() || undefined,
	};

	return generateTools(parsedSpec, baseUrl, providerId, namespace, auth);
}
```

(`OpenApiDocumentLike` / `AuthConfig` / `ReloadOptions` / `HttpMethod` 等类型沿用 `openapi-tool-loader.ts` 中现有定义;若原文用的是内联类型,保持一致。)

### 4.4 确认通过(loadOpenApiTools)

Run: `npx jest src/application/services/__tests__/openapi-tool-loader.load-fn.test.ts`
预期:`Tests: 5 passed`。
再 Run: `npx jest openapi-tool-loader`
预期:若存在旧 `openapi-tool-loader` 测试,保持全过(`reloadConfig` 对外行为不变)。

### 4.5 写失败测试 — OpenApiToolSource

新建 `src/application/tools/sources/__tests__/openapi-tool-source.test.ts`:

```ts
import { OpenApiToolSource } from '../openapi-tool-source';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';

/** Minimal in-memory IFileSystem. */
function makeFileSystem(files: Record<string, string>): IFileSystem {
	return {
		exists: async (p: string) => p in files,
		read: async (p: string) => {
			if (!(p in files)) {
				throw new Error(`not found: ${p}`);
			}
			return files[p];
		},
		write: async () => undefined,
		mkdir: async () => undefined,
		listRecursive: async () => Object.keys(files),
		getDisplayName: (p: string) => p,
		isDirectory: async () => false,
	};
}

const SPEC = JSON.stringify({
	info: { title: 'Demo API' },
	servers: [{ url: 'https://api.example.com' }],
	paths: {
		'/items': { get: { operationId: 'listItems', summary: 'List items' } },
	},
});

function makeConfig(overrides: Partial<OpenApiToolConfig> = {}): OpenApiToolConfig {
	return {
		id: 'demo',
		name: 'Demo API',
		enabled: true,
		sourceType: 'file',
		specPath: 'specs/demo.json',
		...overrides,
	};
}

describe('OpenApiToolSource', () => {
	it('exposes openapi kind with id and label from the config', () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		expect(source.kind).toBe('openapi');
		expect(source.id).toBe('demo');
		expect(source.label).toBe('Demo API');
	});

	it('loads tools generated from the spec', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		const tools = await source.load();
		expect(tools).toHaveLength(1);
		expect(typeof tools[0].execute).toBe('function');
	});

	it('returns an empty list for a disabled config', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig({ enabled: false }), fs, '/plugin/data');
		expect(await source.load()).toEqual([]);
	});

	it('propagates a spec parse failure so the registry can isolate it', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': 'not-json' });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		await expect(source.load()).rejects.toThrow('Failed to parse OpenAPI JSON specification');
	});

	it('dispose is a no-op that resolves', async () => {
		const fs = makeFileSystem({ 'specs/demo.json': SPEC });
		const source = new OpenApiToolSource(makeConfig(), fs, '/plugin/data');
		await expect(source.dispose()).resolves.toBeUndefined();
	});
});
```

### 4.6 确认失败

Run: `npx jest src/application/tools/sources/__tests__/openapi-tool-source.test.ts`
预期:`Cannot find module '../openapi-tool-source'`。

### 4.7 实现 OpenApiToolSource

新建 `src/application/tools/sources/openapi-tool-source.ts`:

```ts
/**
 * OpenApiToolSource - the tool source for a single OpenAPI spec.
 * One instance per OpenApiToolConfig; load() fetches the spec and generates
 * HTTP tools via the shared loadOpenApiTools function; dispose() is a no-op.
 */
import type { ToolSource } from '../tool-source';
import type { SourceTool, ToolSourceKind } from '@/types/common/tools';
import type { IFileSystem } from '@/core/interfaces';
import type { OpenApiToolConfig } from '@/types/features/openapi-tools';
import { loadOpenApiTools } from '@/application/services/openapi-tool-loader';

export class OpenApiToolSource implements ToolSource {
	readonly kind: ToolSourceKind = 'openapi';
	readonly id: string;
	readonly label: string;

	constructor(
		private readonly config: OpenApiToolConfig,
		private readonly fileSystem: IFileSystem,
		private readonly pluginDataPath: string,
	) {
		this.id = config.id;
		this.label = config.name;
	}

	/**
	 * Load the OpenAPI spec and generate its HTTP tools.
	 * A fetch or parse failure is allowed to propagate so the ToolRegistry
	 * can isolate this source and keep the others.
	 */
	async load(): Promise<SourceTool[]> {
		return await loadOpenApiTools(this.config, this.fileSystem, this.pluginDataPath);
	}

	/** OpenAPI tools issue stateless HTTP requests; nothing to release. */
	dispose(): Promise<void> {
		return Promise.resolve();
	}
}
```

`@/core/interfaces` 的 `IFileSystem` 导入路径沿用 `openapi-tool-loader.ts` 当前所用路径(实现者核对原文 import 行)。

### 4.8 确认通过

Run: `npx jest src/application/tools/sources/__tests__/openapi-tool-source.test.ts`
预期:`Tests: 5 passed`。

### 4.9 lint

Run: `npm run lint`
预期:`openapi-tool-loader.ts`(被修改)与新增的 `openapi-tool-source.ts` 均无报错。重点检查重构后无未使用的导入/变量。

### 4.10 commit

```
git add src/application/services/openapi-tool-loader.ts src/application/services/__tests__/openapi-tool-loader.load-fn.test.ts src/application/tools/sources/openapi-tool-source.ts src/application/tools/sources/__tests__/openapi-tool-source.test.ts
git commit -m "refactor: extract loadOpenApiTools and add OpenApiToolSource"
```

---

## Task 5 — 收尾验证

- [ ] **Step 1:跑四个 source 的全部测试**

Run: `npx jest src/application/tools/sources`
预期:`Test Suites: 4 passed`,所有 source 测试通过。

- [ ] **Step 2:跑 OpenAPI loader 相关测试**

Run: `npx jest openapi-tool-loader`
预期:`loadOpenApiTools` 测试全过;旧 loader 测试(若存在)保持全过。

- [ ] **Step 3:全量测试,核对基线**

Run: `npx jest 2>&1 | tail -8`
预期:失败数**仍为 88**(不增不减);若 > 88,定位并修复本期引入的回归。

- [ ] **Step 4:全量 lint**

Run: `npm run lint`
预期:0 error。

- [ ] **Step 5:全量构建**

Run: `npm run build`
预期:构建成功,无 TypeScript 编译错误。这一步确认 `Tool` -> `SourceTool` 的结构赋值、`@/*` 别名、strict 模式类型全部正确。

- [ ] **Step 6:部署本地沙箱(CLAUDE.md 要求)**

Run: `node scripts/deploy.js --local`
预期:部署成功。本期未接线,运行时行为与重构前一致。

---

## 风险与注意事项

1. **`Tool` 赋值给 `SourceTool[]`**:`Tool` 多一个可选 `provider?`,是 `SourceTool` 超集,TypeScript 允许直接赋值。
2. **MCP 测试不能真实连接**:必须 `jest.mock('@/application/services/mcp-client')`。`MCPToolWrapper` 不 mock,但它构造时调 `mcpClient.getServerName()`,mock client 已含该方法。
3. **`McpToolSource.dispose()` 在失败 load 后**:`load()` 内 `new MCPClient` 之后立即把引用存入 `this.client`,即便 `connect()` 抛错,`dispose()` 仍能调 `disconnect()`。
4. **OpenAPI 重构的行为等价性**:`reloadConfig` 对外签名、返回值、副作用必须逐项不变。验收靠旧 loader 测试(若有)回归 + 全量基线失败数不变。
5. **eslint 忽略测试**:`eslint.config.mts` 的 `ignores` 含 `**/__tests__/**`,`npm run lint` 只校验生产代码;测试文件仍应保持 tab 缩进与英文。
6. **测试断言中的工具名/错误消息**:Task 1/2/4 的部分断言依赖现有工具类的真实 `definition.name` 与错误消息措辞;实现者 TDD 时以现有代码 / 自己实现的措辞为准据实校准,不要为迁就断言去改既有工具类。
