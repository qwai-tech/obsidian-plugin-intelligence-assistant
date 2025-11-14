/**
 * Workflow Domain Model
 * Encapsulates workflow business logic
 */

import type { Workflow } from '@/types';

export class WorkflowModel {
	constructor(private readonly _data: Workflow) {}

	/**
	 * Add a node to the workflow
	 */
	addNode(node: Record<string, unknown> & { id: string }): void {
		this._data.nodes.push(node);
		this._data.updatedAt = Date.now();
	}

	/**
	 * Remove a node from the workflow
	 */
	removeNode(nodeId: string): boolean {
		const index = this._data.nodes.findIndex(n => n.id === nodeId);
		if (index === -1) return false;

		this._data.nodes.splice(index, 1);
		this._data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Get node by ID
	 */
	getNode(nodeId: string): (Record<string, unknown> & { id: string }) | undefined {
		return this._data.nodes.find(n => n.id === nodeId);
	}

	/**
	 * Update a node
	 */
	updateNode(nodeId: string, updates: Record<string, unknown>): boolean {
		const node = this.getNode(nodeId);
		if (!node) return false;

		Object.assign(node, updates);
		this._data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Add an edge to the workflow
	 */
	addEdge(edge: Record<string, unknown> & { id: string; source: string; target: string }): void {
		this._data.edges.push(edge);
		this._data.updatedAt = Date.now();
	}

	/**
	 * Remove an edge from the workflow
	 */
	removeEdge(edgeId: string): boolean {
		const index = this._data.edges.findIndex(e => e.id === edgeId);
		if (index === -1) return false;

		this._data.edges.splice(index, 1);
		this._data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Get edge by ID
	 */
	getEdge(edgeId: string): (Record<string, unknown> & { id: string; source: string; target: string }) | undefined {
		return this._data.edges.find(e => e.id === edgeId);
	}

	/**
	 * Get all nodes
	 */
	getNodes(): (Record<string, unknown> & { id: string })[] {
		return [...this._data.nodes];
	}

	/**
	 * Get all edges
	 */
	getEdges(): (Record<string, unknown> & { id: string; source: string; target: string })[] {
		return [...this._data.edges];
	}

	/**
	 * Get node count
	 */
	getNodeCount(): number {
		return this._data.nodes.length;
	}

	/**
	 * Get edge count
	 */
	getEdgeCount(): number {
		return this._data.edges.length;
	}

	/**
	 * Check if workflow is empty
	 */
	isEmpty(): boolean {
		return this._data.nodes.length === 0;
	}

	/**
	 * Get incoming edges for a node
	 */
	getIncomingEdges(nodeId: string): (Record<string, unknown> & { id: string; source: string; target: string })[] {
		return this._data.edges.filter(e => e.target === nodeId);
	}

	/**
	 * Get outgoing edges for a node
	 */
	getOutgoingEdges(nodeId: string): (Record<string, unknown> & { id: string; source: string; target: string })[] {
		return this._data.edges.filter(e => e.source === nodeId);
	}

	/**
	 * Get connected nodes for a node
	 */
	getConnectedNodes(nodeId: string): {
		incoming: (Record<string, unknown> & { id: string })[];
		outgoing: (Record<string, unknown> & { id: string })[];
	} {
		const incomingEdges = this.getIncomingEdges(nodeId);
		const outgoingEdges = this.getOutgoingEdges(nodeId);

		return {
			incoming: incomingEdges
				.map(e => this.getNode(e.source))
				.filter((node): node is Record<string, unknown> & { id: string } => node !== undefined),
			outgoing: outgoingEdges
				.map(e => this.getNode(e.target))
				.filter((node): node is Record<string, unknown> & { id: string } => node !== undefined)
		};
	}

	/**
	 * Set workflow name
	 */
	setName(name: string): void {
		this._data.name = name;
		this._data.updatedAt = Date.now();
	}

	/**
	 * Set workflow description
	 */
	setDescription(description: string): void {
		this._data.description = description;
		this._data.updatedAt = Date.now();
	}

	/**
	 * Clear all nodes and edges
	 */
	clear(): void {
		this._data.nodes = [];
		this._data.edges = [];
		this._data.updatedAt = Date.now();
	}

	/**
	 * Get workflow age in milliseconds
	 */
	getAge(): number {
		return Date.now() - this._data.createdAt;
	}

	/**
	 * Get time since last update in milliseconds
	 */
	getTimeSinceLastUpdate(): number {
		return Date.now() - this._data.updatedAt;
	}

	/**
	 * Validate workflow
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this._data.id || this._data.id.trim() === '') {
			errors.push('Workflow ID is required');
		}

		if (!this._data.name || this._data.name.trim() === '') {
			errors.push('Workflow name is required');
		}

		if (!this._data.createdAt || this._data.createdAt <= 0) {
			errors.push('Invalid creation timestamp');
		}

		if (!this._data.updatedAt || this._data.updatedAt <= 0) {
			errors.push('Invalid update timestamp');
		}

		// Validate edges point to valid nodes
		for (const edge of this._data.edges) {
			const edgeId = String(edge.id ?? 'unknown');
			const edgeSource = String(edge.source ?? 'unknown');
			const edgeTarget = String(edge.target ?? 'unknown');

			if (!this.getNode(edgeSource)) {
				errors.push(`Edge ${edgeId} references invalid source node: ${edgeSource}`);
			}
			if (!this.getNode(edgeTarget)) {
				errors.push(`Edge ${edgeId} references invalid target node: ${edgeTarget}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Clone workflow
	 */
	clone(): WorkflowModel {
		return new WorkflowModel(JSON.parse(JSON.stringify(this._data)) as Workflow);
	}

	/**
	 * Export to plain object
	 */
	toJSON(): Workflow {
		return { ...this._data };
	}

	/**
	 * Get raw data
	 */
	getData(): Workflow {
		return this._data;
	}

	/**
	 * Create from plain object
	 */
	static fromJSON(data: Workflow): WorkflowModel {
		return new WorkflowModel(data);
	}

	/**
	 * Create a new workflow
	 */
	static create(name: string, description?: string): WorkflowModel {
		const workflow: Workflow = {
			id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
			name,
			description,
			nodes: [],
			edges: [],
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		return new WorkflowModel(workflow);
	}
}
