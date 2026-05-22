# 工具系统重构设计

- 日期:2026-05-22
- 主题:Tool System Refactor —— 把分散的四种工具来源统一到一个插件化的 `ToolRegistry` 架构下
- 类型:内部架构重构(无用户可见功能变更,除一处明确标注的行为升级)

## 1. 目标

把当前散乱、不对称、字符串硬编码的工具系统重构成一个**插件化**架构:

- 四种工具来源(builtin / mcp / openapi / cli)实现统一的 `ToolSource` 接口,registry 不针对任何一种做特判。
- 用结构化的 `ToolOrigin` 取代字符串标签 `provider`。
- MCP 的连接生命周期从 registry 移出,收进 `McpToolSource`。
- per-agent 工具启用从 5 个字段收敛成 1 个统一模型。
- 工具过滤逻辑收敛到唯一一处。
- 持久化 config schema 统一到一个 `tools` 命名空间。
- 拆分 1156 行的 `tools-tab.ts`。

成功标准:重构后所有现有工具(含已配置的 MCP server / OpenAPI / CLI 工具)行为不变;现有 agent 配置经透明迁移后等价;lint / build / 测试全部通过。

## 2. 现状与问题

四种工具来源,全部注册进一个扁平的 `ToolManager`:

- **Builtin** —— 文件操作 + 搜索/笔记工具(`file-tools.ts`、`search-tools.ts`)
- **MCP** —— Model Context Protocol server(`mcp-client.ts`、`mcp-tool-wrapper.ts`、`mcp-service.ts`)
- **OpenAPI** —— 由 spec 生成的 HTTP 工具(`openapi-tool-loader.ts`)
- **CLI** —— 本地命令行工具(`cli-tool.ts`、`cli-tool-loader.ts`)

问题:

1. `ToolManager` 内置 MCP 专属代码(`registerMCPServer`、`unregisterMCPServer`、`mcpClients`),而 OpenAPI/CLI 走外部 loader + 通用 `registerTool` —— 不对称。
2. `provider` 是字符串标签(`'built-in'`、`'mcp:<server>'`、`'cli:<id>'`、`'openapi:<id>'`),靠 `substring(4)`、`startsWith` 解析 —— 脆弱。
3. config 分裂:`config.mcp.{servers,registries}` 在 `tools` 命名空间外,`config.tools.{builtIn,openApi,cli}` 在里面。
4. per-agent 启用用 5 个字段(`enabledBuiltInTools`、`enabledMcpServers`、`enabledMcpTools`、`enabledCLITools`、`enabledAllCLITools`),OpenAPI 甚至用全局 `allowOpenApiTools`。
5. 过滤逻辑分散在两处:`ToolManager.getAllTools()`(全局 enabled)+ `chat.service` 的 per-agent 过滤。
6. 工具名是 `Map` 的 key,跨来源同名工具静默覆盖。
7. `tools-tab.ts` 有 1156 行。

## 3. 决策汇总

本设计经如下确认:

- **方案** —— 插件化内核(方案 C),但注册入口仅对本插件内部公开,不对外承诺稳定 API,不支持用户脚本来源。
- **范围** —— 核心 registry 重构 + config schema 统一 + per-agent 模型统一 + chat.service 过滤收敛 + settings UI 拆分,全部在内。
- **per-agent 粒度** —— 每工具 + 每来源快捷开关。
- **工具命名** —— LLM 看到工具原名;跨来源同名冲突时确定性加后缀消歧。

## 4. 架构设计

新建目录 `src/application/tools/` 归拢工具系统。

### 4.1 核心抽象

```ts
type ToolSourceKind = 'builtin' | 'mcp' | 'openapi' | 'cli';

interface ToolOrigin {
  kind: ToolSourceKind;
  sourceId: string;   // builtin → 'builtin';mcp → server 名;openapi/cli → config.id
}

// source 的 load() 产出的原始工具(等于今天的 Tool 接口形状,不含 origin/toolId/llmName)
interface SourceTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

// registry 聚合后的工具
interface RegisteredTool {
  toolId: string;     // 全局唯一内部键 = `${kind}:${sourceId}:${rawName}`
  llmName: string;    // LLM 看到的名字(见 4.4 消歧)
  origin: ToolOrigin;
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

`ToolSource` 接口 —— 四种来源全部实现它:

```ts
interface ToolSource {
  readonly kind: ToolSourceKind;
  readonly id: string;
  readonly label: string;
  load(): Promise<SourceTool[]>;   // 加载工具
  dispose(): Promise<void>;         // 释放资源
}
```

`ToolRegistry` —— 取代 `ToolManager`,只做四件事:持有 source、聚合、消歧、查询:

```ts
class ToolRegistry {
  registerSource(source: ToolSource): void;        // 对内公开;任何新来源都走这里
  unregisterSource(kind: ToolSourceKind, id: string): Promise<void>;
  reload(): Promise<void>;                          // 对所有 source 调 load(),重建索引
  getTools(): RegisteredTool[];
  getToolByLlmName(name: string): RegisteredTool | undefined;
  getToolById(toolId: string): RegisteredTool | undefined;
  resolveForAgent(agent): RegisteredTool[];         // 唯一的 per-agent 过滤点
  executeTool(llmName: string, args): Promise<ToolResult>;
  toOpenAIFunctions(tools: RegisteredTool[]): ...;
  toAnthropicTools(tools: RegisteredTool[]): ...;
  dispose(): Promise<void>;                         // 对所有 source 调 dispose()
}
```

`builtin/mcp/openapi/cli` 自身只是「第一批注册的 source」,registry 代码中没有针对它们的特判分支 —— 这就是插件化内核。`registerSource` 是公开方法但调用方仅限本插件内部代码;不导出为跨插件 API。

### 4.2 四种 ToolSource 的实现与生命周期

Source 粒度规则:一个「可独立配置、可独立启停的配置单元」= 一个 `ToolSource`。

| 来源 | source 数量 | sourceId | `load()` | `dispose()` |
|---|---|---|---|---|
| `BuiltinToolSource` | 固定 1 个 | `'builtin'` | 同步构造 6 个内置工具(复用 `file-tools.ts` + `search-tools.ts`) | no-op |
| `McpToolSource` | 每个 MCP server 1 个 | server 名 | 连接 + `listTools()`(复用 `MCPClient`、`MCPToolWrapper`),写回 `cachedTools` 缓存 | `disconnect()` |
| `OpenApiToolSource` | 每个 OpenAPI spec 1 个 | config.id | 拉取/读取 spec + 生成 HTTP 工具(复用 `openapi-tool-loader.ts` 逻辑) | no-op |
| `CliToolSource` | 每个 CLI config 1 个 | config.id | 构造 1 个 `CLITool`(复用 `cli-tool.ts`) | no-op |

代码收编:

- `tool-manager.ts` 的 `registerMCPServer` / `unregisterMCPServer` / `mcpClients` → 移进 `McpToolSource`。
- `mcp-service.ts` 的 `ensureAutoConnectedMcpServers`(auto/manual 模式判断、缓存写回)→ 逻辑拆进 `McpToolSource` 与 registry 装配处;`mcp-service.ts` 删除。
- `cli-tool-loader.ts`、`openapi-tool-loader.ts` 两个 loader 类删除,逻辑并入对应 source —— loader 这层抽象被 `ToolSource` 取代。
- `MCPToolWrapper`(把 `MCPTool` 包成工具)保留,由 `McpToolSource` 使用。
- `tool-manager.ts` 删除,由 `tool-registry.ts` 取代。

失败隔离:某个 source 的 `load()` 抛错(MCP 连不上、OpenAPI spec 拉取失败)→ registry 捕获并记日志,跳过该 source,不影响其它来源。这是今天 `ensureAutoConnectedMcpServers` 已有的行为,统一上移到 registry 层。

装配:插件启动时,从统一 config(见第 5 节)读出每类已启用的配置条目,逐条 `new XxxToolSource(...)` 并 `registry.registerSource(...)`,然后 `registry.reload()`。配置变更(增删 MCP server、改 CLI 工具等)→ 对应的 `unregisterSource` / `registerSource` + `reload()`。

`SourceTool` 不携带自己的 `origin` —— registry 在 `registerSource` 时已知 source 的 `kind`/`id`,聚合时由 registry 给每个工具打上 `origin`、算出 `toolId`、消歧出 `llmName`。

### 4.3 工具 ID 与命名

两个名字分开:

- `toolId`(内部稳定键)= `${kind}:${sourceId}:${rawName}`,永远唯一。取代旧 `Map` key 和 `provider` 标签。所有内部引用(per-agent 配置、错误诊断、缓存)都用 `toolId`。
- `llmName`(模型看到的)= `rawName` 经 sanitize:只保留 `[a-zA-Z0-9_-]`,截断到 64 字符。

### 4.4 消歧算法(确定性)

registry 在 `reload()` 聚合时:

1. 按 **source 注册顺序 → 该 source 内工具顺序** 遍历全部工具。
2. 维护 `llmName → toolId` 映射表。
3. 计算某工具的 `llmName`:若 sanitize 后的名字未被占用,直接用;若已占用,依次尝试 `_2`、`_3`… 后缀直到不冲突。

性质:`builtin` 永远第一个注册 → 内置工具名永不被加后缀;source 注册顺序由 config 中条目顺序决定 → 结果稳定可复现。LLM 回传 `llmName` → 查表得 `toolId` → 定位并执行工具。

### 4.5 per-agent 工具模型

用一个字段替换 agent 上今天的 5 个字段:

```ts
interface AgentToolAccess {
  // key = `${kind}:${sourceId}`,即一个 source
  sources: Record<string, 'all' | string[]>;   // 'all' = 该 source 全部工具;数组 = 指定 toolId 列表
}
```

- agent 数据结构(`src/types/core/agent.ts`)新增 `toolAccess: AgentToolAccess`,删除 `enabledBuiltInTools`、`enabledMcpServers`、`enabledMcpTools`、`enabledCLITools`、`enabledAllCLITools`。
- `'all'` = 每来源快捷开关(source 新增工具时自动纳入);数组 = 每工具精确控制。

### 4.6 过滤收敛

`registry.resolveForAgent(agent)` 是唯一的 per-agent 过滤点:遍历所有 `RegisteredTool`,按其 `${kind}:${sourceId}` 查 `agent.toolAccess.sources` —— 不存在则不可用;`'all'` 则可用;数组则 `toolId` 命中才可用。

现状里过滤分散且不自洽:`chat.service` 构建 LLM 工具列表时(`getAgentSystemPromptAndToolList` 的 `filteredTools`)对 `provider === 'built-in'` 无条件放行,但执行守门 `isToolAllowed` 又按 `agent.enabledBuiltInTools` 过滤 —— 导致 builtin 工具可能「LLM 看得到却调不动」(被拒并返回 "not enabled for this agent")。收敛到单一 `resolveForAgent`(同时决定 LLM 可见与可执行)后,该不一致自然消除。

- `chat.service` 中 `isToolAllowed`、以及 `provider.startsWith('mcp:')` / `substring(4)` 那套字符串解析全部删除,改为调用 `resolveForAgent`。
- 无 agent 的普通聊天 → 使用全部已加载工具。
- `diagnoseToolError` 等按 `provider` 字符串分支的逻辑改用 `origin.kind`。

两层启停职责保持分离:

- **全局层** —— settings 中每个 server/工具的 `enabled` 字段,决定 registry 是否为它创建并 load source。
- **per-agent 层** —— 在已加载工具里再选子集。

## 5. Config Schema 统一与数据迁移

### 5.1 统一持久化 schema

```
旧:  config.mcp.{ servers, registries }
     config.tools.{ builtIn, openApi?, cli? }

新:  config.tools.{
       builtin:  BuiltInToolConfig[]
       mcp:      { servers: MCPServerConfig[], registries: MCPRegistry[] }
       openapi:  OpenApiToolConfig[]
       cli:      CLIToolConfig[]
     }
```

四种来源在同一 `tools` 命名空间下,字段名统一小写。运行时 settings 对象的扁平字段(`mcpServers`、`mcpRegistries`、`builtInTools`、`openApiTools`、`cliTools`)保留不动 —— 改动仅落在持久化 schema 与 `mapConfigToSettings` / `mapSettingsToConfig` 这两个映射函数,运行时其它代码零改动。

### 5.2 三处透明迁移

均在已有的 `normalizeConfig`(`src/types/settings.ts`)中加版本兼容读取,用户无感知;迁移后按新结构回写,旧字段不再写出。

1. **config 结构**:读旧 `config.mcp` 与 `config.tools.builtIn`/`openApi`/`cli` → 写入新 `config.tools.*`。

2. **agent 工具字段 → `toolAccess.sources`**:
   - `enabledBuiltInTools[]` → `sources['builtin:builtin'] = [对应 toolId…]`(按该字段迁移,与现行执行守门 `isToolAllowed` 的语义一致;统一后这些工具同时对 LLM 可见与可执行。空数组即该 agent 无 builtin 工具)
   - `enabledMcpServers[]` + `enabledMcpTools[]` → 对每个 server:**先**判断是否在 `enabledMcpServers` 中,是则设 `'all'`(对齐现行 `isToolAllowed` 的「细粒度命中 _或_ server 整体启用」语义 —— server 整体启用时其全部工具放行,与 `enabledMcpTools` 是否另有条目无关);否则若 `enabledMcpTools` 有该 server 的 `server::tool` 细粒度条目,转成 `toolId[]`
   - `enabledCLITools[]` + `enabledAllCLITools` → `enabledAllCLITools` 为真时所有 cli source 设 `'all'`;否则逐个 `sources['cli:<id>'] = 'all'`

3. **全局 `allowOpenApiTools` → per-agent(⚠️ 行为变化点)**:该选项今天是全局的;迁移时若为 `true`,给**每个 agent** 的每个 openapi source 设 `'all'`;为 `false` 则不设。迁移后语义升级为「每个 agent 各自决定是否使用 OpenAPI 工具」。这是本重构唯一的用户可见行为变化。

迁移在插件加载 config 时执行一次,无需用户手动操作。

## 6. Settings UI 拆分

结构性拆分,不做视觉重设计:

- `tools-tab.ts`(1156 行)→ 拆成壳 + 子组件。`tools-tab.ts` 只负责布局与切换;渲染下沉到 `src/presentation/components/tabs/tools/` 下的 `builtin-tools-section.ts`、`openapi-tools-section.ts`、`cli-tools-section.ts`,每个文件聚焦一种来源。
- `mcp-tab.ts`(388 行)保持为独立 tab、不拆;其内部读取 MCP 配置处改为读统一 config 的 `config.tools.mcp`。
- 各 section 与 agent 编辑弹窗(`agent-edit-modal.ts`)统一改用 `toolAccess` 模型展示「每来源 / 每工具」开关。
- `agent.model.ts` 的 `canUseTooling()` / `getToolsCount()` 改用 `toolAccess`。

## 7. 落地分期

供后续 writing-plans 切分参考;每阶段独立可编译、可测、可部署(每阶段结束按 CLAUDE.md 跑 `npm run lint` → `npm run build` → `node scripts/deploy.js --local`)。

1. **核心抽象** —— `ToolOrigin` / `ToolSource` / `SourceTool` / `RegisteredTool` 类型 + `ToolRegistry` 骨架(含消歧)。纯新增 + 单元测试,不接线。
2. **四个 ToolSource 实现** —— builtin/mcp/openapi/cli 四个 source;registry 替换 `ToolManager` 内部装配;对外行为保持不变。
3. **per-agent 统一模型** —— `toolAccess` 字段 + `resolveForAgent` + agent 迁移;chat.service 过滤收敛,删除字符串解析。
4. **config schema 统一** —— `config.tools.*` 重构 + 三处迁移。
5. **UI 拆分** —— `tools-tab.ts` 拆子组件,agent 弹窗与 `agent.model.ts` 接新模型。

## 8. 测试策略

TDD,先写测试再写实现:

- 纯逻辑、高价值、易测 —— 消歧算法、`resolveForAgent`、三处迁移函数 → 完整单元测试覆盖(含同名冲突、空配置、旧字段缺失等边界)。
- 各 `ToolSource` 的 `load()` → 用 mock(`MCPClient`、HTTP client、文件系统)测试,含失败隔离路径。
- registry 的 `reload` / `register` / `unregister` / `executeTool` → 用 fake source 测试。

## 9. 明确不做(YAGNI)

- 跨插件公开 API、对外 API 版本兼容承诺。
- 用户脚本 / vault 配置定义的自定义工具来源。
- Settings UI 的视觉重设计。
- 聊天界面工具调用 UI 的改动。
- 新增第五种工具来源(架构支持,但本次不实现)。

## 10. 文件级影响清单(方向性,实现时以 plan 为准)

**新增**

- `src/application/tools/tool-source.ts` —— `ToolSource` 接口
- `src/application/tools/tool-registry.ts` —— `ToolRegistry`
- `src/application/tools/sources/builtin-tool-source.ts`
- `src/application/tools/sources/mcp-tool-source.ts`
- `src/application/tools/sources/openapi-tool-source.ts`
- `src/application/tools/sources/cli-tool-source.ts`
- `src/application/tools/tool-migrations.ts` —— agent 字段迁移逻辑
- `src/presentation/components/tabs/tools/builtin-tools-section.ts`
- `src/presentation/components/tabs/tools/openapi-tools-section.ts`
- `src/presentation/components/tabs/tools/cli-tools-section.ts`
- 上述各项对应的测试文件

**修改**

- `src/types/common/tools.ts` —— 新增 `ToolSourceKind` / `ToolOrigin` / `SourceTool` / `RegisteredTool` / `AgentToolAccess`
- `src/types/core/agent.ts` —— 删 5 个工具字段,加 `toolAccess`
- `src/types/settings.ts` —— config schema 统一 + `normalizeConfig` 三处迁移 + 映射函数
- `src/application/services/chat.service.ts` —— 过滤收敛,删字符串解析
- `src/presentation/components/tabs/tools-tab.ts` —— 拆成壳
- `src/presentation/components/tabs/mcp-tab.ts` —— 读统一 config
- `src/presentation/components/modals/agent-edit-modal.ts` —— 接 `toolAccess`
- `src/domain/agent/agent.model.ts` —— `canUseTooling` / `getToolsCount` 用 `toolAccess`
- `main.ts` —— 装配 `ToolRegistry`

**删除**

- `src/application/services/tool-manager.ts`(→ `tool-registry.ts`)
- `src/application/services/cli-tool-loader.ts`
- `src/application/services/openapi-tool-loader.ts`
- `src/application/services/mcp-service.ts`(逻辑并入 `mcp-tool-source.ts` 与装配处)
