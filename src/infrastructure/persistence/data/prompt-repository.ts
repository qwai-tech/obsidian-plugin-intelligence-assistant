import { App } from 'obsidian';
import type { SystemPrompt } from '@/types';
import { PROMPTS_DATA_FOLDER } from '@/constants';
import { ensureFolderExists, buildSafeName } from '@/utils/file-system';

interface PromptIndexEntry {
	id: string;
	name: string;
	enabled: boolean;
	updatedAt: number;
	file: string;
}

interface PromptIndexFile {
	version: string;
	updatedAt: number;
	activeId: string | null;
	prompts: PromptIndexEntry[];
}

const INDEX_VERSION = '1.0';

export class PromptRepository {
	private readonly baseFolder = PROMPTS_DATA_FOLDER;
	private readonly indexPath = `${this.baseFolder}/index.json`;
	private initialized = false;

	constructor(private readonly _app: App) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this._app.vault.adapter, this.baseFolder);
		if (!(await this._app.vault.adapter.exists(this.indexPath))) {
			await this.writeIndex({
				version: INDEX_VERSION,
				updatedAt: Date.now(),
				activeId: null,
				prompts: []
			});
		}
		this.initialized = true;
	}

	async loadAll(): Promise<{ prompts: SystemPrompt[]; activeId: string | null }> {
		await this.initialize();
		const index = await this.readIndex();
		const prompts: SystemPrompt[] = [];

		for (const entry of index.prompts) {
			const prompt = await this.readPrompt(entry.file);
			if (prompt) {
				prompts.push(prompt);
			}
		}

		if (prompts.length === 0) {
			const discovered = await this.loadPromptsFromFolder();
			if (discovered.length > 0) {
				await this.saveAll(discovered, index.activeId ?? null);
				return { prompts: discovered, activeId: index.activeId ?? null };
			}
		}

		return { prompts, activeId: index.activeId ?? null };
	}

	async saveAll(prompts: SystemPrompt[], activeId: string | null): Promise<void> {
		await this.initialize();
		const adapter = this._app.vault.adapter;
		const keepFiles = new Set<string>();

		for (const prompt of prompts) {
			const filePath = this.getPromptFilePath(prompt.id);
			keepFiles.add(filePath);
			await adapter.write(filePath, JSON.stringify(prompt, null, 2));
		}

		await this.removeOrphanedPromptFiles(keepFiles);

		const index: PromptIndexFile = {
			version: INDEX_VERSION,
			updatedAt: Date.now(),
			activeId: activeId ?? null,
			prompts: prompts.map(prompt => ({
				id: prompt.id,
				name: prompt.name,
				enabled: prompt.enabled !== false,
				updatedAt: prompt.updatedAt ?? Date.now(),
				file: this.getPromptFilePath(prompt.id)
			}))
		};

		await this.writeIndex(index);
	}

	private async readPrompt(filePath: string): Promise<SystemPrompt | null> {
		try {
			const content = await this._app.vault.adapter.read(filePath);
			return JSON.parse(content) as SystemPrompt;
		} catch (error) {
			console.warn(`[Prompts] Failed to read prompt file ${filePath}:`, error);
			return null;
		}
	}

	private async loadPromptsFromFolder(): Promise<SystemPrompt[]> {
		const adapter = this._app.vault.adapter;
		const prompts: SystemPrompt[] = [];
		const listing = await adapter.list(this.baseFolder);

		for (const file of listing.files) {
			if (file === this.indexPath || !file.endsWith('.json')) {
				continue;
			}
			const prompt = await this.readPrompt(file);
			if (prompt) {
				prompts.push(prompt);
			}
		}

		return prompts;
	}

	private async removeOrphanedPromptFiles(keep: Set<string>): Promise<void> {
		const adapter = this._app.vault.adapter;
		const listing = await adapter.list(this.baseFolder);

		for (const file of listing.files) {
			if (file === this.indexPath || !file.endsWith('.json')) {
				continue;
			}
			if (!keep.has(file)) {
				await adapter.remove(file);
			}
		}
	}

	private getPromptFilePath(promptId: string): string {
		const safeName = buildSafeName(promptId, 'prompt');
		return `${this.baseFolder}/${safeName}.json`;
	}

	private async readIndex(): Promise<PromptIndexFile> {
		try {
			const content = await this._app.vault.adapter.read(this.indexPath);
			return JSON.parse(content) as PromptIndexFile;
		} catch {
			return {
				version: INDEX_VERSION,
				updatedAt: Date.now(),
				activeId: null,
				prompts: []
			};
		}
	}

	private async writeIndex(index: PromptIndexFile): Promise<void> {
		await this._app.vault.adapter.write(this.indexPath, JSON.stringify(index, null, 2));
	}
}
