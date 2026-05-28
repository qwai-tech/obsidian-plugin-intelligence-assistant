import { App, TFile, TFolder } from 'obsidian';
import { IFileSystem } from '@/core/interfaces';

/**
 * Obsidian-specific implementation of the FileSystem interface.
 */
export class ObsidianFileSystem implements IFileSystem {
	constructor(private app: App) {}

	async exists(path: string): Promise<boolean> {
		return await this.app.vault.adapter.exists(path);
	}

	async read(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return await this.app.vault.read(file);
		}
		throw new Error(`File not found or not a text file: ${path}`);
	}

	async write(path: string, data: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, data);
		} else {
			// Ensure parent directory exists
			const parts = path.split('/');
			if (parts.length > 1) {
				const parentPath = parts.slice(0, -1).join('/');
				await this.mkdir(parentPath);
			}
			await this.app.vault.create(path, data);
		}
	}

	async mkdir(path: string): Promise<void> {
		if (!path) return;
		if (await this.app.vault.adapter.exists(path)) return;

		const segments = path.split('/').filter(Boolean);
		let current = '';
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!(await this.app.vault.adapter.exists(current))) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	listRecursive(path: string): Promise<string[]> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) {
			return Promise.resolve([]);
		}

		const results: string[] = [];
		const stack: TFolder[] = [folder];

		while (stack.length > 0) {
			const current = stack.pop()!;
			for (const child of current.children) {
				if (child instanceof TFile) {
					results.push(child.path);
				} else if (child instanceof TFolder) {
					stack.push(child);
				}
			}
		}

		return Promise.resolve(results);
	}

	getDisplayName(path: string): string {
		const parts = path.split('/');
		const last = parts[parts.length - 1];
		return last || path;
	}

	isDirectory(path: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(path);
		return Promise.resolve(file instanceof TFolder);
	}
}
