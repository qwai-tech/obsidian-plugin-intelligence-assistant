import * as fs from 'node:fs';
import * as path from 'node:path';
import { TourPage } from '../pages/tour.page';
import { ChatViewPage } from '../pages/chat/chat-view.page';
import { TestIds } from '../support/testids';
import { mockLLM } from '../support/mock-llm';
import { waitForPluginReady } from '../support/plugin-helpers';
import { VaultFixture } from '../support/vault-fixture';

const THEMES = ['obsidian', 'moonstone'] as const;
const OUT = path.resolve('tests/e2e/screenshots/tour');

describe('Visual tour', () => {
	const tour = new TourPage(OUT);
	const chat = new ChatViewPage();
	const vault = new VaultFixture();

	before(async () => {
		fs.mkdirSync(OUT, { recursive: true });
	});

	for (const theme of THEMES) {
		it(`captures every screen in the ${theme} theme`, async () => {
			await vault.reset();
			await mockLLM.clearAll();
			await waitForPluginReady();
			await tour.setTheme(theme);

			await chat.open();
			await chat.newChat();
			await tour.shot('01-chat-empty');

			await chat.selectMode('chat');
			await mockLLM.replyWith('Here is a **summary** of your note:\n\n- First point with `inline code`\n- Second point linking [[test-note]]\n\n```ts\nconst answer = 42;\n```');
			await chat.sendMessage('Summarize my test note');
			await chat.waitForReplyComplete();
			await tour.shot('02-chat-reply');

			await chat.newChat();
			await chat.selectMode('agent');
			await mockLLM.toolCall('read_file', { path: 'test-note.md' });
			await mockLLM.replyWith('The note contains the sentinel. I read it with **read_file**.');
			await chat.sendMessage('Read test-note.md and report the sentinel.');
			await chat.waitForReplyComplete(20_000);
			await tour.shot('03-agent-trace');

			await chat.openConversationList();
			await tour.shot('04-conversation-list');

			await tour.openReferencePickerAndFocusFirstResult();
			await tour.shot('05-reference-picker');
			await tour.closeModals();

			await mockLLM.replyWith('Done: the task ran in the sidebar.');
			await tour.runAgentTaskInSidebar('Summarize the active note and list follow-up actions');
			await chat.waitForReplyComplete(20_000);
			await tour.shot('06-sidebar-agent-task');

			await tour.settingsRoot();
			await tour.shot('10-settings-root');
			const sections = ['LLM', 'MCP', 'Tools', 'RAG', 'Prompts', 'Agents', 'Quick actions', 'Usage'];
			for (const [index, section] of sections.entries()) {
				await tour.section(section);
				await tour.shot(`${11 + index}-settings-${section.toLowerCase().replace(' ', '-')}`);
			}

			const dialogs: Array<[string, string, string]> = [
				['LLM', TestIds.settings.providerAddBtn, '20-dialog-provider'],
				['MCP', TestIds.settings.mcpAddBtn, '21-dialog-mcp-server'],
				['Prompts', TestIds.settings.promptAddBtn, '22-dialog-prompt'],
				['Agents', TestIds.settings.agentEditBtn, '23-dialog-agent'],
				['Quick actions', TestIds.settings.quickActionEditBtn, '24-dialog-quick-action'],
			];
			for (const [section, button, name] of dialogs) {
				await tour.section(section);
				await tour.press(button);
				await tour.shot(name);
				await tour.closeModals();
			}
			await tour.closeSettings();
		});
	}
});
