import type { DataAdapter } from 'obsidian';
import { ensureFolderExists, parentFolder } from '@/utils/file-system';

export class JsonFile<T> {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly adapter: DataAdapter,
		readonly path: string,
		private readonly fallback: () => T,
		private readonly indent = 2,
	) {}

	private get tempPath(): string {
		return `${this.path}.tmp`;
	}

	read(): Promise<T> {
		return this.enqueue(() => this.load());
	}

	write(value: T): Promise<void> {
		return this.enqueue(() => this.store(value));
	}

	update(change: (value: T) => T | void): Promise<T> {
		return this.enqueue(async () => {
			const current = await this.load();
			const next = change(current) ?? current;
			await this.store(next);
			return next;
		});
	}

	private enqueue<R>(work: () => Promise<R>): Promise<R> {
		const run = this.queue.then(work, work);
		this.queue = run.catch(() => undefined);
		return run;
	}

	private async load(): Promise<T> {
		const path = (await this.adapter.exists(this.path))
			? this.path
			: (await this.adapter.exists(this.tempPath)) ? this.tempPath : null;
		if (!path) {
			return this.fallback();
		}
		try {
			return JSON.parse(await this.adapter.read(path)) as T;
		} catch (error) {
			console.error(`[JsonFile] Unreadable ${path}, using defaults:`, error);
			return this.fallback();
		}
	}

	private async store(value: T): Promise<void> {
		await ensureFolderExists(this.adapter, parentFolder(this.path));
		await this.adapter.write(this.tempPath, JSON.stringify(value, null, this.indent));
		if (await this.adapter.exists(this.path)) {
			await this.adapter.remove(this.path);
		}
		await this.adapter.rename(this.tempPath, this.path);
	}
}
