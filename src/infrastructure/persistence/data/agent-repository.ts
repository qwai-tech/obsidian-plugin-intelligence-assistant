import { App } from 'obsidian';
import type { Agent } from '@/types';
import { AGENTS_DATA_FOLDER } from '@/constants';
import { ensureFolderExists, buildSafeName } from '@/utils/file-system';

interface AgentIndexEntry {
	id: string;
	name: string;
	icon?: string;
	updatedAt: number;
	file: string;
}

interface AgentIndexFile {
	version: string;
	updatedAt: number;
	activeId: string | null;
	agents: AgentIndexEntry[];
}

const INDEX_VERSION = '1.0';

export class AgentRepository {
	private readonly baseFolder = AGENTS_DATA_FOLDER;
	private readonly indexPath = `${this.baseFolder}/index.json`;
	private initialized = false;

	constructor(private readonly app: App) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this.app.vault.adapter, this.baseFolder);
		if (!(await this.app.vault.adapter.exists(this.indexPath))) {
			await this.writeIndex({
				version: INDEX_VERSION,
				updatedAt: Date.now(),
				activeId: null,
				agents: []
			});
		}
		this.initialized = true;
	}

	async loadAll(): Promise<{ agents: Agent[]; activeId: string | null }> {
		await this.initialize();
		const index = await this.readIndex();
		const agents: Agent[] = [];

		for (const entry of index.agents) {
			const agent = await this.readAgent(entry.file);
			if (agent) {
				agents.push(agent);
			}
		}

		if (agents.length === 0) {
			const discovered = await this.loadAgentsFromFolder();
			if (discovered.length > 0) {
				await this.saveAll(discovered, index.activeId ?? null);
				return { agents: discovered, activeId: index.activeId ?? null };
			}
		}

		return { agents, activeId: index.activeId ?? null };
	}

	async saveAll(agents: Agent[], activeId: string | null): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const keepFiles = new Set<string>();

		for (const agent of agents) {
			const filePath = this.getAgentFilePath(agent.id);
			keepFiles.add(filePath);
			await adapter.write(filePath, JSON.stringify(agent, null, 2));
		}

		await this.removeOrphanedAgentFiles(keepFiles);

		const index: AgentIndexFile = {
			version: INDEX_VERSION,
			updatedAt: Date.now(),
			activeId: activeId ?? null,
			agents: agents.map(agent => ({
				id: agent.id,
				name: agent.name,
				icon: agent.icon,
				updatedAt: agent.updatedAt ?? Date.now(),
				file: this.getAgentFilePath(agent.id)
			}))
		};

		await this.writeIndex(index);
	}

	private async readAgent(filePath: string): Promise<Agent | null> {
		try {
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as Agent;
		} catch (error) {
			console.warn(`[Agents] Failed to read agent file ${filePath}:`, error);
			return null;
		}
	}

	private async loadAgentsFromFolder(): Promise<Agent[]> {
		const adapter = this.app.vault.adapter;
		const agents: Agent[] = [];
		const listing = await adapter.list(this.baseFolder);

		for (const file of listing.files) {
			if (file === this.indexPath || !file.endsWith('.json')) {
				continue;
			}
			const agent = await this.readAgent(file);
			if (agent) {
				agents.push(agent);
			}
		}

		return agents;
	}

	private async removeOrphanedAgentFiles(keep: Set<string>): Promise<void> {
		const adapter = this.app.vault.adapter;
		const listing = await adapter.list(this.baseFolder);

		for (const file of listing.files) {
			if (file === this.indexPath || !file.endsWith('.json')) {
				continue;
			}
			if (!keep.has(file)) {
				await adapter.remove(file);
			}
		}
	}

	private getAgentFilePath(agentId: string): string {
		const safeName = buildSafeName(agentId, 'agent');
		return `${this.baseFolder}/${safeName}.json`;
	}

	private async readIndex(): Promise<AgentIndexFile> {
		try {
			const content = await this.app.vault.adapter.read(this.indexPath);
			return JSON.parse(content) as AgentIndexFile;
		} catch {
			return {
				version: INDEX_VERSION,
				updatedAt: Date.now(),
				activeId: null,
				agents: []
			};
		}
	}

	private async writeIndex(index: AgentIndexFile): Promise<void> {
		await this.app.vault.adapter.write(this.indexPath, JSON.stringify(index, null, 2));
	}
}
