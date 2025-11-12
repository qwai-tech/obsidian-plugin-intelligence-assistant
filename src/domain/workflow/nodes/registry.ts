/**
 * Workflow System V2 - Node Registry
 *
 * Central registry for all node types.
 * Manages node definitions and provides lookup functionality.
 */

import { NodeDef, NodeCategory } from '../core/types';

/**
 * Node registry - manages all node definitions
 */
export class NodeRegistry {
	private nodes = new Map<string, NodeDef>();

	/**
	 * Register a node definition
	 */
	register(def: NodeDef): void {
		if (this.nodes.has(def.type)) {
			// Check if it's the same definition to avoid unnecessary warnings during hot reload
			const existing = this.nodes.get(def.type);
			if (JSON.stringify(existing) === JSON.stringify(def)) {
				// Same definition, skip registration silently (hot reload case)
				return;
			}
			console.warn(`Node type "${def.type}" is already registered with different definition, overwriting`);
		}
		this.nodes.set(def.type, def);
	}

	/**
	 * Register multiple node definitions
	 */
	registerAll(defs: NodeDef[]): void {
		for (const def of defs) {
			this.register(def);
		}
	}

	/**
	 * Get a node definition by type
	 */
	get(type: string): NodeDef | undefined {
		return this.nodes.get(type);
	}

	/**
	 * Get all registered node definitions
	 */
	getAll(): NodeDef[] {
		return Array.from(this.nodes.values());
	}

	/**
	 * Get nodes by category
	 */
	getByCategory(category: NodeCategory): NodeDef[] {
		return this.getAll().filter(n => n.category === category);
	}

	/**
	 * Check if a node type exists
	 */
	has(type: string): boolean {
		return this.nodes.has(type);
	}

	/**
	 * Get all categories
	 */
	getCategories(): NodeCategory[] {
		const categories = new Set<NodeCategory>();
		for (const node of this.nodes.values()) {
			categories.add(node.category);
		}
		return Array.from(categories);
	}

	/**
	 * Search nodes by name or description
	 */
	search(query: string): NodeDef[] {
		const lowerQuery = query.toLowerCase();
		return this.getAll().filter(node =>
			node.name.toLowerCase().includes(lowerQuery) ||
			node.description.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Get statistics
	 */
	getStats() {
		const stats: Record<NodeCategory, number> = {
			trigger: 0,
			ai: 0,
			data: 0,
			logic: 0,
			tools: 0,
			memory: 0,
		};

		for (const node of this.nodes.values()) {
			stats[node.category]++;
		}

		return {
			total: this.nodes.size,
			byCategory: stats,
		};
	}

	/**
	 * Clear all registrations
	 */
	clear(): void {
		this.nodes.clear();
	}
}

/**
 * Global node registry instance
 */
export const nodeRegistry = new NodeRegistry();
