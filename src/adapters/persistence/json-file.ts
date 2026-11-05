import type { DataAdapter } from 'obsidian';
import { ensureFolderExists, parentFolder } from '@/core/utils/file-system';

export type JsonStoragePort = Pick<DataAdapter, 'exists' | 'read' | 'write' | 'mkdir' | 'remove' | 'rename'>;
const queues = new WeakMap<JsonStoragePort, Map<string, Promise<unknown>>>();

export class JsonFile<T> {
	constructor(private readonly adapter: JsonStoragePort, readonly path: string, private readonly fallback: () => T, private readonly indent = 2) {}
	private get tempPath(): string { return `${this.path}.tmp`; }
	read(): Promise<T> { return this.enqueue(() => this.load()); }
	write(value: T): Promise<void> {
		// Snapshot at the call boundary, before another owner can mutate the object.
		const serialized = JSON.stringify(value, null, this.indent);
		return this.enqueue(() => this.store(serialized));
	}
	update(change: (value: T) => T | void): Promise<T> {
		return this.enqueue(async () => { const current = await this.load(); const next = change(current) ?? current; await this.store(JSON.stringify(next, null, this.indent)); return next; });
	}
	private enqueue<R>(work: () => Promise<R>): Promise<R> {
		let paths = queues.get(this.adapter);
		if (!paths) { paths = new Map(); queues.set(this.adapter, paths); }
		const previous = paths.get(this.path) ?? Promise.resolve();
		const run = previous.then(work, work);
		const settled = run.then(() => undefined, () => undefined);
		paths.set(this.path, settled);
		void settled.then(() => { if (paths?.get(this.path) === settled) paths.delete(this.path); });
		return run;
	}
	private async load(): Promise<T> {
		const path = await this.adapter.exists(this.path) ? this.path : await this.adapter.exists(this.tempPath) ? this.tempPath : null;
		if (!path) return this.fallback();
		try { return JSON.parse(await this.adapter.read(path)) as T; }
		catch { throw new Error(`Cannot read JSON at ${path}; the existing file was preserved.`); }
	}
	private async store(serialized: string): Promise<void> {
		await ensureFolderExists(this.adapter, parentFolder(this.path));
		if (await this.adapter.exists(this.path)) {
			const previous = await this.adapter.read(this.path);
			try { JSON.parse(previous); } catch { throw new Error(`Refusing to overwrite unreadable JSON at ${this.path}`); }
			await this.adapter.write(`${this.path}.bak`, previous);
		}
		await this.adapter.write(this.tempPath, serialized);
		if (await this.adapter.exists(this.path)) await this.adapter.remove(this.path);
		await this.adapter.rename(this.tempPath, this.path);
	}
}
