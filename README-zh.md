# Intelligence Assistant for Obsidian

将你的知识库变成 **Obsidian 原生智能体工作空间**。Intelligence Assistant 是一个自治的 AI Agent，它深度理解你 Vault 的结构、链接和白板（Canvas）。它能独立规划并执行复杂的知识任务——从整理文件夹到构建思维导图——同时通过 **“提案优先 (Proposal-First)”** 执行模型确保数据安全。

> 仅支持桌面端。需要 Obsidian v1.7.2+。

## 🚀 智能体进化

本插件已超越简单的聊天界面，进化为完整的 **SPAR (感知-规划-行动-反思)** 自治循环：

- **📡 感知 (Sense)**：Agent 感知当前笔记、图谱邻居、目录结构、RAG 片段以及长期记忆。
- **🧠 规划 (Plan)**：利用高级推理（思维链），Agent 制定多步策略并提供透明的 **任务清单**。
- **🛠️ 行动 (Act)**：独立执行工具（Vault、Canvas、MCP、网络、CLI）以收集信息或准备修改。
- **🔄 反思 (Reflect)**：评估执行结果并优化方案。任何 Vault 变更都以 **批量写入提案** 的形式呈现，待你一键确认。

## ✨ 核心功能

- **内置专家团队** — 开箱即用：**🔍 Librarian** (整理专家)、**🏗️ Architect** (白板与映射)、**🧬 Researcher** (综合研究)、**🖋️ Scribe** (创作与视觉)。
- **空间与视觉智能** — 独立读写 **Obsidian Canvas** (.canvas) 文件。支持多模态视觉，将草图或截图直接转为笔记。
- **认知记忆系统** — 基于本地向量库的长期关联记忆。Agent 能跨对话记住你的偏好和关键研究发现。
- **现代逻辑 UI** — 全新设计的 **执行时间轴**，将推理过程与动作融合。紧凑的工具胶囊既节省空间又支持深度审计。
- **Vault 原生工具** — 专用于 **Properties (YAML)** 管理、批量文件操作（移动、创建、删除）和目录树感知。
- **多 LLM 提供商** — 支持 OpenAI, Anthropic (Claude 3.5), Google Gemini, DeepSeek, Ollama (本地), OpenRouter 等。
- **MCP & OpenAPI 集成** — 无缝连接 Model Context Protocol 服务器或任何 OpenAPI 服务，扩展 Agent 的工具箱。
- **隐私第一** — 笔记保留在本地。索引 (RAG) 使用本地向量库，嵌入提供商可灵活配置。

## 🚀 快速开始

### 📦 社区插件（推荐）

1. 在 Obsidian 中打开 **设置 → 第三方插件**。
2. 搜索 **"Intelligence Assistant"** 并安装。
3. 启用插件，然后打开 **设置 → Intelligence Assistant** 配置提供商。

### 📋 环境要求

| 要求 | 详情 |
|---|---|
| Obsidian | v1.7.2 或更高版本（仅桌面端） |
| LLM API Key | OpenAI, Anthropic, Google, DeepSeek 等 |

## 🤖 智能代理

在 **设置 → Agent** 中定义。每个 Agent 具有：

- 系统提示词、工具权限、MCP 服务器访问权限
- 模型策略：`默认`、`跟随聊天` 或 `固定模型`
- 能力配置：RAG、网络搜索、长期记忆
- 自定义图标和显示名称

Agent 模式使用 **原生函数调用**（OpenAI），对其他提供商自动回退到文本解析模式。

## 🧭 典型应用场景

命令面板 (`Cmd+P`) 和右键菜单提供了面向任务的 Agent 入口：

- **文件夹整理者** — 建议文件夹清理、移动及索引/MOC 生成。
- **项目简报** — 总结项目状态，从笔记或文件夹提取后续动作。
- **周复盘** — 扫描日志和项目上下文，起草成果总结和下周计划。
- **研究简报** — 将散落的笔记整理成带来源的研究综述。
- **链接/标签医生** — 诊断不一致的标签、缺失的链接和孤立的概念。
- **创作伙伴** — 基于素材起草初稿，并能“读懂”手绘的白板草图。

## 🔌 工具与集成

### 📁 Vault 大师
- **批量提案**：一键确认多个文件的移动或编辑。
- **属性医生**：跨库自动规范化标签、日期和自定义字段。

### 🎨 Canvas 支持
- 独立访问 `.canvas` JSON。Agent 可以放置卡片、链接文件并组织你的视觉工作区。

### 🌐 跨越库边界
- **网络搜索**：支持 8 种搜索引擎，进行实时外部知识增补。
- **MCP & OpenAPI**：连接外部数据源和自动化脚本。

## 🌐 国际化

支持全部 46 种 Obsidian 语言，包含 **命令面板** 和 **右键菜单** 的完整本地化。

[English](README.md) | [中文文档](README-zh.md)

## 🛠️ 开发

```bash
npm install          # 安装依赖
npm run dev          # 开发构建 + 文件监听
npm run lint         # ESLint 检查
npm run test         # Jest 测试
npm run build        # 生产构建
```

## 📖 文档

| 文档 | 描述 |
|---|---|
| [README.md](README.md) | 英文 README (English) |
| [docs/README.md](docs/README.md) | 文档索引 |
| [docs/architecture/overview-en.md](docs/architecture/overview-en.md) | 架构概览 |
| [docs/project/project-guide-en.md](docs/project/project-guide-en.md) | 开发者指南 |
| [docs/reference/project-structure.md](docs/reference/project-structure.md) | 源码树参考 |

欢迎贡献、提交 Issue 和功能请求——请提交 PR 或发起讨论。
