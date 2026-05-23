# 工具系统重构 第 4 期:Config Schema 统一 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把所有工具来源的持久化 config 统一到一个 `config.tools.*` 命名空间下。运行时 `PluginSettings` 扁平字段不变。

- 日期:2026-05-23
- 总设计:`docs/superpowers/specs/2026-05-22-tool-system-refactor-design.md` 第 5 节
- 分支:`tool-system-refactor`

## 背景

Phase 3 已完成(ToolRegistry 接线 + chat.service 收敛)。运行时 settings 扁平字段(`mcpServers`/`builtInTools` 等)保持不变 —— 本期只改持久化 config 形状和两个映射函数。

改动文件:
- `config/default/settings.json` — 更新默认 JSON
- `src/types/settings.ts` — 更新 `UserConfig` 接口 + `userConfigToPluginSettings` 双重迁移读取 + `pluginSettingsToUserConfig` 写入新结构
- `src/__tests__/config/config-migration.test.ts` — **新增** 14 个迁移测试

不改:`main.ts`、`PluginSettings` 接口、任何运行时代码。

约束:代码全英文,tab 缩进。`npm run build` 通过。基线约 88 pre-existing 失败,不增。

## Task 1:默认 JSON + UserConfig 接口

### 1.1 更新 `config/default/settings.json`

把顶级 `"mcp"` 键移进 `"tools"` 下,重命名字段:

```json
"tools": {
    "builtin": [
        { "type": "read_file", "enabled": true },
        { "type": "write_file", "enabled": true },
        { "type": "list_files", "enabled": true },
        { "type": "search_files", "enabled": true },
        { "type": "create_note", "enabled": true },
        { "type": "append_to_note", "enabled": true }
    ],
    "mcp": {
        "servers": [],
        "registries": [
            { "name": "Official MCP Registry", "enabled": true, "url": "https://registry.modelcontextprotocol.io/v0/servers" }
        ]
    },
    "openapi": [],
    "cli": []
}
```

删除顶级 `"mcp"` 键,删除旧 `"tools.builtIn"`/`"tools.openApi"`。

### 1.2 更新 `UserConfig` 接口(`src/types/settings.ts`)

删除 `mcp` 字段(line 124-127),把 `tools` 改为(line 128-132):

```ts
tools: {
    builtin: BuiltInToolConfig[];
    mcp: {
        servers: MCPServerConfig[];
        registries: MCPRegistry[];
    };
    openapi: OpenApiToolConfig[];
    cli: CLIToolConfig[];
};
```

### 1.3 验证

`npm run build` — 如有 `DEFAULT_USER_CONFIG` 类型错误,先修 JSON 再修接口(顺序一致)即可。

## Task 2:映射函数迁移

### 2.1 `userConfigToPluginSettings` 双重读取

把 lines 199-213 的工具相关读取改为新路径优先 + 旧路径 fallback:

```ts
const source = userConfig ?? DEFAULT_USER_CONFIG;

// Phase 4: read from new config.tools.* paths first, fall back to old paths,
// then default.
const rawSource = source as Record<string, unknown>;
const oldMcp = rawSource?.['mcp'] as
    { servers?: MCPServerConfig[]; registries?: MCPRegistry[] } | undefined;
const oldTools = rawSource?.['tools'] as
    { builtIn?: BuiltInToolConfig[]; openApi?: OpenApiToolConfig[]; cli?: CLIToolConfig[] } | undefined;

const mcpServers = deepClone(
    source.tools?.mcp?.servers ??
    oldMcp?.servers ??
    DEFAULT_USER_CONFIG.tools.mcp.servers
);
const mcpRegistries = deepClone(
    source.tools?.mcp?.registries ??
    oldMcp?.registries ??
    DEFAULT_USER_CONFIG.tools.mcp.registries
);
const builtInTools = deepClone(
    source.tools?.builtin ??
    oldTools?.builtIn ??
    DEFAULT_USER_CONFIG.tools.builtin
);
const openApiTools = normalizeOpenApiConfigs(
    source.tools?.openapi ??
    oldTools?.openApi ??
    DEFAULT_USER_CONFIG.tools.openapi
);
const cliTools = deepClone(
    source.tools?.cli ??
    oldTools?.cli ?? []
);
```

更新 4 处 `DEFAULT_USER_CONFIG` 引用:`DEFAULT_USER_CONFIG.tools.mcp.servers` / `tools.mcp.registries` / `tools.builtin` / `tools.openapi`。

### 2.2 `pluginSettingsToUserConfig` 写入新结构

把 lines 308-316 改为:

```ts
tools: {
    builtin: deepClone(settings.builtInTools ?? []),
    mcp: {
        servers: [],
        registries: deepClone(settings.mcpRegistries ?? []),
    },
    openapi: deepClone(settings.openApiTools ?? []),
    cli: deepClone(settings.cliTools ?? []),
},
```

### 2.3 验证

`npm run build` — 通过。

## Task 3:迁移测试 + 收尾

### 3.1 新建 `src/__tests__/config/config-migration.test.ts`

14 个测试,覆盖:
- 新路径读取(mcp/builtin/openapi/cli 各一个测试)
- 旧路径 fallback(4 个测试)
- 默认值 fallback(空 config)
- 写入新结构(shape 断言 + 旧 top-level mcp 不存在)
- round-trip 保真(新→旧→新 + 旧→新→写形状)

完整测试代码见 plan agent 输出(约 350 行)。实现者直接抄入,保证 tab 缩进、全英文。

### 3.2 确认

```
npx jest -- config/config-migration 2>&1 | tail -5
```
预期:14 passed。

```
npx jest 2>&1 | tail -5
```
预期:失败数不超 88。

```
npm run build && npm run lint
```
预期:build 通过;lint 对改动文件无新增 error。

```
node scripts/deploy.js --local
```
预期:部署成功。

### 3.3 commit

```
git add config/default/settings.json src/types/settings.ts src/__tests__/config/config-migration.test.ts
git commit -m "feat: unify tool config schema under config.tools"
```
