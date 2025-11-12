/**
 * Workflow System - Index Manager
 *
 * Manages the index file (data/workflow/index.json) that tracks
 * relationships between workflows and their executions.
 */

import { Vault } from 'obsidian';

/**
 * Workflow index entry
 */
export interface WorkflowIndexEntry {
	id: string;
	name: string;
	description?: string;
	filePath: string;
	createdAt: number;
	updatedAt: number;
	executionCount: number;
	lastExecutionId?: string;
	lastExecutionTimestamp?: number;
	lastExecutionStatus?: 'success' | 'failure';
	executionFolder: string;
	metadata?: {
		tags?: string[];
		author?: string;
		version?: string;
		[key: string]: any;
	};
}

/**
 * Execution index entry
 */
export interface ExecutionIndexEntry {
	id: string;
	workflowId: string;
	timestamp: number;
	duration: number;
	success: boolean;
	filePath: string;
}

/**
 * Full index structure
 */
export interface WorkflowIndex {
	version: string;
	lastUpdated: number;
	workflows: Record<string, WorkflowIndexEntry>;
	recentExecutions: ExecutionIndexEntry[]; // Last N executions across all workflows
}

/**
 * Workflow index manager
 */
export class WorkflowIndexManager {
	private vault: Vault;
	private indexPath: string;
	private index: WorkflowIndex | null = null;
	private maxRecentExecutions = 100;

	/**
	 * @param vault - Obsidian vault instance
	 * @param pluginDataPath - Full path to plugin's data directory
	 */
	constructor(vault: Vault, pluginDataPath: string) {
		this.vault = vault;
		this.indexPath = `${pluginDataPath}/workflow/index.json`;
	}

	/**
	 * Initialize index (load or create)
	 */
	async initialize(): Promise<void> {
		await this.ensureBaseFolderExists();
		await this.loadIndex();
	}

	/**
	 * Load index from file
	 */
	async loadIndex(): Promise<WorkflowIndex> {
		try {
			const adapter = this.vault.adapter;
			const exists = await adapter.exists(this.indexPath);

			if (!exists) {
				// Create new index
				this.index = this.createEmptyIndex();
				await this.saveIndex();
				return this.index;
			}

			const content = await adapter.read(this.indexPath);
			const loadedIndex = JSON.parse(content) as WorkflowIndex;

			// Ensure backwards compatibility - add missing fields
			if (!loadedIndex.recentExecutions) {
				loadedIndex.recentExecutions = [];
			}
			if (!loadedIndex.workflows) {
				loadedIndex.workflows = {};
			}

			this.index = loadedIndex;
			return this.index;
		} catch (error) {
			console.error('Failed to load workflow index:', error);
			// Create new index on error
			this.index = this.createEmptyIndex();
			await this.saveIndex();
			return this.index;
		}
	}

	/**
	 * Save index to file
	 */
	async saveIndex(): Promise<void> {
		if (!this.index) {
			return;
		}

		this.index.lastUpdated = Date.now();

		try {
			const content = JSON.stringify(this.index, null, 2);
			const adapter = this.vault.adapter;
			await adapter.write(this.indexPath, content);
		} catch (error) {
			console.error('Failed to save workflow index:', error);
			throw error;
		}
	}

	/**
	 * Register or update a workflow in the index
	 */
	async registerWorkflow(
		id: string,
		name: string,
		filePath: string,
		description?: string,
		metadata?: WorkflowIndexEntry['metadata']
	): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		const now = Date.now();
		const existingEntry = this.index!.workflows[id];

		const entry: WorkflowIndexEntry = {
			id,
			name,
			description,
			filePath,
			createdAt: existingEntry?.createdAt ?? now,
			updatedAt: now,
			executionCount: existingEntry?.executionCount ?? 0,
			lastExecutionId: existingEntry?.lastExecutionId,
			lastExecutionTimestamp: existingEntry?.lastExecutionTimestamp,
			lastExecutionStatus: existingEntry?.lastExecutionStatus,
			executionFolder: `workflow/${id}/execution`,
			metadata: metadata ?? existingEntry?.metadata,
		};

		this.index!.workflows[id] = entry;
		await this.saveIndex();
	}

	/**
	 * Unregister a workflow from the index
	 */
	async unregisterWorkflow(id: string): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		delete this.index!.workflows[id];

		// Remove executions related to this workflow from recent executions
		this.index!.recentExecutions = this.index!.recentExecutions.filter(
			e => e.workflowId !== id
		);

		await this.saveIndex();
	}

	/**
	 * Record a workflow execution
	 */
	async recordExecution(
		workflowId: string,
		executionId: string,
		timestamp: number,
		duration: number,
		success: boolean,
		filePath: string
	): Promise<void> {
		if (!this.index) {
			await this.initialize();
		}

		// Ensure index and recentExecutions exist
		if (!this.index) {
			console.error('Failed to initialize workflow index');
			return;
		}

		if (!this.index.recentExecutions) {
			this.index.recentExecutions = [];
		}

		// Update workflow entry
		const workflowEntry = this.index.workflows[workflowId];
		if (workflowEntry) {
			workflowEntry.executionCount++;
			workflowEntry.lastExecutionId = executionId;
			workflowEntry.lastExecutionTimestamp = timestamp;
			workflowEntry.lastExecutionStatus = success ? 'success' : 'failure';
			workflowEntry.updatedAt = Date.now();
		}

		// Add to recent executions
		const executionEntry: ExecutionIndexEntry = {
			id: executionId,
			workflowId,
			timestamp,
			duration,
			success,
			filePath,
		};

		this.index.recentExecutions.unshift(executionEntry);

		// Keep only the most recent N executions
		if (this.index.recentExecutions.length > this.maxRecentExecutions) {
			this.index.recentExecutions = this.index.recentExecutions.slice(
				0,
				this.maxRecentExecutions
			);
		}

		await this.saveIndex();
	}

	/**
	 * Get workflow entry from index
	 */
	getWorkflow(id: string): WorkflowIndexEntry | null {
		if (!this.index) {
			return null;
		}
		return this.index.workflows[id] ?? null;
	}

	/**
	 * Get all workflows from index
	 */
	getAllWorkflows(): WorkflowIndexEntry[] {
		if (!this.index) {
			return [];
		}
		return Object.values(this.index.workflows);
	}

	/**
	 * Get recent executions across all workflows
	 */
	getRecentExecutions(limit?: number): ExecutionIndexEntry[] {
		if (!this.index) {
			return [];
		}
		return limit
			? this.index.recentExecutions.slice(0, limit)
			: this.index.recentExecutions;
	}

	/**
	 * Get recent executions for a specific workflow
	 */
	getWorkflowExecutions(workflowId: string, limit?: number): ExecutionIndexEntry[] {
		if (!this.index) {
			return [];
		}
		const executions = this.index.recentExecutions.filter(e => e.workflowId === workflowId);
		return limit ? executions.slice(0, limit) : executions;
	}

	/**
	 * Get execution statistics
	 */
	getStats(): {
		totalWorkflows: number;
		totalExecutions: number;
		successfulExecutions: number;
		failedExecutions: number;
		averageDuration: number;
	} {
		if (!this.index) {
			return {
				totalWorkflows: 0,
				totalExecutions: 0,
				successfulExecutions: 0,
				failedExecutions: 0,
				averageDuration: 0,
			};
		}

		const workflows = Object.values(this.index.workflows);
		const totalExecutions = workflows.reduce((sum, w) => sum + w.executionCount, 0);
		const recentExecutions = this.index.recentExecutions;
		const successfulExecutions = recentExecutions.filter(e => e.success).length;
		const failedExecutions = recentExecutions.length - successfulExecutions;
		const averageDuration = recentExecutions.length > 0
			? recentExecutions.reduce((sum, e) => sum + e.duration, 0) / recentExecutions.length
			: 0;

		return {
			totalWorkflows: workflows.length,
			totalExecutions,
			successfulExecutions,
			failedExecutions,
			averageDuration,
		};
	}

	/**
	 * Search workflows by name or description
	 */
	searchWorkflows(query: string): WorkflowIndexEntry[] {
		if (!this.index) {
			return [];
		}

		const lowercaseQuery = query.toLowerCase();
		return Object.values(this.index.workflows).filter(w =>
			w.name.toLowerCase().includes(lowercaseQuery) ||
			w.description?.toLowerCase().includes(lowercaseQuery)
		);
	}

	/**
	 * Get workflows by tag
	 */
	getWorkflowsByTag(tag: string): WorkflowIndexEntry[] {
		if (!this.index) {
			return [];
		}

		return Object.values(this.index.workflows).filter(w =>
			w.metadata?.tags?.includes(tag)
		);
	}

	/**
	 * Export index (for backup or migration)
	 */
	exportIndex(): string {
		if (!this.index) {
			return JSON.stringify(this.createEmptyIndex(), null, 2);
		}
		return JSON.stringify(this.index, null, 2);
	}

	/**
	 * Import index (for restore or migration)
	 */
	async importIndex(indexJson: string): Promise<void> {
		try {
			const importedIndex = JSON.parse(indexJson) as WorkflowIndex;
			this.index = importedIndex;
			await this.saveIndex();
		} catch (error) {
			console.error('Failed to import workflow index:', error);
			throw error;
		}
	}

	/**
	 * Rebuild index from files (recovery tool)
	 */
	async rebuildIndex(): Promise<void> {
		// This would scan the data/workflow folder and rebuild the index
		// Implementation depends on your specific needs
		console.log('Index rebuild not yet implemented');
	}

	/**
	 * Helper: Create empty index
	 */
	private createEmptyIndex(): WorkflowIndex {
		return {
			version: '0.0.1',
			lastUpdated: Date.now(),
			workflows: {},
			recentExecutions: [],
		};
	}

	/**
	 * Helper: Ensure base folder exists
	 */
	private async ensureBaseFolderExists(): Promise<void> {
		try {
			const basePath = this.indexPath.substring(0, this.indexPath.lastIndexOf('/'));
			const adapter = this.vault.adapter;
			const exists = await adapter.exists(basePath);

			if (!exists) {
				await adapter.mkdir(basePath);
			}
		} catch (error) {
			// Folder might already exist, ignore error
		}
	}
}
