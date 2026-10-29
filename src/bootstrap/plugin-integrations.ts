import { MarkdownRenderChild, Notice, TFile, type ObsidianProtocolData, type Plugin } from 'obsidian';
import type { RAGConfig } from '@/features/knowledge/types/rag';
import type { RAGManager } from '@/adapters/rag/rag-manager';
import { createIncrementalIndexHandlers } from '@/adapters/rag/incremental-indexer';
import { parseAiBlock, buildAiWidget } from '@/ui/markdown/ai-code-block';
import type { AgentTaskLauncher } from '@/ui/views/agent-task-launcher';

export function registerIncrementalRagIndexing(
	plugin: Plugin,
	rag: () => RAGManager | null,
	config: () => RAGConfig | undefined,
): void {
	const withRag = async <T>(work: (manager: RAGManager) => Promise<T>): Promise<T | undefined> => {
		const manager = rag();
		return manager ? await work(manager) : undefined;
	};
	const handlers = createIncrementalIndexHandlers(
		{
			indexFile: async (file) => {
				const tfile = plugin.app.vault.getAbstractFileByPath(file.path);
				if (tfile instanceof TFile) {
					await withRag((manager) => manager.indexFile(tfile));
				}
			},
			removeFile: async (path) => (await withRag((manager) => manager.removeFile(path))) ?? 0,
			renameFile: async (oldPath, newPath) => (await withRag((manager) => manager.renameFile(oldPath, newPath))) ?? 0,
		},
		() => ({
			enabled: config()?.enabled ?? false,
			embedChangedFiles: config()?.embedChangedFiles ?? false,
		}),
		{
			setTimeoutFn: (fn, ms) => window.setTimeout(fn, ms),
			clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
		},
	);
	const { vault, metadataCache } = plugin.app;
	plugin.registerEvent(vault.on('create', (file) => {
		if (file instanceof TFile) handlers.onCreate(file);
	}));
	plugin.registerEvent(vault.on('modify', (file) => {
		if (file instanceof TFile) handlers.onModify(file);
	}));
	plugin.registerEvent(vault.on('delete', (file) => {
		if (file instanceof TFile) handlers.onDelete(file);
	}));
	plugin.registerEvent(vault.on('rename', (file, oldPath) => {
		if (file instanceof TFile) handlers.onRename(file, oldPath);
	}));
	plugin.registerEvent(metadataCache.on('changed', (file) => handlers.onMetadataChanged(file)));
}

export function registerInlineAiBlocks(plugin: Plugin, launcher: AgentTaskLauncher): void {
	plugin.registerMarkdownCodeBlockProcessor('ai', (source, el, ctx) => {
		const directive = parseAiBlock(source);
		ctx.addChild(new MarkdownRenderChild(el));
		const handle = buildAiWidget(el, directive, (prompt) => {
			handle.setRunning(true);
			launcher.run({
				prompt,
				displayText: directive.title ? `${directive.title}: ${prompt}` : prompt,
				references: [],
				newConversation: false,
				sendImmediately: true,
			})
				.catch((error) => {
					console.error('[Plugin] Inline ai block run failed:', error);
					new Notice('Failed to run inline AI block.');
				})
				.finally(() => handle.setRunning(false));
		});
	});
}

export function registerDeepLinks(plugin: Plugin, launcher: AgentTaskLauncher): void {
	plugin.registerObsidianProtocolHandler('intelligence-assistant', (params) => {
		runDeepLink(plugin, launcher, params).catch((error) => {
			console.error('[Plugin] Protocol deep link failed:', error);
			new Notice('Failed to handle intelligence-assistant deep link.');
		});
	});
}

async function runDeepLink(plugin: Plugin, launcher: AgentTaskLauncher, params: ObsidianProtocolData): Promise<void> {
	const task = (params.task ?? params.prompt ?? '').trim();
	const filePath = (params.file ?? '').trim();
	const file = filePath ? plugin.app.vault.getAbstractFileByPath(filePath) : null;
	if (!task) {
		await launcher.openChat();
		return;
	}
	await launcher.run({
		prompt: task,
		displayText: task,
		references: file instanceof TFile ? [file] : [],
		newConversation: params.new === 'true',
		sendImmediately: params.send !== 'false',
	});
}
