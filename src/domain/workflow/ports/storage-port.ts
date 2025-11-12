/**
 * Storage Port
 * Interface for workflow storage operations
 */

import type { Workflow } from '@/types';

export interface IStoragePort {
	/**
	 * Save a workflow
	 */
	save(workflow: Workflow): Promise<void>;

	/**
	 * Load a workflow by ID
	 */
	load(id: string): Promise<Workflow | null>;

	/**
	 * Load all workflows
	 */
	loadAll(): Promise<Workflow[]>;

	/**
	 * Delete a workflow
	 */
	delete(id: string): Promise<void>;

	/**
	 * Check if workflow exists
	 */
	exists(id: string): Promise<boolean>;
}
