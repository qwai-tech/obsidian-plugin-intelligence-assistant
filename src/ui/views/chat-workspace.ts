import type { App, WorkspaceLeaf } from 'obsidian';
import { ChatView, CHAT_VIEW_TYPE } from './chat-view';

export class ChatWorkspace {
	constructor(private readonly app: App) {}

	async openInMainArea(): Promise<ChatView | null> {
		const { workspace } = this.app;
		const mainLeaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE).find((leaf) => leaf.getRoot() === workspace.rootSplit);
		if (mainLeaf) {
			await workspace.revealLeaf(mainLeaf);
			return asChatView(mainLeaf);
		}
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
		return asChatView(leaf);
	}

	async openInSidebar(): Promise<ChatView | null> {
		const { workspace } = this.app;
		const [existing] = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing) {
			await workspace.revealLeaf(existing);
			return asChatView(existing);
		}
		const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
		return asChatView(leaf);
	}

	async refreshModels(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
			if (leaf.view instanceof ChatView) {
				await leaf.view.refreshModels();
			}
		}
	}
}

function asChatView(leaf: WorkspaceLeaf | null | undefined): ChatView | null {
	return leaf?.view instanceof ChatView ? leaf.view : null;
}
