import type { DataAdapter } from 'obsidian';
import type { KernelEvent, RunJournal } from '@/features/agent';
import { ensureFolderExists } from '@/core/utils/file-system';

export class JsonlRunJournal implements RunJournal {
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly adapter: DataAdapter,
		private readonly folder: string,
		private readonly now: () => number = Date.now,
	) {}

	append(runId: string, event: KernelEvent): Promise<void> {
		const line = `${JSON.stringify({ at: this.now(), event })}\n`;
		const write = this.queue.then(async () => {
			await ensureFolderExists(this.adapter, this.folder);
			await this.adapter.append(`${this.folder}/${runId}.jsonl`, line);
		});
		this.queue = write.catch((error) => console.error('[RunJournal] append failed:', error));
		return write;
	}
}
