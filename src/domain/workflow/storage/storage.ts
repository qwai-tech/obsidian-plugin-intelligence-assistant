/**
 * Workflow System V2 - Storage Manager
 *
 * Manages persistence of workflows to Obsidian vault.
 * Simple file-based storage with JSON format.
 */

import { TFile, Vault } from 'obsidian';
import { Workflow } from '../core/types';

/**
 * Workflow storage - manages workflow persistence
 */
export class WorkflowStorage {
	private vault: Vault;
	private folderPath: string;

	constructor(vault: Vault, folderPath = 'workflows') {
		this.vault = vault;
		this.folderPath = folderPath;
	}

	/**
	 * Initialize storage (create folder if needed)
	 */
	async initialize(): Promise<void> {
		try {
			const folder = this.vault.getAbstractFileByPath(this.folderPath);
			if (!folder) {
				await this.vault.createFolder(this.folderPath);
			}
		} catch (error) {
			// Folder might already exist
			console.debug('Workflow storage folder initialized');
		}
	}

	/**
	 * Save a workflow
	 */
	async save(workflow: Workflow): Promise<void> {
		await this.initialize();

		const fileName = this.getFileName(workflow.id);
		const filePath = `${this.folderPath}/${fileName}`;
		const content = JSON.stringify(workflow, null, 2);

		try {
			// First, try using the high-level vault API
			const file = this.vault.getAbstractFileByPath(filePath);

			if (file instanceof TFile) {
				// Update existing file
				await this.vault.modify(file, content);
			} else {
				// File doesn't exist in vault cache, use adapter for reliable write
				// This will create or overwrite the file
				const adapter = this.vault.adapter;
				await adapter.write(filePath, content);
			}
		} catch (error: any) {
			throw new Error(`Failed to save workflow: ${error.message}`);
		}
	}

	/**
	 * Load a workflow by ID
	 */
	async load(id: string): Promise<Workflow | null> {
		const fileName = this.getFileName(id);
		const filePath = `${this.folderPath}/${fileName}`;

		try {
			const file = this.vault.getAbstractFileByPath(filePath);

			if (file instanceof TFile) {
				const content = await this.vault.read(file);
				return JSON.parse(content) as Workflow;
			}

			return null;
		} catch (error: any) {
			console.error(`Failed to load workflow ${id}:`, error);
			return null;
		}
	}

	/**
	 * Load a workflow by file path
	 */
	async loadByPath(path: string): Promise<Workflow | null> {
		try {
			const file = this.vault.getAbstractFileByPath(path);

			if (file instanceof TFile) {
				const content = await this.vault.read(file);
				return JSON.parse(content) as Workflow;
			}

			return null;
		} catch (error: any) {
			console.error(`Failed to load workflow from ${path}:`, error);
			return null;
		}
	}

	/**
	 * List all workflows
	 */
	async list(): Promise<Workflow[]> {
		await this.initialize();

		const files = this.vault.getFiles().filter(
			f => f.path.startsWith(`${this.folderPath}/`) && f.extension === 'json'
		);

		const workflows: Workflow[] = [];

		for (const file of files) {
			try {
				const content = await this.vault.read(file);
				const workflow = JSON.parse(content) as Workflow;
				workflows.push(workflow);
			} catch (error) {
				console.error(`Failed to load workflow from ${file.path}:`, error);
			}
		}

		// Sort by updated time (most recent first)
		workflows.sort((a, b) => b.updated - a.updated);

		return workflows;
	}

	/**
	 * Delete a workflow
	 */
	async delete(id: string): Promise<void> {
		const fileName = this.getFileName(id);
		const filePath = `${this.folderPath}/${fileName}`;

		try {
			const file = this.vault.getAbstractFileByPath(filePath);

			if (file instanceof TFile) {
				await this.vault.delete(file);
			}
		} catch (error: any) {
			throw new Error(`Failed to delete workflow: ${error.message}`);
		}
	}

	/**
	 * Check if a workflow exists
	 */
	async exists(id: string): Promise<boolean> {
		const fileName = this.getFileName(id);
		const filePath = `${this.folderPath}/${fileName}`;
		const file = this.vault.getAbstractFileByPath(filePath);

		return file instanceof TFile;
	}

	/**
	 * Rename a workflow
	 */
	async rename(id: string, newName: string): Promise<void> {
		const workflow = await this.load(id);

		if (!workflow) {
			throw new Error(`Workflow ${id} not found`);
		}

		workflow.name = newName;
		workflow.updated = Date.now();

		await this.save(workflow);
	}

	/**
	 * Duplicate a workflow
	 */
	async duplicate(id: string, newName?: string): Promise<Workflow> {
		const original = await this.load(id);

		if (!original) {
			throw new Error(`Workflow ${id} not found`);
		}

		const duplicate: Workflow = {
			...original,
			id: `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
			name: newName || `${original.name} (Copy)`,
			created: Date.now(),
			updated: Date.now(),
		};

		await this.save(duplicate);

		return duplicate;
	}

	/**
	 * Export workflow to JSON string
	 */
	async export(id: string): Promise<string> {
		const workflow = await this.load(id);

		if (!workflow) {
			throw new Error(`Workflow ${id} not found`);
		}

		return JSON.stringify(workflow, null, 2);
	}

	/**
	 * Import workflow from JSON string
	 */
	async import(json: string): Promise<Workflow> {
		try {
			const workflow = JSON.parse(json) as Workflow;

			// Generate new ID to avoid conflicts
			workflow.id = `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
			workflow.created = Date.now();
			workflow.updated = Date.now();

			await this.save(workflow);

			return workflow;
		} catch (error: any) {
			throw new Error(`Failed to import workflow: ${error.message}`);
		}
	}

	/**
	 * Get file name for a workflow
	 */
	private getFileName(id: string): string {
		return `${id}.json`;
	}

	/**
	 * Get statistics
	 */
	async getStats() {
		const workflows = await this.list();

		return {
			total: workflows.length,
			totalNodes: workflows.reduce((sum, w) => sum + w.nodes.length, 0),
			totalConnections: workflows.reduce((sum, w) => sum + w.connections.length, 0),
			averageNodesPerWorkflow: workflows.length > 0
				? workflows.reduce((sum, w) => sum + w.nodes.length, 0) / workflows.length
				: 0,
		};
	}
}
