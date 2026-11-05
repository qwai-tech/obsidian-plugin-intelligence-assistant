import { runtimeClock } from '@qwai/obsidian-llm';
export type RunStatus = 'running' | 'completed' | 'aborted' | 'failed';
export interface RunLease { readonly id: string; readonly signal: AbortSignal; finish(status: Exclude<RunStatus, 'running'>): void }
export interface RunRecord { id: string; status: RunStatus; startedAt: number; finishedAt?: number }

/** Owns task cancellation and draining independently of the lifetime of any view. */
export class RunCoordinator {
	private closed = false;
	private readonly active = new Map<string, { controller: AbortController; done: Promise<void> }>();
	private readonly history: RunRecord[] = [];
	constructor(private readonly deadlineMs = 60 * 60 * 1000) {}
	get records(): readonly RunRecord[] { return this.history.map(record => ({ ...record })); }
	async run(parent: AbortSignal | undefined, work: (lease: RunLease) => Promise<void>): Promise<void> {
		if (this.closed) throw new Error('Task service has stopped');
		const controller = new AbortController();
		const record: RunRecord = { id: `run-${crypto.randomUUID()}`, status: 'running', startedAt: Date.now() };
		this.history.push(record);
		if (this.history.length > 100) this.history.shift();
		const abort = () => controller.abort(parent?.reason ?? new Error('Task aborted'));
		if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, { once: true });
		const timer = runtimeClock.schedule(() => controller.abort(new Error('Task deadline reached')), this.deadlineMs);
		let resolve!: () => void;
		const done = new Promise<void>(finish => { resolve = finish; });
		this.active.set(record.id, { controller, done });
		try {
			await work({ id: record.id, signal: controller.signal, finish: status => { record.status = status; } });
			if (record.status === 'running') record.status = controller.signal.aborted ? 'aborted' : 'completed';
		} catch (error) { record.status = controller.signal.aborted ? 'aborted' : 'failed'; throw error; }
		finally { record.finishedAt = Date.now(); runtimeClock.cancel(timer); parent?.removeEventListener('abort', abort); this.active.delete(record.id); resolve(); }
	}
	async dispose(): Promise<void> {
		this.closed = true;
		const active = [...this.active.values()];
		for (const run of active) run.controller.abort(new Error('Plugin unloaded'));
		await Promise.all(active.map(run => run.done));
	}
}
