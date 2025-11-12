/**
 * Plugin Storage Adapter
 * Implements storage port using plugin settings
 */

import type IntelligenceAssistantPlugin from '@plugin';
import type { IStoragePort } from '../ports/storage-port';
import type { Workflow } from '@/types';

export class PluginStorageAdapter implements IStoragePort {
	constructor(private plugin: IntelligenceAssistantPlugin) {}

	private async repo() {
		return await this.plugin.getWorkflowDataRepository();
	}

	async save(workflow: Workflow): Promise<void> {
		const repository = await this.repo();
		await repository.saveWorkflow(workflow);
	}

	async load(id: string): Promise<Workflow | null> {
		const repository = await this.repo();
		return await repository.loadWorkflow(id);
	}

	async loadAll(): Promise<Workflow[]> {
		const repository = await this.repo();
		return await repository.loadAllWorkflows();
	}

	async delete(id: string): Promise<void> {
		const repository = await this.repo();
		await repository.deleteWorkflow(id);
	}

	async exists(id: string): Promise<boolean> {
		const repository = await this.repo();
		return await repository.exists(id);
	}
}
