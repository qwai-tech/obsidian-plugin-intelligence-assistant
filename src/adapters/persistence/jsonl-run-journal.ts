import type { DataAdapter } from 'obsidian';
import type { KernelEvent, RunJournal } from '@/features/agent';
import { ensureFolderExists } from '@/core/utils/file-system';

export class JsonlRunJournal implements RunJournal {
	private queue: Promise<void> = Promise.resolve();
	private failure?: Error;

	constructor(
		private readonly adapter: DataAdapter,
		private readonly folder: string,
		private readonly now: () => number = Date.now,
		private readonly maxRuns = 100,
	) {}

	async flush(): Promise<void> { await this.queue; if (this.failure) throw this.failure; }

	append(runId: string, event: KernelEvent): Promise<void> {
		const line = `${JSON.stringify({ at: this.now(), event })}\n`;
		const write = this.queue.then(async () => {
			await ensureFolderExists(this.adapter, this.folder);
			await this.adapter.append(`${this.folder}/${runId}.jsonl`, line);
			if (event.type === 'run_started') await this.prune();
		});
		this.queue = write.catch((error: unknown) => { this.failure = error instanceof Error ? error : new Error(String(error)); console.error('[RunJournal] append failed:', error); });
		return write;
	}
	private async prune(): Promise<void> {
		const { files } = await this.adapter.list(this.folder);
		const entries = await Promise.all(files.filter(file => file.endsWith('.jsonl')).map(async path => ({ path, time: (await this.adapter.stat(path))?.mtime ?? 0 })));
		entries.sort((a, b) => b.time - a.time);
		for (const old of entries.slice(Math.max(1, this.maxRuns))) await this.adapter.remove(old.path);
	}

}
