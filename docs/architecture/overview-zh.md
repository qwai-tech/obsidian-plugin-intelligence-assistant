# 架构总览

Intelligence Assistant 采用分层的端口与适配器架构。`main.ts` 是一个很薄的 Obsidian `Plugin`，负责加载设置，然后交给 `src/bootstrap/` 中的组合根。LLM 提供商位于独立的包 `packages/obsidian-llm`（`@qwai/obsidian-llm`）。

## 分层

```
┌───────────────────────────────────────────────────────────────┐
│ main.ts → src/bootstrap/   组合根（统一构建所有服务）            │
└───────────────┬───────────────────────────────────────────────┘
                │ 装配
┌───────────────▼───────────────┐   ┌───────────────────────────┐
│ presentation/                 │   │ packages/obsidian-llm      │
│ 视图 · 组件 · 对话框           │   │ 提供商 · HTTP 端口 ·       │
│ 设置选项卡 · 状态              │   │ 模型管理 · LLM Hub         │
└───────────────┬───────────────┘   └─────────────▲─────────────┘
                │ 调用                            │ 被使用
┌───────────────▼─────────────────────────────────┴─────────────┐
│ application/   用例及其拥有的端口                              │
│ 智能体（回合内核）· 聊天 · 设置存储 · 工具 · 搜索              │
└───────────────┬───────────────────────────────────────────────┘
                │ 端口由下层实现
┌───────────────▼───────────────────────────────────────────────┐
│ infrastructure/  适配器：JSON/JSONL 持久化、RAG、               │
│ 向量库、嵌入、Obsidian 文件系统                                 │
└───────────────┬───────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────┐
│ core/ · types/ · utils/ · constants   不依赖任何上层            │
└───────────────────────────────────────────────────────────────┘
```

导入规则由 `eslint.config.mts` 中的 `no-restricted-imports` 强制执行，没有任何豁免：

| 层 | 禁止导入 |
|----|---------|
| `core/`、`types/`、`utils/`、`constants.ts`、`i18n/` | application、infrastructure、presentation |
| `application/` | infrastructure、presentation |
| `infrastructure/` | application、presentation |
| `packages/obsidian-llm` | 插件中的任何代码（`@/*`） |

只有 `bootstrap/` 和 `main.ts` 可以看到所有层。

## 组合根 — `src/bootstrap/`

- `create-services.ts` 只构建一次所有服务，返回 `OwnedServices`；界面层拿到的是更窄的 `AppServices` 接口（`presentation/app-services.ts`）。
- `obsidian-settings-persistence.ts` 和 `plugin-data-service.ts` 把设置存储适配到插件的 JSON 文件。
- `tool-source-factory.ts` 创建内置、CLI、OpenAPI 和 MCP 工具源。
- `agent-entry-points.ts` 和 `plugin-integrations.ts` 注册命令、内联 AI 块、深度链接，以及随库事件触发的 RAG 索引。

`ChatView.onOpen` 会等待 `plugin.whenServicesReady()`，视图从不自行构建服务。

## 应用层 — `src/application/`

**设置**（`settings/`）：`SettingsStore` 负责加载、迁移（`settings-migrations.ts`）和保存设置。保存时只写入发生变化的单元（`config`、`providers`、`prompts`、`agents`、`mcp`），并通知 `onChange` 订阅者；插件据此刷新 RAG 和聊天模型列表。

**智能体**（`agents/`）：

- `kernel/turn-kernel.ts` — 智能体循环。一个回合等于一次模型调用加上它返回的整批工具调用。端口：`ContextAssembler`、`ModelPort`、`ToolRunner`、`TurnGuard`。
- `kernel/budget.ts` — 步数与失败预算；智能体可在第一回合用 `ESTIMATED_STEPS` 标记提高步数预算。运行以带类型的 `FinishReason` 结束。
- `kernel/turn-guards.ts` — 具名的重试规则（空回合、缺少写入提案），会出现在执行轨迹中。
- `agent-engine-loop.ts` — 把内核事件映射为聊天回调，并写入运行日志。
- `agent-sense-service.ts` — 收集当前笔记、引用、图谱邻居、RAG 结果和智能体记忆。

与基础设施层共享的契约（`KernelEvent`、`FinishReason`、`RunJournal`）位于 `types/features/agent-run.ts`。参见 ADR-001 和 ADR-002。

**聊天与搜索**（`services/`）：`chat.service.ts` 以流式方式输出聊天模式回复，并把智能体模式交给引擎循环。`chat-session-policy.ts` 决定当前模式、智能体、提示词和智能体所用模型。`web-search-service.ts` 分派到 `web-search/backends.ts` 中的各个后端。`conversation-namer.ts` 生成会话标题和图标。

**工具**（`tools/`）：`ToolRegistry` 保存所有工具；`ToolSourceManager` 加载和重新加载内置、CLI、OpenAPI 和 MCP 工具源。工具声明副作用（`ToolSideEffects`，其中 CLI 和 MCP 工具声明 `process`），能力摘要和自主写入规则都依据它。

**本层拥有的端口**：`KnowledgeBase` 和 `MemoryIndex`（`services/knowledge-base.ts`）、`AgentMemoryStore`、`ExportTargetPicker`、`SettingsPersistence`，以及上面的内核端口。

## 基础设施层 — `src/infrastructure/`

- `persistence/json-file.ts` — 原子 JSON 写入（先写临时文件再重命名），并能恢复遗留的临时文件；`json-collection.ts` 存储一个索引加每项一个文件。`persistence/data/` 中的所有仓库都基于它们。
- `persistence/jsonl-run-journal.ts` — 每个智能体事件追加一行 JSON。
- `persistence/conversation-storage-service.ts` — 每个会话一个 JSON 文件。
- `rag-manager.ts`、`vector-store.ts`、`rag/chunker.ts`、`embedding-manager.ts`、`document-grader.ts` — 库索引与检索。分块记录内容哈希和嵌入模型，因此未修改的笔记不会重新嵌入，检索也只比较同一模型的向量。`RAGManager` 实现 `KnowledgeBase` 和 `MemoryIndex`。

所有插件路径都来自 `core/plugin-paths.ts`（`pluginPaths(configDir)`），因此使用的是库实际的配置目录。

## LLM 包 — `packages/obsidian-llm`

- `http.ts` / `obsidian-http.ts` — `HttpPort`；`resilient-http.ts` 增加超时、对 429/502/503/504 及传输错误的重试，以及 `AbortSignal` 取消。
- `base-streaming-provider.ts` — SSE 流式处理，每个流使用独立的分块解析器。
- `providers/openai-compatible-provider.ts` — OpenAI、DeepSeek 和 OpenRouter 的共享基类。Anthropic、Gemini 和 Ollama 原生实现工具调用。SAP AI Core 使用 `sap-sse.ts` 中的缓冲 SSE 辅助函数。
- `model-manager.ts` — 每个提供商配置一份模型缓存，并合并进行中的重复请求。
- `hub.ts` — 跨插件 LLM Hub，出借模型能力而不暴露密钥。

## 表现层 — `src/presentation/`

- `views/chat-view.ts` — 聊天 `ItemView`，组合标题栏、输入框、消息列表和会话侧栏。`views/chat-workspace.ts` 打开和查找聊天视图；`views/agent-task-launcher.ts` 从命令启动智能体任务。
- `components/chat/chat-session-controller.ts` — 把模式、智能体、会话配置和快捷开关应用到视图。
- `components/chat/controllers/` — `ChatController`（发送、流式输出、实时智能体轨迹）和 `InputController`。
- `components/chat/managers/conversation-manager.ts` 和 `conversation-list-view.ts` — 会话侧栏。
- `components/settings/settings-form.ts` — `SettingsForm` 把一个设置分区绑定到开关、下拉框、文本、数字和列表字段，并统一保存。
- `components/tabs/` — 设置选项卡；`components/modals/` — 对话框。
- `state/chat-view-state.ts` — 每个视图的状态，包括当前请求的 `AbortController`。

## 类型 — `src/types/`

只包含接口和纯数据结构：`core/`（智能体、会话、模型）、`common/`（LLM、工具、附件、推理）、`features/`（agent-run、cli-tools、mcp、memory、openapi-tools、rag、usage、web-search）以及 `settings.ts`（`PluginSettings`）。行为逻辑都在上面的各层中。

## 测试

- `npx jest` — 单元测试（jsdom，Obsidian 模拟位于 `__mocks__/obsidian.ts`）。
- `npx jest tests/harness tests/missions --runInBand` — 基于模拟 LLM 和内存库的智能体任务测试。
- `npm run test:e2e` — 基于真实 Obsidian 的 WebdriverIO 测试。

## 设计说明

- **Electron 渲染进程中不使用动态导入。** Chromium 拒绝带裸模块说明符的 `import()`，并阻止 `file://` 方式加载 ESM，因此纯 ESM 包需要打包。
- **设置按差异保存，而非整体重写。** 调用方修改 `plugin.settings` 后调用 `saveSettings()`；存储只写入变化的单元，因此多余的保存开销很小。
