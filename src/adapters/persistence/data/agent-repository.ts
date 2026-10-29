import type { App } from 'obsidian';
import type { Agent } from '@/features/agent/types/agent';
import { pluginPaths } from '@/core/plugin-paths';
import { JsonCollection } from '@/adapters/persistence/json-collection';

interface AgentIndexEntry {
	id: string;
	name: string;
	icon?: string;
	updatedAt: number;
	file: string;
}

export class AgentRepository {
	private readonly collection: JsonCollection<Agent, AgentIndexEntry>;
	private seeded: Promise<void> | null = null;

	constructor(app: App, private readonly presets: Agent[]) {
		this.collection = new JsonCollection(app.vault.adapter, pluginPaths(app.vault.configDir).agents, {
			entriesKey: 'agents',
			filePrefix: 'agent',
			toEntry: (agent, file) => ({ id: agent.id, name: agent.name, icon: agent.icon, updatedAt: agent.updatedAt ?? Date.now(), file }),
		});
	}

	initialize(): Promise<void> {
		this.seeded ??= this.seedPresets();
		return this.seeded;
	}

	async loadAll(): Promise<{ agents: Agent[]; activeId: string | null }> {
		await this.initialize();
		const { items, activeId } = await this.collection.load();
		if (items.length > 0) {
			return { agents: items, activeId };
		}
		await this.collection.save(this.presets, activeId);
		return { agents: this.presets, activeId };
	}

	async saveAll(agents: Agent[], activeId: string | null): Promise<void> {
		await this.initialize();
		await this.collection.save(agents, activeId ?? null);
	}

	private async seedPresets(): Promise<void> {
		if (!(await this.collection.load()).indexExists) {
			await this.collection.save(this.presets, null);
		}
	}
}
