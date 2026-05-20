# 知乎

## 标题

我用一个 Obsidian 插件，替代了 ChatGPT 网页版、Perplexity 和好几个 AI 工具——Intelligence Assistant 深度体验

---

## 正文（约1500字）

> 如果你用 Obsidian 做知识管理，同时每天还要在好几个 AI 工具之间反复横跳，这篇文章可能会改变你的工作流。

### 背景：我的 AI 工具混乱现状

在遇到 Intelligence Assistant 之前，我的日常工作流大概是这样的：

在 Obsidian 里写笔记 → 想到一个问题 → 打开 ChatGPT 网页 → 手动复制相关笔记内容 → 问完之后再把答案粘贴回 Obsidian。

如果还需要查最新资料，再开一个 Perplexity。如果要用工具调用，再切到其他地方。

这种"多工具协作"听起来很强大，实际上每天光是切换 Tab 和复制粘贴就要浪费大量时间，更别提每次都要给 AI 重新解释笔记背景了。

### Intelligence Assistant 是什么

Intelligence Assistant 是一个 Obsidian 社区插件，目标很直接：**把 AI 工作站整个搬进 Obsidian**。

它不是简单地在侧边栏加个对话框，而是完整实现了：

**1. 多模型支持**

支持 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、Ollama（本地模型）、OpenRouter、SAP AI Core。在聊天界面顶部直接切换 Provider 和具体模型，不需要来回改配置。

对于注重数据隐私的用户，Ollama 本地模式意味着所有对话都在自己的机器上处理，数据不经过任何第三方服务器。

**2. Agent 模式**

这是插件最强的部分。Agent 模式使用原生 Function Calling（OpenAI），对其他 Provider 则自动回退到基于文本的工具调用解析。

你可以为不同用途定义多个 Agent，每个 Agent 有独立的系统提示、工具权限、MCP 服务器访问权限和最大步骤数。Agent 会自动执行多步任务，比如"搜索这个话题的最新资料，结合我的相关笔记，写一份摘要，插入当前文件"——一个指令完成。

**3. RAG（检索增强生成）**

对 Obsidian 用户来说，这可能是最有价值的功能。Intelligence Assistant 可以对你的整个 vault 建立本地向量索引，支持 OpenAI、Google、Ollama、DeepSeek、OpenRouter 的 embedding API。

开启 RAG 后，每次对话都会自动检索最相关的笔记内容注入上下文。你的 AI 终于"认识"你的知识库了。

**4. 网络搜索**

支持 8 家搜索引擎：Google CSE、Bing、Brave、SerpAPI、Tavily、SearXNG、Qwant、Mojeek。可以配置搜索语言、内容新鲜度和域名过滤。搜索结果会直接注入对话上下文。

**5. Quick Actions（快速操作）**

这是最容易被低估的功能。在任意笔记中选中文字，右键菜单会出现 AI 快速操作：**总结、解释、修复语法、改写润色、扩展内容**。

不需要打开聊天面板，不需要复制粘贴，选中即用。对于重度写作用户来说，这可能是每天用得最多的功能。

**6. MCP 工具集成**

支持连接任意遵循 Model Context Protocol 的 Server（stdio 传输）。插件在启动时自动连接并缓存工具目录，Agent 模式下可以直接调用这些工具。还内置了 MCP Inspector，可以在插件内直接测试工具调用。

**7. HTTP / OpenAPI 工具**

这个功能相当强大：你只需要指向任意 OpenAPI 规范文件（本地 JSON 或远程 URL），插件会自动把每个接口解析成 Agent 可以调用的工具。相当于把任意 API 都变成了 AI 可操作的能力。

**8. CLI 工具**

可以把自定义 shell 命令封装成 Agent 工具，支持参数模板、环境变量、工作目录配置，内置 25+ 预设（文件操作、搜索、网络、代码、数据处理等）。

### 实际使用体验

聊天界面响应速度很快，支持流式输出，会显示 Provider、模型名、Token 用量，每条回复都可以一键插入当前 Obsidian 文件。

消息支持附件（文件、图片、vault 内文件引用，用 `@文件名` 语法），快速操作菜单支持在编辑器右键直接触发"总结/解释/修复语法/改写/扩写"等预置动作。

### 安装方式

Obsidian → 设置 → 社区插件 → 浏览 → 搜索 **"Intelligence Assistant"** → 安装并启用

安装后在设置界面配置你的 LLM Provider API Key 即可使用。

### 适合谁

- 重度 Obsidian 用户，希望 AI 能真正理解自己的笔记
- 需要 Agent 自动化处理多步任务的用户
- 想要统一管理所有 AI 工具入口的人
- 注重数据隐私、希望使用本地模型的用户
- 开发者：MCP / OpenAPI / CLI 工具集成让它具备很强的可扩展性

### 一句话总结

Intelligence Assistant 不是又一个 AI 聊天插件，它是一套完整的 AI 工作站，只是恰好住在 Obsidian 里。

---

**GitHub：** [qwai-tech/intelligence-assistant]  
**安装：** Obsidian 社区插件搜索 "Intelligence Assistant"
