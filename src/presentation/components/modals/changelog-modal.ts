import { App, Modal, ButtonComponent } from 'obsidian';
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
### 🚀 深度融入 Obsidian

本次更新让 Intelligence Assistant 与 Obsidian 原生能力深度结合，Agent 更聪明、更快、更贴手。

#### 1. 更强的 Agent 工具
- **读取 PDF**：Agent 可直接读取并理解库内 PDF 文件的内容。
- **标签与链接感知**：按标签查找笔记、解析 \`[[链接]]\` 与标题锚点；写入链接时自动生成符合库规范的正确 Wiki 链接。
- **网页转 Markdown**：联网检索结果会自动清洗为干净的 Markdown，去除网页杂质。

#### 2. 更快、更智能
- **增量索引**：单个笔记的新增/修改/删除/重命名会被增量更新到 RAG 索引，告别整库重建，记忆刷新更即时。
- **状态栏用量**：状态栏实时显示 Agent 运行状态与累计 Token 用量。
- **设置同步感知**：通过 Obsidian Sync 在其它设备改动配置时，本端会自动重新载入。

#### 3. 笔记与编辑器内的 AI
- **@ 提及补全**：聊天输入框中输入 \`@\` 或 \`[[\` 即可快速插入笔记引用。
- **行内 AI 代码块**：在笔记中用 \`\`\`ai 代码块直接嵌入并运行 AI 小部件。
- **悬停预览**：聊天中的笔记链接支持原生悬停预览。
- **选区快捷指令**：编辑器中选中文本，一键 \`Mod-Shift-I\` 交给 Agent 处理。
- **模糊快速切换**：命令面板一键模糊搜索切换模型。

#### 4. 更丰富的对话渲染
- **图表 / 公式 / 代码**：聊天回复原生渲染 Mermaid 图表、数学公式与语法高亮。

#### 5. 深度链接
- **协议跳转**：支持 \`obsidian://intelligence-assistant?task=...\` 深度链接，从外部直接唤起并下达任务。

---
*全部 14 项新能力均通过自动化验证（单元 / 任务 / 性能 / 变异测试）。开启新对话，立即体验！*
` : `
### 🚀 Deeper Obsidian Integration

This release wires Intelligence Assistant into Obsidian's native capabilities — a smarter, faster, more tactile Agent.

#### 1. More Capable Agent Tools
- **Read PDFs**: The Agent can now read and reason over PDF files in your vault.
- **Tag & Link Aware**: Find notes by tag, resolve \`[[links]]\` and heading anchors, and auto-generate vault-correct wikilinks when writing links.
- **Web → Markdown**: Web search results are cleaned into tidy Markdown, stripping page cruft.

#### 2. Faster & Smarter
- **Incremental Indexing**: Creating/modifying/deleting/renaming a single note updates just that file in the RAG index — no more full reindexes, so memory stays fresh instantly.
- **Status Bar Usage**: The status bar now shows live Agent state and cumulative token usage.
- **Settings Sync Aware**: Config changed on another device via Obsidian Sync is reloaded automatically.

#### 3. AI Inside Notes & the Editor
- **@-Mention Autocomplete**: Type \`@\` or \`[[\` in the chat input to quickly insert note references.
- **Inline AI Code Blocks**: Embed and run an AI widget right inside a note with an \`\`\`ai code block.
- **Hover Previews**: Note links in chat support Obsidian's native hover preview.
- **Selection Shortcut**: Select text in the editor and hand it to the Agent with \`Mod-Shift-I\`.
- **Fuzzy Quick-Switch**: Fuzzy-search and switch models straight from the command palette.

#### 4. Richer Chat Rendering
- **Diagrams / Math / Code**: Chat replies natively render Mermaid diagrams, math, and syntax highlighting.

#### 5. Deep Links
- **Protocol Handler**: \`obsidian://intelligence-assistant?task=...\` deep links launch the Agent and kick off a task from anywhere.

---
*All 14 new capabilities ship verified by automated tests (unit / mission / perf / mutation). Start a new chat to try them!*
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
