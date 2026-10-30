# 架构总览

Intelligence Assistant 是按功能组织的端口与适配器插件。`main.ts` 是一个很薄的 Obsidian `Plugin`，负责加载设置，然后交给 `src/bootstrap/` 中的组合根。LLM 提供商位于独立的包 `packages/obsidian-llm`（`@qwai/obsidian-llm`）。

## 目录结构

```
┌───────────────────────────────────────────────────────────────┐
│ main.ts → src/bootstrap/   组合根（统一构建所有服务）            │
└───────────────┬───────────────────────────────────────────────┘
                │ 装配
┌───────────────▼───────────────┐   ┌───────────────────────────┐
│ ui/                           │   │ packages/obsidian-llm      │
│ 聊天 · 设置 · 对话框           │   │ 提供商 · HTTP 端口 ·       │
│ 视图 · 编辑器 · 状态           │   │ 模型管理 · LLM Hub         │
└───────────────┬───────────────┘   └─────────────▲─────────────┘
                │ 调用                            │ 被使用
┌───────────────▼─────────────────────────────────┴─────────────┐
│ features/<名称>/   每个功能的用例、端口和类型                   │
│ agent · chat · conversations · knowledge · llm · settings      │
│ tools · usage · web-search                                     │
└───────────────┬───────────────────────────────────────────────┘
                │ 端口由下层实现
┌───────────────▼───────────────────────────────────────────────┐
│ adapters/  obsidian · persistence（JSON/JSONL）· process · rag │
└───────────────┬───────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────┐
│ core/  插件路径 · 接口 · 常量 · 工具函数                        │
└───────────────────────────────────────────────────────────────┘
```

每个功能的类型都放在自己代码旁边的 `features/<名称>/types/` 中，不再有共享的 `types/` 目录。每个功能只暴露一个 `index.ts`，使用显式的具名导出（不用 `export *`）；功能外部的代码只能从 `@/features/<名称>` 导入。Lint 在所有位置禁止 `export *`，包括 `packages/obsidian-llm` 的入口。

导入规则由 `eslint.config.mts` 强制执行，没有任何豁免：

| 目录 | 禁止导入 |
|------|---------|
| `core/`、`i18n/` | features、adapters、ui、bootstrap |
| `features/<名称>/` | adapters、ui、bootstrap，以及其他功能的内部模块（应使用其 index） |
| `adapters/` | ui、bootstrap；功能只能通过其 index 以 `import type` 使用 |
| `ui/` | bootstrap；adapters 只能用 `import type`；功能只能通过其 index 导入 |

UI 代码接收 `PluginHost`（`ui/plugin-host.ts`：app、manifest、settings、services、`updateSettings`、`saveSettings`），而不是插件类本身；只有设置页、聊天视图和聊天会话控制器能看到插件对象。

`core/`、`features/` 和 `ui/` 不能导入 Node 模块（`child_process`、`fs`、`node:*`、`cross-spawn` 等）；这些代码位于 `adapters/`，通过端口访问。
| `packages/obsidian-llm` | 插件中的任何代码（`@/*`） |

只有 `bootstrap/` 和 `main.ts` 可以看到所有目录。

## 组合根 — `src/bootstrap/`

- `create-services.ts` 只构建一次所有服务，返回 `OwnedServices`；界面拿到的是更窄的 `AppServices` 接口（`ui/app-services.ts`）。
- `obsidian-settings-persistence.ts` 和 `plugin-data-service.ts` 把设置存储适配到插件的 JSON 文件。
- `tool-source-factory.ts` 创建内置、CLI、OpenAPI 和 MCP 工具源。
- `agent-entry-points.ts` 和 `plugin-integrations.ts` 注册命令、内联 AI 块、深度链接，以及随库事件触发的 RAG 索引。

`ChatView.onOpen` 会等待 `plugin.whenServicesReady()`，视图从不自行构建服务。

## 功能 — `src/features/`

**settings**：`SettingsStore` 负责加载、迁移（`settings-migrations.ts`）和保存设置。API 密钥通过 `SecretVault` 端口（`settings-secrets.ts`，适配器为 `adapters/obsidian/obsidian-secret-vault.ts`）保存在 Obsidian 的密钥存储中：设置只记录密钥名称，存储在加载时填入密钥，写入时一律去除。设置作为一个文档保存在插件的 `data.json` 中（`settings-document.ts`：配置、提供商、提示词、智能体），因此 Obsidian Sync 会同步它们，`onExternalSettingsChange` 会重新加载。只有当某个单元（`config`、`providers`、`prompts`、`agents`、`mcp`）变化时才保存，并通知 `onChange` 订阅者；插件据此刷新 RAG 和聊天模型列表。模型和 MCP 工具缓存保存在 `data/cache/`。旧版本保存在 `config/user/settings.json` 和 `data/` 中的设置会在首次加载时迁入 `data.json`（`adapters/persistence/legacy-settings-files.ts`）。`types/settings.ts` 定义 `PluginSettings`。

**agent**：

- `kernel/turn-kernel.ts` — 智能体循环。一个回合等于一次模型调用加上它返回的整批工具调用。端口：`ContextAssembler`、`ModelPort`、`ToolRunner`、`TurnGuard`。
- `kernel/budget.ts` — 步数与失败预算；智能体可在第一回合用 `ESTIMATED_STEPS` 标记提高步数预算。运行以带类型的 `FinishReason` 结束。
- `kernel/turn-guards.ts` — 具名的重试规则（空回合、缺少写入提案），会出现在执行轨迹中。
- `agent-engine-loop.ts` — 把内核事件映射为聊天回调，并写入运行日志。
- `agent-sense-service.ts` — 收集当前笔记、引用、图谱邻居、RAG 结果和智能体记忆。
- `tool-access-editor.ts` — 按工具或整个工具源为智能体授权。

与适配器共享的契约（`KernelEvent`、`FinishReason`、`RunJournal`）位于 `agent/types/agent-run.ts`。参见 ADR-001 和 ADR-002。

**chat**：`chat.service.ts` 以流式方式输出聊天模式回复，并把智能体模式交给引擎循环。`chat-session-policy.ts` 决定当前模式、智能体、提示词和智能体所用模型。`conversation-namer.ts` 生成会话标题和图标。`vault-export-service.ts` 把回复保存到笔记。

**web-search**：`web-search-service.ts` 分派到 `backends.ts` 中的各个后端。

**knowledge**：`KnowledgeBase` 和 `MemoryIndex` 端口（`knowledge-base.ts`）以及 RAG 配置类型。

**tools**：`ToolRegistry` 保存所有工具；`ToolSourceManager` 加载和重新加载内置、CLI、OpenAPI 和 MCP 工具源（`sources/`）。内置工具在 `*-tools.ts` 中实现。工具声明副作用（`ToolSideEffects`，其中 CLI 和 MCP 工具声明 `process`），能力摘要和自主写入规则都依据它。

**llm**：LLM Hub 服务、Ollama 管理，以及 LLM 与模型类型。

**conversations** 和 **usage** 保存会话和 Token 用量的类型；其存储位于 `adapters/persistence/`。

## 适配器 — `src/adapters/`

- `persistence/json-file.ts` — 原子 JSON 写入（先写临时文件再重命名），并能恢复遗留的临时文件；`json-collection.ts` 读取旧版本用于提示词和智能体的“索引加每项一个文件”布局。`persistence/data/` 中的缓存、Token 用量和智能体记忆都基于 `JsonFile`。
- `persistence/jsonl-run-journal.ts` — 每个智能体事件追加一行 JSON。
- `persistence/conversation-storage-service.ts` — 每个会话一个 JSON 文件。
- `rag/` — `rag-manager.ts`、`vector-store.ts`、`chunker.ts`、`embedding-manager.ts`、`document-grader.ts`、`incremental-indexer.ts`：库索引与检索。分块记录内容哈希和嵌入模型，因此未修改的笔记不会重新嵌入，检索也只比较同一模型的向量。`RAGManager` 实现 `KnowledgeBase` 和 `MemoryIndex`。
- `obsidian/obsidian-file-system.ts` — 基于库的文件系统端口。
- `process/` — 所有启动进程的代码：`mcp-stdio-session.ts` 通过服务器的 stdio 使用 MCP 协议（`connectMcpStdio` 实现 tools 功能的 `McpConnector` 端口，并用 `resolve-command.ts` 解析 `npx` 等启动器），`command-runner.ts` 实现 CLI 工具使用的 `CommandRunner` 端口。

所有插件路径都来自 `core/plugin-paths.ts`（`pluginPaths(configDir)`），因此使用的是库实际的配置目录。

## LLM 包 — `packages/obsidian-llm`

- `http.ts` / `obsidian-http.ts` — `HttpPort`；`resilient-http.ts` 增加超时、对 429/502/503/504 及传输错误的重试，以及 `AbortSignal` 取消。
- `base-streaming-provider.ts` — SSE 流式处理，每个流使用独立的分块解析器。
- `providers/openai-compatible-provider.ts` — OpenAI、DeepSeek 和 OpenRouter 的共享基类。Anthropic、Gemini 和 Ollama 原生实现工具调用。
- `model-manager.ts` — 每个提供商配置一份模型缓存，并合并进行中的重复请求。
- `hub.ts` — 跨插件 LLM Hub，出借模型能力而不暴露密钥。

## 界面 — `src/ui/`

- `views/chat-view.ts` — 聊天 `ItemView`，组合标题栏、输入框、消息列表和会话侧栏。`views/chat-workspace.ts` 打开和查找聊天视图；`views/agent-task-launcher.ts` 从命令启动智能体任务。
- `chat/chat-session-controller.ts` — 把模式、智能体、会话配置和快捷开关应用到视图。
- `chat/chat-message-list.ts` — 消息渲染、空状态和预检卡片；`message-grouping.ts` 合并旧格式的工具调用链。
- `chat/controllers/` — `ChatController`（发送、流式输出、实时智能体轨迹）和 `InputController`。
- `chat/managers/conversation-manager.ts` 和 `chat/conversation-list-view.ts` — 会话侧栏。
- `settings/settings-tab.ts` — 设置界面使用 Obsidian 的声明式设置（1.13+）：常规设置是 `control` 定义，因此会出现在 Obsidian 的设置搜索中；其他每个分区都是原生页面（`settings/section-page.ts`），渲染 `settings/tabs/` 中对应的内容。`settings/settings-form.ts` 把一个设置分区绑定到开关、下拉框、文本、数字、列表和密钥字段，并统一保存。
- `modals/` — 对话框。
- `state/chat-view-state.ts` — 每个视图的状态，包括当前请求的 `AbortController`。

## 测试

`npm run verify` 依次运行 lint、类型检查、带覆盖率阈值的全部 Jest 测试和构建。完整的测试分层见 [reference/testing.md](../reference/testing.md)。

- `npx jest` — 单元测试（jsdom，Obsidian 模拟位于 `__mocks__/obsidian.ts`）。
- `npx jest tests/harness tests/missions --runInBand` — 基于模拟 LLM 和内存库的智能体任务测试。
- `npm run test:e2e` — 基于最新版 Obsidian 的 WebdriverIO 测试（用 `OBSIDIAN_VERSION` 指定其他版本）。

## 设计说明

- **Electron 渲染进程中不使用动态导入。** Chromium 拒绝带裸模块说明符的 `import()`，并阻止 `file://` 方式加载 ESM，因此纯 ESM 包需要打包。
- **设置按差异保存，而非整体重写。** 写入通过 `plugin.updateSettings(settings => …)` 完成，它应用修改并保存；存储只写入变化的单元，因此多余的保存开销很小。
