# Intelligence Assistant：把 Obsidian 变成 AI 原生工作空间

> 一个 Obsidian 插件的进化史：从聊天面板到全能的 AI 工作站。支持 46 种语言，已上架社区插件市场。

---

Intelligence Assistant 不是又一个「在 Obsidian 里塞个 ChatGPT」的插件。它是一套完整的 AI 基础设施——聊天界面、多模型支持、智能代理、工具调用、知识库检索、网络搜索、命令行执行、OpenAPI 集成——全部深度嵌入 Obsidian 生态。

## 为什么需要这个插件？

Obsidian 的核心竞争力是「本地优先的知识管理」。但在 LLM 时代，你的笔记不该只是一个被动的存储容器。

**Intelligence Assistant 的设计哲学：让 AI 成为你的笔记操作系统，而不只是聊天机器人。**

| 场景 | 传统方式 | 用 Intelligence Assistant |
|------|---------|--------------------------|
| 想总结一篇长文 | 复制到浏览器 → 贴给 ChatGPT → 再贴回来 | 右键 → 「总结」→ 直接插入笔记 |
| 想查某个文件夹里有没有提过某个概念 | 手动搜索 → 一个个翻 | @文件夹名 + 问题，Agent 自动全文检索并分析 |
| 想批量处理文件 | 写脚本 → 终端执行 → 手动整理结果 | Agent 调用 CLI 工具，结果写回笔记 |
| 想对接外部 API | 查找文档 → 写胶水代码 | 贴个 OpenAPI Spec URL，所有端点自动变成可调用工具 |

一句话概括：**笔记不止是笔记，笔记是你的命令台。**

---

## 功能全景

### 💬 聊天体验

一个现代化的流式对话界面，看起来像 ChatGPT，但扎根在 Obsidian 里。

- **Chat / Agent 双模式一键切换**。Chat 模式做问答和头脑风暴；Agent 模式自动执行多步工具调用循环——它会自己查资料、跑命令、读写文件，直到完成任务。
- **实时模型切换**。支持 8 种提供商（OpenAI、Anthropic、Google Gemini、DeepSeek、Ollama 本地、OpenRouter、SAP AI Core、任意 OpenAI 兼容端点），顶部下拉菜单随时换模型，无需离开对话。
- **Token 用量一目了然**。每条回复左下角标注提示词和补全的 Token 消耗，方便控制成本。
- **工具调用可视化**。Agent 模式在执行工具时，会展示可折叠的「思考 → 工具调用 → 输入 → 输出」过程卡片，不是黑盒。
- **消息操作**：复制、保存为笔记、插入到当前文件、重新生成。
- **附件和引用**：`@文件名` 快速引用笔记，也可以拖入图片。

### 🤖 智能代理（Agent）

这是插件最核心的差异化功能。Agent 不只是「选个系统提示词」——它是一个完整的、可精细配置的 **AI 工作者**。

每个 Agent 可以独立定义：

- **模型策略**：跟随全局默认 / 跟随聊天选择 / 锁定特定模型，三种模式按需选择。
- **系统提示词**：库内选择或自定义编写，决定 Agent 的「人设」和行为边界。
- **工具权限**：精细到每一个工具的开关——哪些内置工具能用？哪些 MCP 工具开放？哪些 CLI 命令允许调用？颗粒度控制，不是全部或没有。
- **MCP 服务器访问**：可以选择开放整个服务器的全部工具，也可以只勾选特定工具的「白名单」。
- **能力开关**：RAG（知识库检索）、网络搜索、工具调用最大步数，全部可配。
- **外观**：自定义 emoji 图标和名称，方便在对话中快速切换 Agent。

底层用的是 **原生函数调用（Native Function Calling）**。OpenAI、DeepSeek、OpenRouter 走原生协议，对于暂不支持的模型，自动降级到文本解析模式——用户无感。

### ⌨️ CLI 工具——把终端能力交给 AI

这是插件最强大的功能之一，也是最容易被低估的。CLI 工具让 Agent **直接在操作系统层面执行命令**——不只是聊天，是干活。

#### 它怎么工作？

以「查找知识库里所有提到 microservices 的 Markdown 文件」为例：

1. 你在聊天框里输入：*"帮我找出 knowledge-base 文件夹里所有提到 microservices 的 .md 文件，提取相关段落，整理成表格"*
2. Agent 分析任务 → 决定调用 `grep` CLI 工具，参数为 `pattern: "microservices"`、`path: "knowledge-base/"`、`extension: "md"`
3. 插件在本地 Shell 里执行 `grep -r "microservices" knowledge-base/ --include="*.md"`
4. 输出返回给 Agent → Agent 读取关键文件片段 → 组织语言 → 生成汇总表格
5. 如果你想，它还能直接把结果写入新笔记

**整个流程里你没有打开终端，没有手动写一个命令，没有复制粘贴。**

#### 参数系统设计

每个 CLI 工具支持定义多个参数，三种插入模式覆盖所有常见场景：

| 插入模式 | 说明 | 适用场景 |
|---------|------|---------|
| 模板替换 | `{{参数名}}` 在命令字符串中被替换 | 命令行内部参数，如 `grep {{pattern}} {{file}}` |
| 命令行参数 | 参数作为独立位置的参数追加 | 动态 flag，如 `--count={{n}}` |
| 环境变量 | 参数注入为 Shell 环境变量 | 敏感信息或需要 `$VAR` 引用的场景 |

参数类型支持 String、Number、Boolean，可标记必填或可选。

#### 27 种内置预设

插件预置了常用工具的配置模板，一键添加，无需手动写配置：

**📄 文件操作**
- `cat` — 读取文件内容
- `ls` — 列出目录
- `find` — 按名称查找文件
- `grep` — 文本搜索
- `rg`（ripgrep）— 毫秒级全文搜索

**🌐 网络请求**
- `curl` — HTTP GET
- `curl --data` — HTTP POST

**💻 代码执行**
- `python` — 运行 Python 脚本
- `node` — 运行 JavaScript
- `bash` — 运行任意 Shell 脚本

**📊 数据处理**
- `jq` — JSON 查询和处理
- `wc` — 字数/行数统计

**🖥 系统信息**
- `date` — 当前日期时间
- `pwd` — 当前工作目录
- `whoami` — 当前用户
- `uname` — 系统信息

**🍎 macOS 桌面集成**
- `open` — 打开文件/URL/应用
- `open -a` — 启动指定应用
- `safari` / `chrome` / `firefox` — 在指定浏览器中打开 URL
- `pbcopy` — 复制到系统剪贴板
- `pbpaste` — 粘贴剪贴板内容
- `say` — 文本转语音朗读
- `osascript` — 执行 AppleScript 脚本
- `notify` — 发送桌面通知
- `screencapture` — 截屏
- `applescript:list-apps` — 列出正在运行的应用

macOS 预设的强大之处：**你可以用自然语言控制桌面。**比如「打开 Safari 搜索 Obsidian MCP plugin」——不需要教 AI 怎么拼 URL，它自己就构建好了。

#### 更多用法

CLI 工具的能力完全取决于你的想象力：

- 「把这 20 个 JSON 文件里的 `status` 字段提取出来，统计每种状态的个数」→ jq + wc
- 「帮我看看这台机器什么时候重启过」→ 系统命令
- 「抓取这个网页的内容，把表格转成 Markdown」→ curl + html-to-markdown 脚本
- 「下载这个数据集，跑一段 Python 分析，把结果写成 Obsidian 笔记」→ curl + python + write_file

### 🔌 MCP 集成

MCP（Model Context Protocol）是 Anthropic 提出的开放标准协议，让 LLM 和外部工具/数据源实现标准化通信。Intelligence Assistant 是 **Obsidian 生态中最早深度集成 MCP 的插件之一**。

- **支持 stdio 传输**。市面上大部分 MCP 服务器都基于这个协议，开箱即用。
- **连接即缓存**。启动时自动连接配置好的服务器，工具列表持久化到本地。
- **作为 Agent 工具的自动注入**。Agent 循环中自动加载已启用服务器的所有工具（或白名单子集），无需手动绑。
- **内置 MCP 检查器**。类似 Postman 的调试面板——可以实时浏览服务器提供的工具、查看参数 Schema、手动测试调用、查看返回值和错误日志。

### 📚 RAG 检索增强生成

让 AI 能「读」你知识库里的笔记。不是简单地粘贴几段文字，而是一套完整的向量检索流水线：

- 把笔记切片、Embedding、存入向量数据库（内存或磁盘）
- 每次提问时自动检索最相关的片段作为上下文
- 回复中标注引用了哪些文档

支持 OpenAI、Google、DeepSeek、Ollama、OpenRouter 的 Embedding API。灵活的切片策略、文件过滤规则、相似度阈值，确保检索质量。文件修改后自动重新 Embedding。

### 🌍 网络搜索

AI 不知道今天发生了什么？打开网络搜索，让 Agent 自己去网上找答案。支持 **9 种搜索引擎**——DuckDuckGo（免费免 Key）、Google CSE、Bing、Brave、SerpAPI、Tavily、SearXNG（可自托管）、Qwant、Mojeek。可配置智能自动触发、地区/语言过滤、时效控制、域名黑白名单。

### 📡 HTTP / OpenAPI 工具

这意味着——任何有 OpenAPI 文档的 REST API，都可以变成 Agent 可调用的工具。贴一个 Spec URL（本地文件或远程地址），所有端点自动注册。支持 HTTP Header 和 Query 参数两种认证方式。远程 Spec 本地缓存。

### ⚡ 快速操作

选中文字 → 右键 → AI 一键处理。内置扩写、总结、改进写作、修正语法、解释五种操作。每种可以自定义模型和提示词，也可以添加自己的操作。

### 🌐 国际化

自动检测 Obsidian 界面语言来切换插件语言。支持全部 46 种 Obsidian 语言变体。翻译由社区驱动、AI 辅助——欢迎提交改进 PR。

---

## 快速开始

1. Obsidian → 设置 → 第三方插件 → 浏览 → 搜索 **"Intelligence Assistant"** → 安装
2. 启用后打开 **设置 → Intelligence Assistant → LLM** → 添加一个提供商（填入 API Key）
3. 到 **Models** 选项卡 → 点「刷新模型列表」
4. 回到聊天页面，选一个模型，开始使用

---

## 最后

这个插件在持续活跃开发中。开源地址：[github.com/qwai-tech/obsidian-plugin-intelligence-assistant](https://github.com/qwai-tech/obsidian-plugin-intelligence-assistant)

从最初的 ReAct 文本解析到现在的原生函数调用架构，从只支持两三种语言到覆盖全部 46 种 Obsidian 语言，从简单的聊天模式到完整的 Agent + 工具生态——每一个版本都在朝「让 Obsidian 成为 AI 时代最好的笔记工具」这个方向迭代。

如果你有兴趣参与进来——不管是提 Issue、写 PR、改进翻译，还是分享你的使用场景——都非常欢迎。
