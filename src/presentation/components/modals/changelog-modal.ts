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
### 🔌 更广的模型兼容 & 更省的 Token

本次更新让 Agent 能接入更多 LLM 网关，并显著降低引用笔记的 Token 开销。

#### 1. 兼容更多 LLM 网关
- **严格网关支持**：修复了发送给模型的消息夹带内部字段的问题，现在可对接校验更严格的 OpenAI 兼容网关。
- **本地网关（无 CORS）也能用 Agent**：当流式请求被 CORS 拦截时，自动改用 Obsidian 的 \`requestUrl\` 非流式重试，本地模型中枢（如 Manifold）下 Agent 模式也能正常工作。

#### 2. 更省 Token 的引用
- **引用内容封顶**：被引用/“@ 提及”的笔记按单文件与总量上限注入，超出部分提示 Agent 按需 \`read_file\` 读取，避免大笔记撑爆每轮上下文。
- **Agent 模式不再重复注入**：引用内容只经感知层注入一次，去除重复，单轮引用 Token 约减半。
- **@ 提及真正生效**：选择 \`@\`/\`[[\` 笔记时会把其内容作为引用附上，Agent 不再只看到一个空链接。

#### 3. 引擎升级
- **改用公开的 Agentic Kernel SDK**：内核迁移至公网 \`@agentic-kernel/core\` 并升级至 0.6.0，状态存储通过官方一致性契约校验，升级更稳。

---
*全部改动经自动化验证（类型 / 单元 / 任务 / 真实模型端到端）。开启新对话即可体验。*
` : `
### 🔌 Broader Model Compatibility & Leaner Tokens

This release lets the Agent talk to more LLM gateways and meaningfully cuts the token cost of referenced notes.

#### 1. Works With More LLM Gateways
- **Strict gateways**: Fixed internal bookkeeping fields leaking into the messages sent to the model, so the Agent now works with stricter OpenAI-compatible gateways.
- **Local (non-CORS) gateways now work in agent mode**: When a streaming request is blocked by CORS, the Agent automatically retries non-streaming via Obsidian's \`requestUrl\`, so local model hubs (e.g. Manifold) work for agent mode too.

#### 2. Leaner Reference Tokens
- **Reference content is capped**: Referenced / @-mentioned notes are injected up to a per-file and total limit; beyond that the Agent is told to \`read_file\` on demand — large notes no longer blow up every turn.
- **No more double-injection in agent mode**: Reference content is inlined once (via the sense layer), roughly halving per-turn reference tokens.
- **@-mentions actually work**: Picking an \`@\` / \`[[\` note now attaches its content as a reference — the Agent no longer sees just an opaque link.

#### 3. Engine Upgrade
- **Now on the public Agentic Kernel SDK**: The core migrated to \`@agentic-kernel/core\` (upgraded to 0.6.0); the state store is verified against the official conformance contract for safer upgrades.

---
*All changes verified by automated tests (types / unit / mission / real-model end-to-end). Start a new chat to try them.*
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
