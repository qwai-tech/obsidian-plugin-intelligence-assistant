# V2ex

## 标题

做了个 Obsidian AI 插件：多模型聊天 + Agent ReAct + MCP + RAG + OpenAPI/CLI 工具，首发，欢迎试用和反馈

---

## 正文

花了几个月把一直想要的 AI 工作站塞进了 Obsidian，今天正式发出来。

核心设计思路是：**不离开 Obsidian 完成所有 AI 相关操作**——聊天、Agent 自动化、知识库检索、网络搜索、外部工具调用，全部在一个插件里。

---

### 模型支持

支持 7 个 Provider，每个单独配置凭据：

- OpenAI（含 Azure 兼容端点）
- Anthropic Claude
- Google Gemini
- DeepSeek
- Ollama（本地，数据不出机器）
- OpenRouter（统一接入 100+ 模型）
- SAP AI Core

聊天界面顶部直接切换 Provider 和具体模型，不需要改配置文件。每条回复显示 Provider 徽章、模型名和 Token 用量。

---

### Agent 模式

基于 ReAct 架构，支持多步骤工具调用循环：

- OpenAI Provider 使用原生 Function Calling
- 其他 Provider 回退到文本解析工具调用（prompt-based）
- 可定义多个具名 Agent，每个 Agent 独立配置：
  - 系统提示
  - 工具权限白名单（哪些工具可用）
  - MCP Server 访问权限
  - 模型策略：`default`（跟全局设置）/ `chat-view`（跟聊天界面选择）/ `fixed`（固定指定模型）
  - ReAct 最大步数
  - RAG / Web Search 开关
  - 自定义图标和显示名

---

### MCP 集成

连接任意遵循 Model Context Protocol 的 Server（stdio 传输）：

- 插件启动时自动连接并缓存工具目录
- Agent 模式下工具自动注入 ReAct 循环
- 内置 **MCP Inspector**：可在插件界面直接发起工具调用并查看原始响应，不需要切到终端调试

---

### RAG

本地向量库，对整个 Obsidian vault 建索引：

- Embedding 支持：OpenAI、Google、Ollama（本地）、DeepSeek、OpenRouter
- 每次对话自动检索 top-k 相关笔记注入上下文
- 支持手动触发重建索引

---

### Quick Actions

编辑器右键菜单集成，选中文字后可直接触发预置 AI 操作：

- 总结 / 解释 / 修复语法 / 改写润色 / 扩写

不需要打开聊天面板，不需要复制粘贴，操作结果直接插入当前文件。写作场景下用得最频繁。

---

### Web Search

支持 8 家搜索引擎，结果直接注入对话上下文：

Google CSE、Bing、Brave、SerpAPI、Tavily、SearXNG、Qwant、Mojeek

可配置：搜索语言（locale）、内容新鲜度（freshness）、域名过滤（domain filter）。凭据按 vault 存储。

---

### HTTP / OpenAPI 工具

把任意 OpenAPI spec 转成 Agent 可调用工具：

- 支持本地 `.json` 文件或远程 URL（本地缓存）
- 自动解析每个 `path/verb` 对成独立工具
- 支持覆盖 base server URL
- 支持注入全局 auth header 或 query param
- 可按 source 单独启用/禁用，支持按需重新加载

---

### CLI 工具

把 shell 命令封装成 Agent 可调用工具：

- 参数模板语法：`{{param}}`
- 支持 argument 模式或 env 变量模式传参
- 可配置工作目录、timeout、平台预设
- 内置 25+ 预设，覆盖：文件操作、搜索、网络、代码分析、数据处理、系统信息

---

### 其他细节

- 消息支持附件：文件、图片、vault 内文件引用（`@文件名` 语法）
- 每条回复可一键「插入到当前文件」
- 所有凭据和配置按 vault 存储，不共享

---

**安装**

Obsidian → 设置 → 社区插件 → 搜索 `Intelligence Assistant`

或 GitHub：`github.com/qwai-tech/intelligence-assistant`

Desktop only（Obsidian 本身的限制），需要 Obsidian v1.7.2+。

目前 v0.0.6，核心功能稳定，边缘 case 还在打磨。有问题欢迎评论区讨论，BUG 欢迎提 Issue，也欢迎 PR。
