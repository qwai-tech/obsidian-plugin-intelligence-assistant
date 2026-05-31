# 项目指南

本文档面向开发者，用于快速理解 `obsidian-plugin-intelligence-assistant` 仓库。它补充根目录 [README](../../README.md) 的用户说明，以及 `docs/architecture/` 下的架构总览。

## 这个插件在做什么

Intelligence Assistant 的目标，是把 Obsidian vault 变成一个本地 AI 工作区。当前能力主要包括：

- 多模型提供商的流式聊天
- 可复用的自定义 Agent
- MCP 工具集成
- 基于 vault 内容的 RAG
- Web 搜索与 OpenAPI 自动生成工具
- 快捷动作与编辑器侧 AI 能力

仓库体量较大，因为它同时承载了 UI、提供商接入、持久化、RAG 管线，以及一部分仍在推进中的架构重构。

## 当前代码库结构

仓库总体遵循分层设计：

- `main.ts`：插件启动、设置加载与保存、视图注册、延迟初始化
- `src/core`：容器、配置 schema/manager、事件总线、错误处理、基础设施能力
- `src/domain`：会话与 agent 领域模型
- `src/application/services`：聊天、工具、MCP、RAG、存储、记忆、OpenAPI、Web 搜索等编排服务
- `src/infrastructure`：LLM 提供商、持久化、RAG/向量库实现
- `src/presentation`：聊天视图、设置页、模态框、控制器、处理器、状态对象
- `src/types`：插件设置与各功能域的共享类型

需要特别注意的一点：仓库里同时存在“生产中的聊天实现”和“尚未完全接线完成的 MVC 子树”。真正在线上路径里承担核心行为的是 [`chat-view.ts`](../../src/presentation/views/chat-view.ts)，而 `src/presentation/components/chat/` 下的一些 controller/component 更像重构中的过渡层。

## 关键运行链路

### 启动流程

插件加载时会依次完成：

1. 初始化 repository 与存储服务
2. 从用户配置和旧版插件数据中恢复 settings
3. 回填 prompts、agents、providers、model cache、MCP 元数据
4. 注册聊天视图、命令、ribbon 图标和设置面板
5. 异步执行延迟任务，包括会话迁移、默认 agent 初始化、MCP 自动连接、OpenAPI 工具重载、CLI 工具重载

这条主链路集中在 [`main.ts`](../../main.ts)。

### 聊天请求链路

生产环境下的聊天行为主要由 [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts) 驱动：

- 收集输入文本、附件和 vault 引用
- 解析当前模型、prompt、agent 与功能开关
- 按需注入 RAG 上下文与 Web 搜索结果
- 调用目标 provider
- 将流式输出持续回填到 UI
- 持久化更新后的会话和消息

### 工具调用链路

工具统一由 [`src/application/services/tool-manager.ts`](../../src/application/services/tool-manager.ts) 管理：

- 启动时注册内置工具
- 动态接入 MCP 工具
- 将 OpenAPI spec 转换为可执行工具
- 视配置加载 CLI 相关工具

如果要扩展工具系统，这里是第一入口。

### RAG 管线

RAG 主要分布在：

- [`src/infrastructure/rag-manager.ts`](../../src/infrastructure/rag-manager.ts)
- [`src/infrastructure/vector-store.ts`](../../src/infrastructure/vector-store.ts)
- [`src/infrastructure/embedding-manager.ts`](../../src/infrastructure/embedding-manager.ts)
- [`src/infrastructure/document-grader.ts`](../../src/infrastructure/document-grader.ts)

整体流程是：读取 vault 文件 -> 分块 -> 生成 embedding -> 写入本地向量索引 -> 相似度检索 -> 可选文档评分 -> 注入 prompt。

## 数据持久化模型

这个插件不是单一存储层，至少涉及以下几类数据：

- 用户配置文件：通过 `src/constants.ts` 中的路径写入规范化配置
- repository 管理的 JSON 数据：prompts、providers、agents、model cache、MCP 元数据
- Obsidian vault 内存储：会话与消息
- 本地向量存储：RAG 分块与 embedding 数据

因此，任何 settings 迁移、字段新增、结构调整，都要同时检查“用户配置文件”和“repository-backed 数据”是否保持一致。

## 建议优先阅读的文件

第一次进入仓库，建议按这个顺序看：

1. [`main.ts`](../../main.ts)
2. [`src/types/settings.ts`](../../src/types/settings.ts)
3. [`src/presentation/views/chat-view.ts`](../../src/presentation/views/chat-view.ts)
4. [`src/application/services/tool-manager.ts`](../../src/application/services/tool-manager.ts)
5. [`src/infrastructure/llm/model-manager.ts`](../../src/infrastructure/llm/model-manager.ts)
6. [`src/infrastructure/rag-manager.ts`](../../src/infrastructure/rag-manager.ts)

## 当前工程热点

- 架构重构尚未完全收束，存在并行实现与历史残留。
- settings 落盘分散在多处，迁移最容易出隐性问题。
- MCP、OpenAPI、RAG 都会引入异步初始化，启动顺序相关 bug 比较常见。
- 一些 UI 文件很大，渲染、状态更新和副作用逻辑耦合较深。

## 建议开发流程

日常开发建议至少走完：

1. 先确认自己改的是实际运行路径，而不是只改到重构中的占位代码。
2. 如果目标模块已有测试，补齐或更新对应测试。
3. 运行 `npm run type-check`。
4. 运行 `npm run lint`。
5. 在结束前运行 `npm run build`。

## 扩展建议

- 新增 LLM provider，通常要改 `src/infrastructure/llm/` 和模型解析逻辑。
- 新增内置工具，通常落在 `src/application/services/`，并由 `ToolManager` 注册。
- 新增 settings 字段，需要同时改类型、配置转换、设置 UI 和持久化链路。
- 新增聊天能力时，要优先验证 `chat-view.ts` 的生产路径，不要只改 controller 子树。
