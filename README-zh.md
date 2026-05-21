# Intelligence Assistant — 把 Obsidian 变成 AI 原生工作空间

> 一个 Obsidian 插件的进化史：从聊天面板到全能的 AI 工作站。

Intelligence Assistant 不是又一个「在 Obsidian 里塞个 ChatGPT」的插件。它是一套完整的 AI 基础设施——聊天界面、多模型支持、智能代理、工具调用、知识库检索、网络搜索、命令行执行、OpenAPI 集成——全部深度嵌入 Obsidian 生态。

当前版本 **0.0.8**，已上架 Obsidian 社区插件市场。桌面端，支持 46 种语言。

---

## 为什么需要这个插件？

Obsidian 的核心竞争力是「本地优先的知识管理」。但 LLM 时代，你的笔记不该只是一个被动的存储容器。

**Intelligence Assistant 的设计哲学：让 AI 成为你的笔记操作系统，而不只是聊天机器人。**

| 场景 | 传统方式 | 用 Intelligence Assistant |
|------|---------|--------------------------|
| 想总结一篇长文 | 复制到浏览器 → 贴给 ChatGPT → 再贴回来 | 右键 → 「总结」→ 直接插入笔记 |
| 想查某个文件夹里有没有提过某个概念 | 手动搜索 → 一个个翻 | @文件夹名 + 问题，Agent 自动 grep + 分析 |
| 想批量处理文件 | 写脚本 → 终端执行 → 手动整理结果 | Agent 直接调用 CLI 工具，结果写回笔记 |
| 想对接外部 API | 写胶水代码 | 贴个 OpenAPI Spec URL，所有端点自动变工具 |

这就是「AI 原生工作空间」的含义：**笔记不止是笔记，笔记是你的命令台。**

---

## ✨ 功能全景

### 💬 聊天视图

一个现代化的流式对话界面，支持：

- **Chat / Agent 双模式**：Chat 模式做问答和头脑风暴；Agent 模式执行多步工具调用循环。
- **模型实时切换**：顶部控件可随时切换提供商和模型，无需离开对话。
- **Token 用量可视化**：每条回复标注提示词和补全的 Token 消耗。
- **工具调用轨迹**：Agent 模式下自动显示「思考 → 工具调用 → 结果」的可折叠执行过程卡片。
- **消息操作**：复制、保存为笔记、插入到当前文件、重新生成。
- **附件支持**：`@文件名` 引用笔记，或直接拖入图片。

### 🧠 多模型支持

| 提供商 | 类型 | 特点 |
|--------|------|------|
| OpenAI | 云端 | GPT 全系列，原生函数调用 |
| Anthropic | 云端 | Claude 全系列，长上下文 |
| Google Gemini | 云端 | 多模态，免费额度 |
| DeepSeek | 云端 | 高性价比，推理模型 |
| Ollama | 本地 | 完全离线，零成本 |
| OpenRouter | 代理 | 统一网关，对接 200+ 模型 |
| SAP AI Core | 企业 | SAP 生态集成 |
| 自定义 OpenAI 兼容 | 自建 | 兼容任意 OpenAI API 端点 |

每个提供商独立配置 API Key、Base URL，模型列表自动拉取。你可以同时配多个提供商，随时切换。

### 🤖 智能代理（Agent）

这是插件的核心差异化功能。Agent 不只是「选个系统提示词」——它是一个完整的**可配置 AI 工作者**。

每个 Agent 可以定义：

- **模型策略**：跟随默认 / 跟随聊天选择 / 固定特定模型
- **系统提示词**：从提示词库中选择，或直接自定义
- **工具权限**：精细到每个工具的开/关——哪些内置工具可用？哪些 MCP 工具可用？哪些 CLI 工具可用？全部独立控制
- **MCP 服务器访问**：完整服务器开放 / 选择性工具白名单
- **能力开关**：RAG 检索增强、网络搜索、工具调用最大步数
- **外观**：自定义图标和名称

Agent 模式下，插件使用 **原生函数调用**（OpenAI/DeepSeek/OpenRouter）。对于不支持原生函数调用的模型，自动降级为文本解析模式，确保所有模型都能使用 Agent 能力。

### 🔌 MCP（Model Context Protocol）

MCP 是 Anthropic 提出的开放协议，让 LLM 和外部工具/数据源标准化通信。Intelligence Assistant 是 **Obsidian 生态中最早深度集成 MCP 的插件之一**。

- **一键连接**：配置命令和环境变量，插件自动管理生命周期
- **工具缓存**：连接一次，工具列表持久化，离线可用
- **自动注入**：Agent 循环中自动挂载已启用的 MCP 工具
- **MCP 检查器**：内置调试面板，可实时浏览、测试任意 MCP 工具的参数和返回值
- **Stdio 传输**：支持所有基于标准输入输出的 MCP 服务器

### 📚 RAG 检索增强生成

将你的知识库变成可查询的向量数据库：

- **自动索引**：选择向量存储（内存 / 磁盘），构建知识库 Embedding
- **嵌入模型**：支持 OpenAI、Google、DeepSeek、Ollama、OpenRouter 的 Embedding API
- **灵活的切片策略**：递归智能分割 / 固定大小 / 按句子 / 按段落
- **文件过滤**：按文件夹、文件类型、标签排除/包含
- **相关性评分**：可配置的相似度阈值和结果数量
- **自动更新**：文件变化时自动重新 Embedding

### 🌍 网络搜索

AI 不知道今天发生了什么？打开网络搜索，让 Agent 自己去查：

- **8 种搜索引擎**：DuckDuckGo（免费免 Key）、Google CSE、Bing、Brave、SerpAPI、Tavily、SearXNG（自托管）、Qwant、Mojeek
- **智能触发**：配置「自动搜索」阈值，当问题需要实时信息时自动触发
- **地区/语言过滤**：ISO 语言代码 + 国家代码
- **时效控制**：任意时间 / 过去一小时 / 24 小时 / 一周 / 一月 / 一年
- **域名白名单/黑名单**：精确控制搜索范围

### ⌨️ CLI 工具 — 把终端能力交给 AI

这是插件最强大的功能之一。CLI 工具让 Agent **直接在你的电脑上执行命令**——不只是聊天，而是干活。

#### 工作原理

1. 你在 **设置 → Tools → CLI Tools** 中定义一个工具
2. 指定要执行的命令、参数、工作目录、超时时间
3. Agent 在对话中调用这个工具，传入参数
4. 插件在本地 Shell 中执行命令，将输出返回给 Agent
5. Agent 根据输出决定下一步

#### 参数系统

每个 CLI 工具支持定义多个参数，每个参数有三种插入模式：

| 插入模式 | 说明 | 示例 |
|---------|------|------|
| **模板替换** | `{{参数名}}` 在命令行中被替换 | `grep {{pattern}} {{file}}` |
| **命令行参数** | 参数作为独立参数追加 | `--name=value` |
| **环境变量** | 参数注入为环境变量 | `$PATTERN` |

参数类型支持 String、Number、Boolean，可标记为必填。

#### 内置预设（27 种）

插件预置了 27 种常用工具的配置模板，一键添加：

**文件操作**
- `cat` — 读取文件内容
- `ls` — 列出目录
- `find` — 按名称查找文件
- `grep` — 文本搜索
- `rg` (ripgrep) — 高速搜索

**网络请求**
- `curl` — HTTP GET 请求
- `curl --data` — HTTP POST 请求

**代码执行**
- `python` — 运行 Python 脚本
- `node` — 运行 JavaScript
- `bash` — 运行 Shell 脚本

**数据处理**
- `jq` — JSON 处理和查询
- `wc` — 字数/行数统计

**系统信息**
- `date` — 当前时间
- `pwd` — 当前目录
- `whoami` — 当前用户
- `uname` — 系统信息

**macOS 桌面集成**
- `open` — 打开文件/URL
- `open -a` — 启动应用
- `safari` — 在 Safari 中打开 URL
- `chrome` — 在 Chrome 中打开 URL
- `firefox` — 在 Firefox 中打开 URL
- `pbcopy` — 复制到剪贴板
- `pbpaste` — 从剪贴板粘贴
- `say` — 文本转语音
- `osascript` — 执行 AppleScript
- `notify` — 桌面通知
- `screencapture` — 截屏
- `applescript:list-apps` — 列出运行中的应用

#### 典型用例

> **「帮我查查 knowledge-base 文件夹里所有提到 microservices 的 .md 文件，提取相关段落，汇总成一张表」**
>
> Agent 会：调用 `grep` → 分析结果 → 调用 `cat` 读取关键文件 → 组织语言 → 生成汇总表格 → 写回笔记。

> **「打开 Safari，搜索 Obsidian MCP plugin」**
>
> Agent 调用预设 `safari` 工具，参数为搜索 URL。

### 📡 HTTP / OpenAPI 工具

把任意 REST API 变成 Agent 可调用的工具：

- **自动发现**：贴一个 OpenAPI Spec 的 URL 或本地文件路径，所有端点自动注册
- **认证注入**：支持 HTTP Header 和 Query 参数两种认证方式
- **缓存与刷新**：远程 Spec 本地缓存，支持按需重新拉取
- **启用/禁用**：每个源独立控制，不影响其他工具

### ⚡ 快速操作

选中文本 → 右键 → 一键 AI 处理：

- **扩写**：让文字更详细、更丰富
- **总结**：提炼核心要点
- **改进写作**：优化表达和结构
- **修正语法**：修正拼写和语法错误
- **解释**：用通俗语言解释复杂内容

每种操作都可以自定义模型和提示词模板。

### 🌐 国际化

自动检测你的 Obsidian 界面语言，切换对应翻译。支持全部 46 种 Obsidian 语言变体。社区驱动的 AI 辅助翻译——欢迎提交改进 PR。

---

## 🚀 快速开始

### 📦 社区插件安装

1. Obsidian → **设置 → 第三方插件 → 浏览**
2. 搜索 **Intelligence Assistant**
3. 安装并启用

### 🔧 手动安装

从 [Releases](https://github.com/qwai-tech/obsidian-plugin-intelligence-assistant/releases) 下载 `main.js`、`manifest.json`、`styles.css` 以及 `locales/` 目录，放入 `<vault>/.obsidian/plugins/intelligence-assistant/`。

### ⚙️ 初始配置

1. 打开 **设置 → Intelligence Assistant**
2. 在 **LLM** 选项卡中添加至少一个提供商，填入 API Key
3. 在 **Models** 选项卡中点击「刷新模型列表」
4. 返回聊天界面，选择一个模型，开始对话

---

## 🛠️ 开发

```bash
npm install          # 安装依赖
npm run dev          # 开发构建 + 文件监听
npm run dev:deploy   # 构建 + 部署到本地 Obsidian
npm run lint         # ESLint
npm run test         # Jest
npm run build        # 生产构建
node scripts/deploy.js --local  # 部署到本地 Obsidian
```

---

## 📖 文档索引

| 文档 | 内容 |
|------|------|
| [README.md](README.md) | English README |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | 架构概览 (English) |
| [docs/architecture/overview-zh.md](docs/architecture/overview-zh.md) | 架构概览 (中文) |
| [docs/project/project-guide-zh.md](docs/project/project-guide-zh.md) | 开发者指南 (中文) |

---

欢迎 Issue、PR 和功能建议。
