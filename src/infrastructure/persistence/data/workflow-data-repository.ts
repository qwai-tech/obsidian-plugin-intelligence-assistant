import { App } from 'obsidian';
import type { Workflow, WorkflowExecution } from '@/types';
import { WORKFLOW_DATA_FOLDER } from '@/constants';
import { ensureFolderExists, buildSafeName } from '@/utils/file-system';

interface WorkflowIndexEntry {
	id: string;
	name: string;
	description?: string;
	folder: string;
	file: string;
	createdAt?: number;
	updatedAt?: number;
}

interface WorkflowIndexFile {
	version: string;
	updatedAt: number;
	workflows: WorkflowIndexEntry[];
}

const INDEX_VERSION = '1.0';

export class WorkflowDataRepository {
	private readonly baseFolder = WORKFLOW_DATA_FOLDER;
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
				workflows: []
			});
		}
		this.initialized = true;
	}

	async loadAllWorkflows(): Promise<Workflow[]> {
		await this.initialize();
		const index = await this.readIndex();
		const workflows: Workflow[] = [];

		for (const entry of index.workflows) {
			const workflow = await this.readWorkflow(entry.file);
			if (workflow) {
				workflows.push(workflow);
			}
		}

		return workflows;
	}

	async loadWorkflow(id: string): Promise<Workflow | null> {
		await this.initialize();
		const filePath = await this.resolveWorkflowFilePath(id);
		if (!filePath) return null;
		return await this.readWorkflow(filePath);
	}

	async saveWorkflow(workflow: Workflow): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const folder = this.getWorkflowFolder(workflow.id);
		await ensureFolderExists(adapter, folder);
		const filePath = `${folder}/workflow.json`;
		await adapter.write(filePath, JSON.stringify(workflow, null, 2));

		const index = await this.readIndex();
		const filtered = index.workflows.filter(entry => entry.id !== workflow.id);
		filtered.push({
			id: workflow.id,
			name: workflow.name,
			description: workflow.description,
			folder,
			file: filePath,
			createdAt: workflow.createdAt,
			updatedAt: workflow.updatedAt
		});

		await this.writeIndex({
			version: INDEX_VERSION,
			updatedAt: Date.now(),
			workflows: filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
		});
	}

	async deleteWorkflow(id: string): Promise<void> {
		await this.initialize();
		const index = await this.readIndex();
		const entry = index.workflows.find(w => w.id === id);
		if (!entry) return;

		await this.removeFolder(entry.folder);

		await this.writeIndex({
			version: INDEX_VERSION,
			updatedAt: Date.now(),
			workflows: index.workflows.filter(w => w.id !== id)
		});
	}

	async replaceAll(workflows: Workflow[]): Promise<void> {
		await this.initialize();
		const index = await this.readIndex();
		for (const entry of index.workflows) {
			await this.removeFolder(entry.folder);
		}
		await this.writeIndex({ version: INDEX_VERSION, updatedAt: Date.now(), workflows: [] });
		for (const workflow of workflows) {
			await this.saveWorkflow(workflow);
		}
	}

	async exists(id: string): Promise<boolean> {
		await this.initialize();
		const index = await this.readIndex();
		return index.workflows.some(entry => entry.id === id);
	}

	async loadExecutions(workflowId?: string): Promise<WorkflowExecution[]> {
		await this.initialize();
		if (workflowId) {
			return await this.loadExecutionsForWorkflow(workflowId);
		}

		const index = await this.readIndex();
		const executions: WorkflowExecution[] = [];
		for (const entry of index.workflows) {
			executions.push(...(await this.loadExecutionsFromFolder(entry.folder)));
		}
		return executions.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
	}

	async saveExecution(execution: WorkflowExecution): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const workflowFolder = this.getWorkflowFolder(execution.workflowId);
		await ensureFolderExists(adapter, workflowFolder);
		const execFolder = `${workflowFolder}/execution`;
		await ensureFolderExists(adapter, execFolder);
		const filePath = `${execFolder}/${buildSafeName(execution.id, 'execution')}.json`;
		await adapter.write(filePath, JSON.stringify(execution, null, 2));
	}

	async deleteExecution(workflowId: string, executionId: string): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const index = await this.readIndex();
		const entry = index.workflows.find(w => w.id === workflowId);
		const execFolder = `${(entry?.folder ?? this.getWorkflowFolder(workflowId))}/execution`;
		const filePath = `${execFolder}/${buildSafeName(executionId, 'execution')}.json`;
		if (await adapter.exists(filePath)) {
			await adapter.remove(filePath);
		}
	}

	private async loadExecutionsForWorkflow(workflowId: string): Promise<WorkflowExecution[]> {
		const index = await this.readIndex();
		const entry = index.workflows.find(w => w.id === workflowId);
		const folder = entry?.folder ?? this.getWorkflowFolder(workflowId);
		return await this.loadExecutionsFromFolder(folder);
	}

	private async loadExecutionsFromFolder(folder: string): Promise<WorkflowExecution[]> {
		const execFolder = `${folder}/execution`;
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(execFolder))) {
			return [];
		}

		const listing = await adapter.list(execFolder);
		const executions: WorkflowExecution[] = [];
		for (const file of listing.files) {
			if (!file.endsWith('.json')) {
				continue;
			}
			const execution = await this.readExecution(file);
			if (execution) {
				executions.push(execution);
			}
		}
		return executions;
	}

	private getWorkflowFolder(workflowId: string): string {
		const folderName = buildSafeName(workflowId, 'workflow');
		return `${this.baseFolder}/${folderName}`;
	}

	private async resolveWorkflowFilePath(workflowId: string): Promise<string | null> {
		const index = await this.readIndex();
		const entry = index.workflows.find(w => w.id === workflowId);
		if (entry && await this.app.vault.adapter.exists(entry.file)) {
			return entry.file;
		}
		const fallback = `${this.getWorkflowFolder(workflowId)}/workflow.json`;
		return (await this.app.vault.adapter.exists(fallback)) ? fallback : null;
	}

	private async readWorkflow(filePath: string): Promise<Workflow | null> {
		try {
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as Workflow;
		} catch (error) {
			console.warn(`[Workflows] Failed to read workflow ${filePath}:`, error);
			return null;
		}
	}

	private async readExecution(filePath: string): Promise<WorkflowExecution | null> {
		try {
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as WorkflowExecution;
		} catch (error) {
			console.warn(`[Workflows] Failed to read execution ${filePath}:`, error);
			return null;
		}
	}

	private async removeFolder(folder: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(folder))) {
			return;
		}
		const listing = await adapter.list(folder);
		for (const file of listing.files) {
			await adapter.remove(file);
		}
		for (const subFolder of listing.folders) {
			await adapter.rmdir(subFolder, true);
		}
		await adapter.rmdir(folder, true);
	}

	private async readIndex(): Promise<WorkflowIndexFile> {
		try {
			const content = await this.app.vault.adapter.read(this.indexPath);
			return JSON.parse(content) as WorkflowIndexFile;
		} catch {
			return {
				version: INDEX_VERSION,
				updatedAt: Date.now(),
				workflows: []
			};
		}
	}

	private async writeIndex(index: WorkflowIndexFile): Promise<void> {
		await this.app.vault.adapter.write(this.indexPath, JSON.stringify(index, null, 2));
	}
}
