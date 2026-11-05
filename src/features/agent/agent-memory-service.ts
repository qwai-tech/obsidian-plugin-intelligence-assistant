import type { AgentMemoryFile, AgentMemorySnapshot } from '@/features/agent/types/memory';
import type { MemoryWriteOptions } from '@/features/knowledge';

export interface AgentMemoryStore { load(): Promise<AgentMemoryFile>; save(memory: AgentMemoryFile): Promise<void> }
type Mode = 'short-term' | 'long-term';
function empty(agentId: string): AgentMemorySnapshot { return { agentId, workingNotes: [], researchLog: '', preferences: {}, updatedAt: Date.now() }; }
function copy(value: AgentMemorySnapshot): AgentMemorySnapshot { return JSON.parse(JSON.stringify(value)) as AgentMemorySnapshot; }

export class AgentMemoryService {
	private loading?: Promise<AgentMemoryFile>;
	private readonly session = new Map<string, AgentMemorySnapshot>();
	private queue: Promise<unknown> = Promise.resolve();
	constructor(private readonly repository: AgentMemoryStore) {}
	private serialize<T>(work: () => Promise<T>): Promise<T> { const next = this.queue.then(work, work); this.queue = next.catch(() => undefined); return next; }
	private file(): Promise<AgentMemoryFile> { this.loading ??= this.repository.load(); return this.loading; }
	async getSnapshot(agentId: string, mode: Mode = 'long-term'): Promise<AgentMemorySnapshot> {
		await this.queue;
		return copy(mode === 'short-term' ? this.session.get(agentId) ?? empty(agentId) : (await this.file()).agents[agentId] ?? empty(agentId));
	}
	private mutate(agentId: string, options: MemoryWriteOptions, change: (snapshot: AgentMemorySnapshot, limit: number) => void): Promise<void> {
		return this.serialize(async () => {
			options.signal?.throwIfAborted();
			const file = options.mode === 'short-term' ? undefined : await this.file();
			const snapshot = copy(file ? file.agents[agentId] ?? empty(agentId) : this.session.get(agentId) ?? empty(agentId));
			const limit = Math.max(1, Math.min(1000, options.maxEntries ?? 50));
			change(snapshot, limit);
			snapshot.updatedAt = Date.now();
			options.signal?.throwIfAborted();
			if (file) { const next = { ...file, agents: { ...file.agents, [agentId]: snapshot } }; await this.repository.save(next); this.loading = Promise.resolve(next); }
			else this.session.set(agentId, snapshot);
		});
	}
	appendResearchLog(agentId: string, entry: string, options: MemoryWriteOptions = {}): Promise<void> {
		return this.mutate(agentId, options, (snapshot, limit) => {
			const entries = snapshot.researchEntries ?? snapshot.researchLog.split('\n').filter(Boolean);
			snapshot.researchEntries = [...entries.filter(value => value !== entry), entry.slice(0, 8000)].slice(-limit);
			snapshot.researchLog = snapshot.researchEntries.join('\n');
		});
	}
	setPreference(agentId: string, key: string, value: string, options: MemoryWriteOptions = {}): Promise<void> {
		return this.mutate(agentId, options, (snapshot, limit) => {
			snapshot.preferences = Object.fromEntries(Object.entries({ ...snapshot.preferences, [key.slice(0, 200)]: value.slice(0, 2000) }).slice(-limit));
		});
	}
	async shouldConsolidate(agentId: string, interval: number, mode: Mode): Promise<boolean> {
		let due = false;
		await this.mutate(agentId, { mode }, snapshot => { snapshot.completedRuns = (snapshot.completedRuns ?? 0) + 1; due = snapshot.completedRuns % Math.max(1, Math.floor(interval)) === 0; });
		return due;
	}
}
