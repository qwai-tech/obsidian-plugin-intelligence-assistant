import type { DataAdapter } from 'obsidian';
import { buildSafeName } from '@/utils/file-system';
import { JsonFile } from './json-file';

const INDEX_VERSION = '1.0';

export interface CollectionOptions<T, E> {
	entriesKey: string;
	filePrefix: string;
	toEntry(item: T, file: string): E;
}

export interface CollectionSnapshot<T> {
	items: T[];
	activeId: string | null;
	indexExists: boolean;
}

type CollectionIndex = { version: string; updatedAt: number; activeId: string | null } & Record<string, unknown>;

export class JsonCollection<T extends { id: string }, E extends { file: string }> {
	private readonly index: JsonFile<CollectionIndex | null>;

	constructor(
		private readonly adapter: DataAdapter,
		private readonly folder: string,
		private readonly options: CollectionOptions<T, E>,
	) {
		this.index = new JsonFile<CollectionIndex | null>(adapter, this.indexPath, () => null);
	}

	private get indexPath(): string {
		return `${this.folder}/index.json`;
	}

	async load(): Promise<CollectionSnapshot<T>> {
		const index = await this.index.read();
		if (!index) {
			return { items: [], activeId: null, indexExists: false };
		}
		const entries = index[this.options.entriesKey];
		const files = Array.isArray(entries) ? (entries as E[]).map((entry) => entry.file) : [];
		return { items: await this.readItems(files), activeId: index.activeId ?? null, indexExists: true };
	}

	async save(items: T[], activeId: string | null): Promise<void> {
		const written = new Set<string>();
		for (const item of items) {
			const path = this.pathFor(item.id);
			await new JsonFile<T>(this.adapter, path, () => item).write(item);
			written.add(path);
		}
		for (const file of await this.itemFiles()) {
			if (!written.has(file)) {
				await this.adapter.remove(file);
			}
		}
		await this.index.write({
			version: INDEX_VERSION,
			updatedAt: Date.now(),
			activeId,
			[this.options.entriesKey]: items.map((item) => this.options.toEntry(item, this.pathFor(item.id))),
		});
	}

	async scan(): Promise<T[]> {
		return await this.readItems(await this.itemFiles());
	}

	private async readItems(files: string[]): Promise<T[]> {
		const items: T[] = [];
		for (const file of files) {
			const item = await new JsonFile<T | null>(this.adapter, file, () => null).read();
			if (item) {
				items.push(item);
			}
		}
		return items;
	}

	private async itemFiles(): Promise<string[]> {
		if (!(await this.adapter.exists(this.folder))) {
			return [];
		}
		const listing = await this.adapter.list(this.folder);
		return listing.files.filter((file) => file !== this.indexPath && file.endsWith('.json'));
	}

	private pathFor(id: string): string {
		return `${this.folder}/${buildSafeName(id, this.options.filePrefix)}.json`;
	}
}
