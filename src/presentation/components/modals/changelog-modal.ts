import { App, Modal, ButtonComponent } from 'obsidian';
import { t } from '@/i18n';
import { renderAssistantMarkdown } from '@/presentation/components/chat/message-renderer';

export class ChangelogModal extends Modal {
	constructor(
		app: App,
		private version: string,
		private isChinese: boolean
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-changelog-modal');

		contentEl.createEl('h2', { text: this.isChinese ? `🎉 欢迎使用新版本 v${this.version}` : `🎉 Welcome to v${this.version}` });

		const body = contentEl.createDiv('ia-changelog-body');
		
		const changelogContent = this.isChinese ? `
### 🚀 Obsidian Agentic Agent 深度演进

感谢使用 Intelligence Assistant！本次更新将您的插件进化为一个真正的**自治代理**。

#### 1. 深度环境自主性 (Vault Autonomy)
- **批量重构提案**：Agent 现在可以一次性提议修改、创建或移动多个文件。您可以一键“全部应用”。
- **元数据大师**：新增 \`update_properties\` 工具，自动管理笔记标签和 YAML 属性。
- **目录树感知**：Agent 现在能“看到”当前文件夹的完整结构，决策更具全局观。

#### 2. 认知记忆系统 (Cognitive Memory)
- **长期关联记忆**：您的研究日志和对话偏好现在会被自动总结并索引至本地向量库，跨对话实现“记得住”。
- **自主反思**：对话结束后，Agent 会进行隐形思考，固化新知识。

#### 3. 空间与视觉智能 (Spatial & Vision)
- **白板交互**：支持读写 \`.canvas\` 文件，Agent 可以直接为您绘制思维导图或项目拓扑。
- **多模态理解**：现在可以直接向 Agent 发送图片或草图（支持 GPT-4o, Claude 3.5, Gemini 1.5）。

#### 4. 极致交互体验
- **逻辑时序轴**：重构了“执行过程”，将思考 (Reasoning) 与行动完美融合在时间轴中。
- **极简专业设计**：全新的“文档优先”排版，更克制、更优雅。

---
*默认已为您开启 **Agent 模式**。开启新对话，立即体验专属于您的 Obsidian 专家团队！*
` : `
### 🚀 The Obsidian Agentic Agent Evolution

Thank you for updating Intelligence Assistant! This release transforms your plugin into a true **autonomous agent**.

#### 1. Deep Environmental Autonomy
- **Batch Proposals**: The Agent can now propose multiple file changes (edit, create, move) at once. Apply them all with a single click.
- **Metadata Mastery**: New \`update_properties\` tool for automated management of tags and YAML frontmatter.
- **Directory Awareness**: The Agent now "sees" your folder structure, leading to better context-aware decisions.

#### 2. Cognitive Memory System
- **Long-term Associative Memory**: Research logs and preferences are now indexed into a local vector store, allowing the Agent to "remember" across conversations.
- **Self-Reflection**: After each session, the Agent consolidates new facts and patterns into its knowledge base.

#### 3. Spatial & Multi-modal Intelligence
- **Canvas Interaction**: Support for reading and writing \`.canvas\` files. The Agent can now build mind maps and project layouts for you.
- **Vision Support**: Directly send images or sketches to the Agent (requires GPT-4o, Claude 3.5, or Gemini 1.5).

#### 4. Premium Experience
- **Logical Timeline**: A redesigned "Execution Process" integrates Reasoning and Actions into a single, cohesive flow.
- **Minimalist Pro UI**: New "Document-First" layout that is cleaner, faster, and perfectly integrated with Obsidian.

---
**Agent Mode** is now enabled by default. Start a new chat to meet your personal team of Obsidian experts!
`;

		renderAssistantMarkdown(body, changelogContent.trim());

		const footer = contentEl.createDiv('ia-modal-footer');
		new ButtonComponent(footer)
			.setButtonText(this.isChinese ? '开始体验' : 'Get Started')
			.setCta()
			.onClick(() => {
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
