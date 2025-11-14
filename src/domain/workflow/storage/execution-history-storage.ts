/**
 * Workflow System - Execution History Storage
 *
 * Manages persistence of workflow execution history to vault.
 * Stores execution results in data/workflow/{workflow-id}/execution/{date}-{uuid}.json
 */

import { Vault } from 'obsidian';

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Execution result with metadata
 */
export interface ExecutionRecord {
	id: string;
	workflowId: string;
	workflowName: string;
	timestamp: number;
	duration: number;
	success: boolean;
	error?: string;
	log: Array<{
		nodeId: string;
		nodeName: string;
		nodeType: string;
		status: 'pending' | 'running' | 'completed' | 'error';
		startTime?: number;
		endTime?: number;
		duration?: number;
		input?: unknown;
		output?: unknown;
		error?: string;
	}>;
	metadata?: {
		triggeredBy?: 'manual' | 'scheduled' | 'event';
		userNote?: string;
		[key: string]: unknown;
	};
}

/**
 * Execution history storage manager
 */
export class ExecutionHistoryStorage {
	private vault: Vault;
	private basePath: string;

	/**
	 * @param vault - Obsidian vault instance
	 * @param pluginDataPath - Full path to plugin's data directory (e.g., /path/to/vault/.obsidian/plugins/plugin-name/data)
	 */
	constructor(vault: Vault, pluginDataPath: string) {
		this.vault = vault;
		// Remove 'data/workflow' and use plugin data path directly
		this.basePath = `${pluginDataPath}/workflow`;
	}

	/**
	 * Initialize storage (create base folder if needed)
	 */
	async initialize(): Promise<void> {
		try {
			// Use adapter to create directories in plugin folder
			await this.ensurePluginFolderExists(this.basePath);
		} catch (error) {
			console.error('Failed to initialize execution history storage:', error);
		}
	}

	/**
	 * Helper: Ensure plugin folder exists using adapter
	 */
	private async ensurePluginFolderExists(path: string): Promise<void> {
		try {
			const adapter = this.vault.adapter;
			const exists = await adapter.exists(path);
			if (!exists) {
				await adapter.mkdir(path);
			}
		} catch (error) {
			console.error('Failed to create plugin folder:', error);
		}
	}

	/**
	 * Save an execution record
	 */
	async saveExecution(
		workflowId: string,
		workflowName: string,
		executionResult: {
			success: boolean;
			duration: number;
			error?: string;
			log: unknown[];
		},
		metadata?: ExecutionRecord['metadata']
	): Promise<string> {
		await this.initialize();

		// Generate execution ID
		const executionId = generateUUID();
		const timestamp = Date.now();

		// Create execution record
		const record: ExecutionRecord = {
			id: executionId,
			workflowId,
			workflowName,
			timestamp,
			duration: executionResult.duration,
			success: executionResult.success,
			error: executionResult.error,
			log: executionResult.log,
			metadata,
		};

		// Create execution folder path: {plugin-data}/workflow/{workflow-id}/execution
		const executionFolder = `${this.basePath}/${workflowId}/execution`;
		await this.ensurePluginFolderExists(executionFolder);

		// Create file name: yyyy-mm-dd-{uuid}.json
		const date = new Date(timestamp);
		const dateStr = date.toISOString().split('T')[0]; // yyyy-mm-dd
		const fileName = `${dateStr}-${executionId}.json`;
		const filePath = `${executionFolder}/${fileName}`;

		// Save to file using adapter
		const content = JSON.stringify(record, null, 2);
		try {
			const adapter = this.vault.adapter;
			await adapter.write(filePath, content);
		} catch (error) {
			console.error('Failed to save execution record:', error);
			throw error;
		}

		return executionId;
	}

	/**
	 * Load a specific execution record
	 */
	async loadExecution(workflowId: string, executionId: string): Promise<ExecutionRecord | null> {
		try {
			// Find the file (we need to search since we don't know the date prefix)
			const executionFolder = `${this.basePath}/${workflowId}/execution`;
			const files = await this.listExecutionFiles(workflowId);

			const targetFile = files.find(f => f.endsWith(`${executionId}.json`));
			if (!targetFile) {
				return null;
			}

			const filePath = `${executionFolder}/${targetFile}`;
			const adapter = this.vault.adapter;

			const exists = await adapter.exists(filePath);
			if (!exists) {
				return null;
			}

			const content = await adapter.read(filePath);
			return JSON.parse(content) as ExecutionRecord;
		} catch (error) {
			console.error('Failed to load execution record:', error);
			return null;
		}
	}

	/**
	 * List all executions for a workflow
	 */
	async listExecutions(workflowId: string, limit?: number): Promise<ExecutionRecord[]> {
		try {
			const executionFolder = `${this.basePath}/${workflowId}/execution`;
			const adapter = this.vault.adapter;

			const exists = await adapter.exists(executionFolder);
			if (!exists) {
				return [];
			}

			const files = await this.listExecutionFiles(workflowId);

			// Load execution records first
			const executions: ExecutionRecord[] = [];
			for (const fileName of files) {
				try {
					const filePath = `${executionFolder}/${fileName}`;
					const content = await adapter.read(filePath);
					const record = JSON.parse(content) as ExecutionRecord;
					executions.push(record);
				} catch (error) {
					console.error(`Failed to load execution file ${fileName}:`, error);
				}
			}

			// Sort by timestamp (newest first - descending order)
			executions.sort((a, b) => b.timestamp - a.timestamp);

			// Apply limit if specified
			return limit ? executions.slice(0, limit) : executions;
		} catch (error) {
			console.error('Failed to list executions:', error);
			return [];
		}
	}

	/**
	 * Delete an execution record
	 */
	async deleteExecution(workflowId: string, executionId: string): Promise<boolean> {
		try {
			const executionFolder = `${this.basePath}/${workflowId}/execution`;
			const files = await this.listExecutionFiles(workflowId);

			const targetFile = files.find(f => f.endsWith(`${executionId}.json`));
			if (!targetFile) {
				return false;
			}

			const filePath = `${executionFolder}/${targetFile}`;
			const adapter = this.vault.adapter;

			const exists = await adapter.exists(filePath);
			if (exists) {
				await adapter.remove(filePath);
				return true;
			}
			return false;
		} catch (error) {
			console.error('Failed to delete execution record:', error);
			return false;
		}
	}

	/**
	 * Get execution statistics for a workflow
	 */
	async getExecutionStats(workflowId: string): Promise<{
		totalExecutions: number;
		successCount: number;
		failureCount: number;
		averageDuration: number;
		lastExecution?: ExecutionRecord;
	}> {
		const executions = await this.listExecutions(workflowId);

		if (executions.length === 0) {
			return {
				totalExecutions: 0,
				successCount: 0,
				failureCount: 0,
				averageDuration: 0,
			};
		}

		const successCount = executions.filter(e => e.success).length;
		const failureCount = executions.length - successCount;
		const averageDuration = executions.reduce((sum, e) => sum + e.duration, 0) / executions.length;

		return {
			totalExecutions: executions.length,
			successCount,
			failureCount,
			averageDuration,
			lastExecution: executions[0], // Already sorted by date
		};
	}

	/**
	 * Clean up old execution records
	 */
	async cleanupOldExecutions(workflowId: string, keepLastN: number): Promise<number> {
		try {
			const executionFolder = `${this.basePath}/${workflowId}/execution`;
			const files = await this.listExecutionFiles(workflowId);

			// Sort by date (newest first)
			files.sort((a, b) => b.localeCompare(a));

			// Delete files beyond the keep limit
			const filesToDelete = files.slice(keepLastN);
			let deletedCount = 0;
			const adapter = this.vault.adapter;

			for (const fileName of filesToDelete) {
				try {
					const filePath = `${executionFolder}/${fileName}`;
					const exists = await adapter.exists(filePath);
					if (exists) {
						await adapter.remove(filePath);
						deletedCount++;
					}
				} catch (error) {
					console.error(`Failed to delete execution file ${fileName}:`, error);
				}
			}

			return deletedCount;
		} catch (error) {
			console.error('Failed to cleanup old executions:', error);
			return 0;
		}
	}


	/**
	 * Helper: List execution files for a workflow
	 */
	private async listExecutionFiles(workflowId: string): Promise<string[]> {
		try {
			const executionFolder = `${this.basePath}/${workflowId}/execution`;
			const adapter = this.vault.adapter;

			const exists = await adapter.exists(executionFolder);
			if (!exists) {
				return [];
			}

			// List files in the directory
			const list = await adapter.list(executionFolder);

			// Filter JSON files
			const files: string[] = [];
			for (const filePath of list.files) {
				const fileName = filePath.split('/').pop();
				if (fileName && fileName.endsWith('.json')) {
					files.push(fileName);
				}
			}

			return files;
		} catch (error) {
			console.error('Failed to list execution files:', error);
			return [];
		}
	}
}
