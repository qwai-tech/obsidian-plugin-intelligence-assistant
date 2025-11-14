/**
 * Storage Port
 * Interface for workflow storage operations
 */

import type { Workflow } from '@/types';

export interface IStoragePort {
	/**
	 * Save a workflow
	 */
	save(_workflow: Workflow): Promise<void>;

	/**
	 * Load a workflow by ID
	 */
	load(_id: string): Promise<Workflow | null>;

	/**
	 * Load all workflows
	 */
	loadAll(): Promise<Workflow[]>;

	/**
	 * Delete a workflow
	 */
	delete(_id: string): Promise<void>;

	/**
	 * Check if workflow exists
	 */
	exists(_id: string): Promise<boolean>;
}
