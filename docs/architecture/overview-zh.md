# 架构总览

Intelligence Assistant 采用**分层六边形架构**（端口与适配器模式），`src/` 下分为六个顶级命名空间。依赖关系严格由外层流向内层，内层永远不引用外层。

## 层次图

```
┌─────────────────────────────────────────────────────┐
│                    表现层 Presentation               │
│   视图 · 组件 · 控制器 · 处理器                       │
│   设置选项卡 · 对话框 · 状态管理                       │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                   应用层 Application                  │
│   服务（聊天、LLM、MCP、RAG、智能体、工具、           │
│   Web 搜索、会话存储、记忆）                           │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                  基础设施层 Infrastructure             │
│   LLM 提供商 · 持久化                                 │
│   RAG / 向量库 · 嵌入计算 · 文档评分                  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                   领域层 Domain                       │
│   智能体模型 · 会话模型 · 消息实体                     │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│                    核心层 Core                        │
│   依赖注入容器 · 事件总线 · 错误处理                   │
│   配置管理器 · 性能监控                               │
└─────────────────────────────────────────────────────┘
```

## 各命名空间说明

### `src/core/` — 基础设施核心

跨层横切关注点：

- **`container.ts`** — 依赖注入容器，支持单例和瞬态注册，所有应用服务均通过容器解析。
- **`event-bus.ts`** — 异步/同步事件总线，覆盖消息、会话、智能体、工具、RAG、MCP 及系统生命周期等 30+ 个命名事件。
- **`error-handler.ts`** / **`errors.ts`** — 自定义错误层次（`PluginError`、`ConfigurationError`、`NetworkError`、`StorageError`、`ToolError`、`ValidationError`）及集中式错误处理。
- **`config-manager.ts`** / **`config-schema.ts`** — 带 Schema 校验、迁移支持、路径式嵌套访问和变更追踪的配置 CRUD。
- **`performance-monitor.ts`** — 轻量操作计时。

### `src/domain/` — 领域模型

无框架依赖的纯业务模型：

- **`agent.model.ts`** — 智能体配置模型：校验、序列化、工厂方法。
- **`conversation.model.ts`** — 会话聚合根：消息列表、Token 计数、摘要生成。
- **`message.entity.ts`** — 消息值对象。

### `src/application/` — 应用服务

协调领域模型与基础设施的编排服务：

| 服务 | 职责 |
|------|------|
| `chat.service.ts` | 消息路由、流式传输、工具调用执行 |
| `llm-service.ts` | 提供商选择、模型解析 |
| `agent-service.ts` | 智能体 CRUD 与选择 |
| `mcp-service.ts` / `mcp-client.ts` | MCP 服务器生命周期、工具目录 |
| `rag-service.ts` | 知识库索引编排 |
| `web-search-service.ts` | 提供商无关的 Web 搜索 |
| `tool-manager.ts` | 注册并分发所有工具类型 |
| `conversation-storage-service.ts` | 会话持久化与恢复 |
| `memory-service.ts` | 智能体记忆读写 |
| `openapi-tool-loader.ts` | 将 OpenAPI Spec 解析为智能体工具 |

### `src/infrastructure/` — 外部适配器

**LLM 提供商**（`infrastructure/llm/`）：

支持 OpenAI、Anthropic、Google Gemini、DeepSeek、Ollama（本地）、OpenRouter、SAP AI Core。

所有提供商均继承 `base-streaming-provider.ts`，统一处理分块流式、工具调用累积和错误规范化。每个提供商实现 `base-provider.interface.ts`。

### `src/presentation/` — 表现层（UI）

全部 UI 代码，聊天视图内部采用 MVC 模式。

**控制器**（`controllers/`）：`ChatController`、`MessageController`、`AgentController`、`InputController`

**处理器**（`handlers/`）：`StreamingHandler`（流式 + 自动滚动）、`ToolCallHandler`（工具调用 UI）、`AttachmentHandler`（文件/图片附件）

**管理器**（`managers/`）：`ConversationManager`（会话 CRUD、历史记录、持久化）

**设置选项卡**（`tabs/`）：通用、LLM、模型、提供商、智能体、提示词、工具、MCP、RAG、Web 搜索、快捷操作

**对话框**（`modals/`）：`AgentEditModal`、`MCPServerModal`、`MCPInspectorModal`、`ProviderConfigModal`、`OllamaModelManagerModal`、`PromptModal`、`SystemPromptEditModal`、`ConfirmModal`、`ExplainTextModal`

### `src/types/` — 类型定义

所有 TypeScript 类型均从单一 `index.ts` 导出：

```
types/
├── core/       agent.ts · conversation.ts · model.ts
├── features/   mcp.ts · rag.ts · web-search.ts · memory.ts · think.ts · ...
├── common/     llm.ts · tools.ts · attachments.ts · reasoning.ts
└── settings.ts PluginSettings — 根配置 Schema，持久化于 data.json
```

## 关键设计决策

### 配置 Schema 与迁移

`types/settings.ts` 定义 `PluginSettings` 作为所有持久化状态的唯一来源。`settings-tab.ts` 中的 `userConfigToPluginSettings` 函数负责从旧格式升级数据。

### Electron 渲染进程中无法使用动态 Import

Electron 的基于 Chromium 的渲染进程会拒绝对裸模块说明符使用 `import()`，并屏蔽本地 ESM 的 `file://` URL。这是为什么一些纯 ESM 包在插件进程中加载时可能需要特殊处理。
