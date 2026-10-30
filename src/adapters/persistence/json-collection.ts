import type { DataAdapter } from 'obsidian';
import { JsonFile } from './json-file';

export interface CollectionSnapshot<T> {
	items: T[];
	activeId: string | null;
	indexExists: boolean;
}

type CollectionIndex = { activeId?: string | null } & Record<string, unknown>;

export class JsonCollection<T> {
	private readonly index: JsonFile<CollectionIndex | null>;

	constructor(
		private readonly adapter: DataAdapter,
		folder: string,
		private readonly entriesKey: string,
	) {
		this.index = new JsonFile<CollectionIndex | null>(adapter, `${folder}/index.json`, () => null);
	}

	async load(): Promise<CollectionSnapshot<T>> {
		const index = await this.index.read();
		if (!index) {
			return { items: [], activeId: null, indexExists: false };
		}
		const entries = index[this.entriesKey];
		const files = Array.isArray(entries) ? (entries as Array<{ file: string }>).map((entry) => entry.file) : [];
		const items: T[] = [];
		for (const file of files) {
			const item = await new JsonFile<T | null>(this.adapter, file, () => null).read();
			if (item) {
				items.push(item);
			}
		}
		return { items, activeId: index.activeId ?? null, indexExists: true };
	}
}
