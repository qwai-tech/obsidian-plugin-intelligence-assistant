import type { AgentMemorySnapshot } from '@/application/agents';
import type { AgentMemoryFile, AgentMemoryRepository } from '@/infrastructure/persistence';

function emptySnapshot(agentId: string): AgentMemorySnapshot {
	return {
		agentId,
		workingNotes: [],
		researchLog: '',
		preferences: {},
		updatedAt: Date.now(),
	};
}

function cloneSnapshot(snapshot: AgentMemorySnapshot): AgentMemorySnapshot {
	return {
		...snapshot,
		workingNotes: [...snapshot.workingNotes],
		preferences: { ...snapshot.preferences },
	};
}

export class AgentMemoryService {
	private cache: AgentMemoryFile | null = null;

	constructor(private readonly repository: Pick<AgentMemoryRepository, 'load' | 'save'>) {}

	async getSnapshot(agentId: string): Promise<AgentMemorySnapshot> {
		const file = await this.getFile();
		const existing = file.agents[agentId];
		return existing ? cloneSnapshot(existing) : emptySnapshot(agentId);
	}

	async appendResearchLog(agentId: string, entry: string): Promise<void> {
		const file = await this.getFile();
		const snapshot = file.agents[agentId] ?? emptySnapshot(agentId);
		const nextLog = [snapshot.researchLog.trim(), entry.trim()].filter(Boolean).join('\n');
		file.agents[agentId] = { ...snapshot, researchLog: nextLog, updatedAt: Date.now() };
		await this.save(file);
	}

	async setPreference(agentId: string, key: string, value: string): Promise<void> {
		const file = await this.getFile();
		const snapshot = file.agents[agentId] ?? emptySnapshot(agentId);
		file.agents[agentId] = {
			...snapshot,
			preferences: { ...snapshot.preferences, [key]: value },
			updatedAt: Date.now(),
		};
		await this.save(file);
	}

	private async getFile(): Promise<AgentMemoryFile> {
		if (!this.cache) {
			this.cache = await this.repository.load();
		}
		return this.cache;
	}

	private async save(file: AgentMemoryFile): Promise<void> {
		this.cache = file;
		await this.repository.save(file);
	}
}
