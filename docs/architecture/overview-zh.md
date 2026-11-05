# 架构总览 — 0.1.0

[English](overview-en.md) · [详细执行契约（英文）](execution-contracts.md) · [开发指南](../project/project-guide-zh.md)

Intelligence Assistant 使用按功能划分的服务、基于端口的智能体回合内核，以及显式的 Obsidian 适配器。`main.ts` 管理插件生命周期，`src/bootstrap/` 装配服务，`packages/obsidian-llm` 管理提供商协议、HTTP 和模型身份。

## 职责划分

| 区域 | 职责 |
|---|---|
| `main.ts`、`src/bootstrap/` | 宿主注册、装配、生命周期、设置持久化接线和集成 |
| `src/ui/` | 视图、控制器、设置 Tab、对话框、编辑器操作和渲染 |
| `src/features/` | 智能体/聊天用例、设置、知识/工具端口及功能类型 |
| `src/adapters/` | Obsidian/文件持久化、RAG、嵌入、子进程和 MCP stdio |
| `src/core/` | 共享帮助函数、路径、通知和默认值 |
| `src/i18n/`、`src/capabilities/` | 翻译资源和 Obsidian API 能力清单 |
| `packages/obsidian-llm/` | 提供商注册、模型发现/身份、原生协议、HTTP 和 Hub 契约 |

实际允许的导入由 `eslint.config.mts` 约束，功能对外使用显式 `index.ts` 导出。这是职责与依赖结构，不是进程沙箱；宿主相关工具和适配器仍使用 Obsidian 的权限。

## 启动与释放

1. `main.ts` 安装通知/HTTP 适配器，注册视图、命令、编辑器集成和设置。
2. `SettingsStore` 加载、验证、迁移旧设置并解析 SecretStorage 引用。
3. `create-services.ts` 只创建一次共享服务，视图通过 `whenServicesReady()` 等待。
4. 延迟初始化处理版本标记、默认智能体、会话迁移和工具源。配置为自动连接的 MCP 可以启动外部进程。
5. 释放阶段取消并等待已有运行，关闭服务。取消不会撤销已经完成的外部副作用。

`RunCoordinator` 管理运行所有权、准入和取消，状态保存在内存中；JSONL 日志不会把它变成持久化工作流或回放引擎。

## 请求与智能体内核

`ChatController` 收集用户文本、附件和引用。`ChatService` 准备普通聊天，或把 Agent 模式交给 `AgentEngineLoop`。用于网络搜索的原始输入与扩展后的私有上下文分离。

智能体引擎快照化当前智能体/模型策略、收集配置的上下文、解析授权工具，再运行 `kernel/turn-kernel.ts`。每个回合请求模型、验证/审阅结果，并按顺序执行返回的工具调用。内核端口包括 `ContextAssembler`、`ModelPort`、`ToolRunner` 和 `TurnGuard`。

关键契约：

- `Budget` 从宿主配置的步数预算开始，模型初始估算可提高但不能降低它；估算上限至少覆盖配置预算。工具尝试消耗步数，失败和执行前拒绝分别计数，参见 [ADR-002](adr-002-agent-budget-and-trace.md)。
- 请求预算包含工具定义/参数、系统/上下文及输出预留。`HistoryCompactor` 限制历史大小，保留有界的省略/核验证据；不会使已省略的源文件重新具有权威性。
- 完成、参数和计数检查可以要求修正或停止不完整运行，不证明任意语义任务、领域算术或所有自然语言表述都正确。
- 模型输出限制、过滤及不完整流属于保留部分结果的错误，不是成功结束。不会悄悄增大预算或改变推理模式重试生成。
- Stop 沿模型、HTTP 和子进程路径传播。超时或中断的外部操作可能具有不确定结果。

声明式的读取后使用规则、支持的计数字段等详见[执行契约](execution-contracts.md)。

## 续跑与计数

`task-checkpoint.ts` 在裁剪聊天历史前，把简短 `Continue.` 等已识别续跑请求关联到原任务，保存有界的成功观察、待处理/不确定动作、权限限制和上次运行回执。重读已知文件会增加访问次数，不会重新定义未完成工作的边界。

本次运行的实时计数放在先前工具结果之后；本次与上次运行回执具有独立范围。`execution-count-guard.ts` 检查支持的运行时字段和已识别的显式读取计数表述，可拒绝矛盾回答，但不是通用算术验证器。

重载后续跑利用会话中保存的证据，不会自动回放日志，也不保证外部副作用恰好一次或模型总能选择正确恢复点。实际文件与工具结果仍需作为证据。

## 工具与授权

`ToolSourceManager` 注册/重新同步内置、CLI、OpenAPI 和 MCP 源。`ToolRegistry` 校验参数、解析稳定工具身份，并执行当前任务捕获的绑定。源重载后旧绑定失效。

注册的内置工具见[使用指南](../user-guide-zh.md#内置工具)，其中没有内置移动/删除工具。可用工具由全局启用状态、智能体权限、已识别的任务/宿主限制共同决定，任务限制不能授予新能力。

支持的内置知识库写入返回结构化提案。只有智能体设置为真且宿主任务已授权时，`execution-policy.ts` 才启用自动应用；自由文本意图本身不是授权。默认路径保留 Apply 卡片，授权自动应用后返回实际应用结果，参见 [ADR-001](adr-001-safety-and-engine-usage.md) 和 [ADR-003](adr-003-autonomous-write.md)。

CLI/MCP/HTTP 可以依据进程或服务权限直接产生副作用。提案验证和子进程环境变量白名单不提供文件/网络隔离，多项副作用也不是原子事务。

## 持久化与密钥

`ObsidianSettingsPersistence` 通过宿主 `Plugin.saveData` 保存 format-2 `data.json`，包含用户配置、提供商、提示词和智能体。`SettingsStore` 串行处理本地修改，保存失败后回滚工作状态。适配器保留 `data.json.bak`，旧的分散设置在成功迁移后删除。

模型/MCP 缓存、用量、记忆和向量索引保存在 `data/` 下。使用 `JsonFile` 的仓库采用临时文件/重命名恢复；会话为独立 JSON，运行日志为带保留策略的 JSONL。这些机制不提供跨进程/Sync 事务，也不意味着所有宿主设置写入都是多文件原子操作。

提供商/API 密钥、SAP Service Key、受支持的搜索密钥及 OpenAPI 认证值经 `SecretVault` 端口使用 Obsidian SecretStorage，配置只保存名称。任意 CLI/MCP 环境值不自动转为密钥。同步配置与在另一设备配置密钥是两回事，实际 Sync 行为取决于宿主配置。

## RAG 与记忆

`RAGManager` 实现知识与记忆端口：笔记文本 → 分块 → 配置的嵌入服务 → 本地向量存储 → 检索 → 可选模型评分。内容哈希和嵌入模型身份用于避免重复/不兼容嵌入。存储模式、上下文限制及纳入/排除规则影响运行行为，启用增量嵌入后会跟随知识库事件。

索引在本地，嵌入/评分提供商可以在远端。记忆按所属智能体、模式和保留数量隔离；无记忆模式跳过当前运行的记忆读取/写入，保留既有数据。

## LLM 包

`provider-definitions.ts` 统一管理构建和发现。OpenAI 兼容、Anthropic、Google、Ollama 和 SAP 路径使用相应原生协议，实际能力取决于模型/部署。自定义连接 ID 用于区分不同网关暴露的同名模型。

`obsidian-http.ts` 提供宿主传输。渲染进程 CORS 失败时可通过宿主缓冲 SSE，仍需验证真实结束元数据。`resilient-http.ts` 只重试安全操作：默认安全方法或显式安全授权；可重试状态码本身不会授权重放任意 POST 或生成流。

LLM Hub 暴露冻结的能力门面，不返回密钥/原始配置。这是共享宿主内的 API 封装，不隔离其他已启用插件。

## 界面与验证

`ChatView` 组合控制器与渲染器，设置界面保留九个顶部 Tab 及其子页。本次文档更新不修改界面代码或样式。

[测试文档](../reference/testing.md) 区分确定性/mock 测试、真实组件检查及绑定构建的发布门禁。0.1.0 源码和已记录的 0.0.23 完整真实门禁拥有独立来源，见[版本状态](../releases/0.1.0.md)。历史设计计划不是当前运行时保证。
