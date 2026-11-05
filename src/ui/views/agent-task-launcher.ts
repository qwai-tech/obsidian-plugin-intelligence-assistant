import { notify } from '@/core/notifications';
import { type App, type TFile, type TFolder } from 'obsidian';
import { type TaskAuthorization, type TaskOrigin, agentTaskLaunchText, withUserTaskInput } from '@/features/agent';
import { showAgentTaskLaunchModal } from '@/ui/modals/agent-task-launch-modal';
import type { ChatWorkspace } from './chat-workspace';
import type { ChatView } from './chat-view';
import { t } from '@/i18n';

export interface AgentTask {
	prompt: string;
	displayText: string;
	references?: Array<TFile | TFolder>;
	newConversation?: boolean;
	sendImmediately?: boolean;
	authorization?: TaskAuthorization;
}

export class AgentTaskLauncher {
	constructor(private readonly app: App, private readonly workspace: ChatWorkspace) {}

	async launch(prompt: string, references: Array<TFile | TFolder> = [], displayText?: string, options: { origin?: TaskOrigin; newConversation?: boolean } = {}): Promise<void> {
		const defaultTask = agentTaskLaunchText(prompt, displayText);
		const view = await this.openChat();
		if (!view) return;
		const preview = await view.taskPreview(references);
		const launch = await showAgentTaskLaunchModal(this.app, t('ux.startTask'), defaultTask, options.newConversation ?? true, preview);
		if (launch === null) {
			return;
		}
		const visibleTask = launch.taskInput.trim() || defaultTask;
		await this.run({
			prompt: withUserTaskInput(prompt, visibleTask),
			displayText: visibleTask,
			references,
			newConversation: launch.newConversation,
			sendImmediately: true,
			authorization: { origin: options.origin ?? 'command', approved: true },
		});
	}

	async run(task: AgentTask): Promise<{ conversationId: string; content: string } | null> {
		const view = await this.openChat();
		return await view?.startAgentTask(task) ?? null;
	}

	async openChat(): Promise<ChatView | null> {
		const view = await this.workspace.openInSidebar();
		if (!view) {
			notify(t('chat.notices.openViewFailed'));
		}
		return view;
	}
}
