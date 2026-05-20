# Intelligence Assistant - End-to-End (E2E) 测试计划

本 E2E 测试计划旨在全面覆盖 Intelligence Assistant Obsidian 插件的所有功能模块，确保从 UI 交互到底层模型调用的完整链路稳定可靠。

## 0. 测试环境准备 (Test Environment Setup)
- **TC-0.1 准备全新测试 Vault：**
  - 在本地磁盘创建一个**全新的空文件夹**作为测试专用的 Obsidian Vault。
  - 在新 Vault 中安装并启用 Intelligence Assistant 插件。
  - **重要原因：** 测试 Agent 模式和工具调用时，可能涉及文件的创建、修改和删除。使用全新 Vault 可确保测试过程不会破坏或污染您真实的个人笔记数据。
  - 在新 Vault 中新建几篇包含测试文本的 Markdown 笔记，用于后续 RAG 检索测试。

## 1. 核心聊天功能 (Core Chat)
- **TC-1.1 基本对话：** 发送普通文本消息，验证模型能正常回复且流式输出 (Streaming) 顺畅。
- **TC-1.2 中断生成：** 在模型回复过程中点击“停止”按钮，验证生成立即中断且不会引发 UI 卡死。
- **TC-1.3 Markdown 渲染：** 发送要求输出粗体、列表、表格和代码块的 Prompt，验证回复被正确渲染为 Obsidian 风格的 Markdown。
- **TC-1.4 代码复制：** 验证生成的代码块右上角存在“复制”按钮，且点击后能成功复制到系统剪贴板。
- **TC-1.5 对话历史持久化：** 刷新 Obsidian 或重启应用，验证之前的聊天记录和对话列表依然保留。
- **TC-1.6 滚动交互：** 验证在模型输出长文本时，UI 能自动滚动到底部；用户手动向上滚动时自动停止追踪，并显示“滚动到底部”悬浮按钮。

## 2. LLM 与提供商管理 (Provider Management)
- **TC-2.1 添加提供商：** 在设置中添加 OpenAI / Google / Anthropic 提供商，输入 API Key 并保存，验证提供商列表正确更新。
- **TC-2.2 刷新模型列表：** 点击提供商的“Refresh models”按钮，验证能通过 API 成功拉取可用模型列表并更新缓存。
- **TC-2.3 本地模型 (Ollama) 支持：** 配置 Ollama Base URL，验证能正确探测本地服务状态（Online/Offline）及拉取本地模型列表。
- **TC-2.4 切换活跃模型：** 在聊天界面顶部的下拉框中切换不同的模型，验证后续对话使用新选择的模型进行请求。
- **TC-2.5 密钥安全警告展示：** 验证设置页面正确显示了关于 API 密钥明文存储的警告提示。

## 3. RAG 与知识库增强 (RAG & Knowledge Base)
- **TC-3.1 首次全量索引：** 开启 RAG 功能，验证系统能遍历测试 Vault 文件并调用 Embedding API 生成向量并保存。
- **TC-3.2 增量/实时索引更新：** 新建、修改或删除某篇测试笔记，验证 Vector Store 能在后台防抖延迟后自动更新。
- **TC-3.3 知识库问答：** 询问仅存在于笔记中的特有事实，验证模型能在回复中引用相关笔记，并在气泡下方正确显示“References”。
- **TC-3.4 文档评分 (Document Grader)：** 开启 `enableGradingThreshold`，验证系统会利用 LLM 对初步检索结果进行质量评分过滤。
- **TC-3.5 语义/哈希降级：** 在未配置有效 Embedding 模型时，验证系统能安全降级使用本地模糊匹配算法，且不阻断聊天流程。

## 4. Web Search 集成 (Web Search)
- **TC-4.1 自动触发搜索：** 开启 `autoTrigger`，询问诸如“今天的天气”等实时问题，验证插件自动调用 Web Search 服务（如 Tavily）。
- **TC-4.2 强制搜索 Toggle：** 在聊天输入框中手动高亮“Web Search”开关，验证无论问题是什么都会附加网页搜索上下文。
- **TC-4.3 搜索结果展示：** 验证模型回复后，能在 UI 界面清晰看到被用作上下文的外部链接及摘要。

## 5. 上下文与附件 (Context & Attachments)
- **TC-5.1 文件/文件夹引用：** 在输入框使用 `@` 提及某个测试笔记或文件夹，验证被引用的笔记内容作为上下文正确传递给 LLM。
- **TC-5.2 图片附件 (Vision)：** 上传一张图片并选择支持 Vision 的模型，验证模型能正确分析图片内容并给出回答。
- **TC-5.3 文本附件：** 上传一个较长的 `.md` 或 `.txt` 文件，验证它被正确解析为系统提示词或附加内容。

## 6. Agent 模式与 MCP 工具 (Agent Mode & MCP)
- **TC-6.1 切换 Agent 模式：** 在顶部导航栏切换至 `Agent` 模式，验证默认加载了相应的 System Prompt。
- **TC-6.2 基础工具调用：** 让 Agent 执行如“新建一篇笔记”等指令，验证内置工具被成功调用，测试 Vault 中出现新笔记，且 UI 显示执行轨迹 (Execution Trace)。
- **TC-6.3 连接外部 MCP Server：** 在 MCP 设置面板添加一个本地 MCP Server，验证 Server 启动成功且工具同步到 Tool Manager。
- **TC-6.4 外部工具协同：** 指令 Agent 调用上述外部 MCP Server 提供的工具，验证请求成功并在追踪面板中显示。

## 8. UI、命令与快捷动作 (Commands & Quick Actions)
- **TC-8.1 选中文本快捷动作：** 在编辑器中高亮文本，右键选择 `Summarize`，验证侧边栏自动打开并开始处理。
- **TC-8.2 Command Palette：** 使用 `Cmd+P` 唤出面板，验证 `Intelligence Assistant: Open Chat` 等命令正常工作。
- **TC-8.3 设置面板数据同步：** 更改设置（如 Temperature）后关闭面板，验证新的配置立刻在 ChatView 中生效。
- **TC-8.4 主题兼容性：** 验证插件在 Obsidian 浅色/深色主题下的 UI 元素均无错位和样式崩坏。

---
**测试执行建议：**
准备好全新的测试 Vault 后，建议配备一组专门的测试 API Keys。所有的写操作 (如 Agent 模式的工具调用) 都仅限于该测试 Vault 内进行。
