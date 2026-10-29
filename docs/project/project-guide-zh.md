# 项目指南

本文是面向开发者的 `obsidian-plugin-intelligence-assistant` 仓库指南，补充面向用户的 [README](../../README.md) 和 `docs/architecture/` 下的架构说明——建议先阅读[架构总览](../architecture/overview-zh.md)。

## 插件做什么

Intelligence Assistant 把 Obsidian 库变成本地 AI 工作区，包含：

- 支持流式输出的多提供商 LLM 聊天
- 可复用的自定义智能体，按回合调用工具
- MCP、OpenAPI 和 CLI 工具集成
- 基于本地向量存储的库内容 RAG
- Web 搜索
- 快捷操作和编辑器内的 AI 辅助

## 代码结构

- `main.ts`：Obsidian `Plugin`——加载设置、注册视图和设置页，然后调用组合根
- `src/bootstrap`：组合根，只构建一次所有服务
- `src/application`：用例及其拥有的端口——智能体（回合内核）、聊天、设置存储、工具、Web 搜索
- `src/infrastructure`：适配器——JSON/JSONL 持久化、RAG、向量库、嵌入、Obsidian 文件系统
- `src/presentation`：聊天视图、设置选项卡、对话框、控制器、状态
- `src/core`、`src/types`、`src/utils`：插件路径、共享接口与数据结构、小工具函数
- `packages/obsidian-llm`：LLM 提供商、HTTP 端口和模型管理（`@qwai/obsidian-llm`）

分层边界由 lint 强制执行（`eslint.config.mts` 中的 `no-restricted-imports`）。

## 主要运行流程

### 启动

加载时插件会：

1. 注册聊天视图、命令、功能区图标和设置页
2. 通过 `SettingsStore` 加载设置（用户配置、仓库文件、迁移）
3. 在 [`src/bootstrap/create-services.ts`](../../src/bootstrap/create-services.ts) 中构建服务，并完成 `whenServicesReady()`
4. 执行延迟任务：会话迁移、默认智能体初始化、加载工具源（内置、CLI、OpenAPI、MCP 自动连接）

### 聊天请求生命周期

[`chat-view.ts`](../../src/presentation/views/chat-view.ts) 收集文本、附件和引用，由 [`ChatController`](../../src/presentation/components/chat/controllers/chat-controller.ts) 发送：

- 聊天模式：[`ChatService`](../../src/application/services/chat.service.ts) 加入 RAG 和 Web 搜索上下文并流式输出回复
- 智能体模式：[`AgentEngineLoop`](../../src/application/agents/agent-engine-loop.ts) 运行 [`TurnKernel`](../../src/application/agents/kernel/turn-kernel.ts)，工具调用实时显示在聊天中
- 停止按钮通过 `AbortSignal` 取消请求
- 回复完成后保存会话

### 工具流水线

[`ToolSourceManager`](../../src/application/tools/tool-source-manager.ts) 把工具源加载到 [`ToolRegistry`](../../src/application/tools/tool-registry.ts)：

- 内置库工具（[`builtin-tool-source.ts`](../../src/application/tools/sources/builtin-tool-source.ts)）
- MCP 服务器，包装为工具
- 由 OpenAPI 规范转换的工具
- 来自预设或用户配置的 CLI 工具

每个工具都声明其副作用；智能体只能看到 `toolAccess` 授权的工具。

### RAG 流水线

[`RAGManager`](../../src/infrastructure/rag-manager.ts) 把库中笔记索引到 [`VectorStore`](../../src/infrastructure/vector-store.ts)：笔记 → 分块（[`chunker.ts`](../../src/infrastructure/rag/chunker.ts)）→ 嵌入 → 本地索引 → 相似度检索 → 可选评分。未修改的笔记按内容哈希跳过。聊天和智能体通过 `KnowledgeBase` 端口访问它。

## 持久化模型

- 用户配置文件：规范化后的设置（`SettingsStore`、`settings-codec.ts`）
- 仓库 JSON 文件：提供商、提示词、智能体、模型缓存、MCP 服务器及工具缓存、Token 用量、智能体记忆
- 会话：每个会话一个 JSON 文件
- 智能体运行：每次运行一个 JSONL 日志
- 向量索引：RAG 分块和嵌入

所有路径都来自 [`pluginPaths(configDir)`](../../src/core/plugin-paths.ts)。写入是原子的（先写临时文件再重命名）。

## 建议优先阅读的模块

1. [`main.ts`](../../main.ts)
2. [`src/bootstrap/create-services.ts`](../../src/bootstrap/create-services.ts)
3. [`src/application/settings/settings-store.ts`](../../src/application/settings/settings-store.ts)
4. [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts)
5. [`src/application/agents/kernel/turn-kernel.ts`](../../src/application/agents/kernel/turn-kernel.ts)
6. [`src/application/tools/tool-source-manager.ts`](../../src/application/tools/tool-source-manager.ts)
7. [`packages/obsidian-llm/src/model-manager.ts`](../../packages/obsidian-llm/src/model-manager.ts)

## 已知工程热点

- 仍有几个较大的界面模块（`agent-edit-modal.ts`、`mcp-inspector`、`message-renderer.ts`、`cli-tools-section.ts`）。
- SAP AI Core 提供商是缓冲而非流式输出，且不支持工具调用。
- MCP、OpenAPI 和 RAG 都会增加异步启动工作，回归问题常表现为初始化顺序错误。

## 建议的开发流程

1. 阅读相关的运行时路径。
2. 先写或更新测试（`npx jest`，以及 `tests/missions` 中的任务测试）。
3. 运行 `npm run lint`。
4. 运行 `npm run build` 和 `node scripts/deploy.js --local`。
5. 涉及界面或存储的修改，运行 `npm run test:e2e`。

## 扩展指南

- 新的 LLM 提供商放在 `packages/obsidian-llm/src/providers/`；兼容 OpenAI 的 API 可以继承 `OpenAICompatibleProvider`。
- 新的内置工具在 `src/application/services/*-tools.ts` 中实现，在 `builtin-tool-source.ts` 中注册，并且必须声明副作用。
- 新设置需要更新类型、编解码和迁移，并在对应选项卡中添加字段（简单字段用 `SettingsForm`）。
- 新端口属于使用它的那一层；适配器以结构类型的方式实现它。
