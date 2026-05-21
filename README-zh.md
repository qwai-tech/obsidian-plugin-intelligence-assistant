# Intelligence Assistant for Obsidian

将你的知识库变成一个 AI 原生工作空间。Intelligence Assistant 提供快速的聊天界面、可配置的智能代理（Agent）、MCP 工具集成、基于笔记的 RAG 检索、网络搜索、CLI 工具和 HTTP/OpenAPI 工具——无需离开 Obsidian。

> 仅支持桌面端。需要 Obsidian v1.7.2+。

## ✨ 核心功能

- **现代化聊天视图** — 流式对话，显示模型/提供商徽章、Token 用量、工具调用可视化；Agent 模式支持原生函数调用的多轮代理循环。
- **多 LLM 提供商** — OpenAI、Anthropic、Google Gemini、DeepSeek、Ollama（本地）、OpenRouter 和 SAP AI Core。可为每个提供商配置独立的 API 密钥。
- **可配置的智能代理** — 定义可复用的 Agent，支持自定义提示词、工具权限、模型策略（默认/聊天视图/固定）、RAG/网络搜索开关以及 MCP 服务器访问。
- **MCP 集成** — 连接任意 Model Context Protocol 服务器。工具目录缓存后可即时复用。内置 MCP 检查器，支持在线测试工具。
- **RAG 检索增强生成** — 使用本地向量存储为知识库建立索引，将相关笔记作为上下文注入每次查询。支持 OpenAI、Google、Ollama、DeepSeek、OpenRouter 的真实 Embedding API。
- **网络搜索** — Google CSE、Bing、Brave、SerpAPI、Tavily、SearXNG、Qwant 和 Mojeek。可配置语言区域、结果时效性和域名过滤。
- **HTTP / OpenAPI 工具** — 将任意 OpenAPI 文档（本地或远程）导入插件，每个路径/方法对自动转换为 Agent 可调用的工具。
- **CLI 工具** — 定义自定义 Shell 命令作为 Agent 可调用的工具，支持参数模板、环境变量和 27 种平台预设。
- **快速操作** — 预配置的编辑器右键菜单操作（摘要、解释、修正语法、改进写作、扩写文本）。
- **上下文附件** — 可在消息中附加文件、图片或笔记引用。

## 🚀 快速开始

### 📦 社区插件（推荐）

1. 在 Obsidian 中打开 **设置 → 第三方插件**。
2. 搜索 **"Intelligence Assistant"** 并安装。
3. 启用插件，然后打开 **设置 → Intelligence Assistant** 配置提供商。

### 🔧 手动安装

1. 下载最新版本。
2. 解压到 `<知识库>/.obsidian/plugins/intelligence-assistant/`。
3. 重新加载 Obsidian 并启用插件。

### 📋 环境要求

| 要求 | 详情 |
|---|---|
| Obsidian | v1.7.2 或更高版本（仅桌面端） |
| Node.js | 18+ 及 npm（从源码构建时需要） |
| LLM API Key | 按提供商配置（OpenAI、Anthropic、Google、DeepSeek、OpenRouter 等） |

## 💬 聊天体验

1. 通过功能区图标或 **命令面板 → Open AI chat in sidebar** 打开聊天。
2. 在工具栏中选择 **Chat** 或 **Agent** 模式。Agent 模式以原生函数调用和工具执行的方式运行代理循环。
3. 在顶部控件中选择提供商、模型、温度和最大 Token 数。
4. 在输入栏中切换 **RAG**（知识库上下文）或 **网络搜索**。
5. 使用 `@文件名` 附加文件或知识库引用。
6. 每条回复都会显示提供商、模型和 Token 用量。使用 **插入到笔记** 将回复写入当前文件。

## 🤖 智能代理

在 **设置 → Agent** 中定义。每个 Agent 具有：

- 系统提示词、工具权限、MCP 服务器访问权限
- 模型策略：`default`（使用设置中的默认模型）、`chat-view`（跟随聊天选择的模型）或 `fixed`（固定模型）
- 能力配置：RAG、网络搜索、工具调用循环（可配置最大步数）
- 自定义图标和显示名称

Agent 模式使用 **原生函数调用**（OpenAI），对其他提供商自动回退到文本解析模式。

## 🔌 MCP 工具

在 **设置 → MCP** 中连接 MCP 服务器。插件会：
- 在启动时连接并缓存工具清单
- 自动将 MCP 工具注入 Agent 循环
- 提供实时的 **MCP 检查器** 用于交互式测试工具
- 支持 stdio 传输

## 🌐 网络搜索

在 **设置 → Web Search** 中配置。从 8 种支持的提供商（Google、Bing、Brave、SerpAPI、Tavily、SearXNG、Qwant、Mojeek）中选择，并设置语言区域、结果时效性和域名过滤。凭据按知识库存储。

## 📡 HTTP / OpenAPI 工具

在 **设置 → Tools → HTTP / OpenAPI** 中添加 OpenAPI 文档。每个来源支持：
- 指向本地 `.json` 文件或远程 URL（本地缓存）
- 覆盖基础服务器 URL，注入认证头或查询参数
- 启用/禁用来源，按需重新加载工具定义

## ⌨️ CLI 工具

在 **设置 → Tools → CLI Tools** 中定义自定义 Shell 命令。每个工具支持参数模板（`{{param}}`）、参数/环境变量插入模式、工作目录、超时以及 27 种内置预设（覆盖文件操作、搜索、网络请求、代码执行、数据处理和 macOS 桌面集成）。

## 🌐 国际化

插件支持全部 46 种 Obsidian 语言。语言环境根据你的 Obsidian 语言设置自动检测。翻译由社区驱动——欢迎通过 PR 改进翻译。

[English](README.md) | [中文文档](README-zh.md)

## 🛠️ 开发

```bash
npm install          # 安装依赖
npm run dev          # 开发构建 + 文件监听
npm run lint         # ESLint（src/ + main.ts）
npm run type-check   # TypeScript 类型检查（不生成文件）
npm run test         # Jest 测试套件
npm run build        # 生产构建
```

其他脚本：`npm run dev:deploy`（构建 + 部署到本地知识库）、`npm run deploy:local`。

### ✅ 任务后规则

每次修改后，运行 `npm run lint && npm run build`。两者均通过后任务才算完成。

## 📖 文档

| 文档 | 描述 |
|---|---|
| [README.md](README.md) | 英文 README (English) |
| [docs/README.md](docs/README.md) | 文档索引 |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | 架构概览 (English) |
| [docs/architecture/overview-zh.md](docs/architecture/overview-zh.md) | 架构概览 (中文) |
| [docs/project/project-guide-en.md](docs/project/project-guide-en.md) | 开发者项目指南 (English) |
| [docs/project/project-guide-zh.md](docs/project/project-guide-zh.md) | 开发者项目指南 (中文) |
| [docs/reference/project-structure.md](docs/reference/project-structure.md) | 完整源码树参考 |

欢迎贡献、提交 Issue 和功能请求——请提交 PR 或发起讨论。
