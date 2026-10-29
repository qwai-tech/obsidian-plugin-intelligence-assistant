import { Notice, type App, type TFile, type TFolder } from 'obsidian';
import { agentTaskLaunchText, withUserTaskInput } from '@/application/agents/agent-task-text';
import { showAgentTaskLaunchModal } from '@/presentation/components/modals/agent-task-launch-modal';
import type { ChatWorkspace } from './chat-workspace';
import type { ChatView } from './chat-view';

export interface AgentTask {
	prompt: string;
	displayText: string;
	references?: Array<TFile | TFolder>;
	newConversation?: boolean;
	sendImmediately?: boolean;
}

export class AgentTaskLauncher {
	constructor(private readonly app: App, private readonly workspace: ChatWorkspace) {}

	async launch(prompt: string, references: Array<TFile | TFolder> = [], displayText?: string): Promise<void> {
		const defaultTask = agentTaskLaunchText(prompt, displayText);
		const launch = await showAgentTaskLaunchModal(this.app, 'Start agent task', defaultTask, true);
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
		});
	}

	async run(task: AgentTask): Promise<void> {
		const view = await this.openChat();
		await view?.startAgentTask(task);
	}

	async openChat(): Promise<ChatView | null> {
		const view = await this.workspace.openInSidebar();
		if (!view) {
			new Notice('Unable to open intelligence assistant chat view.');
		}
		return view;
	}
}
