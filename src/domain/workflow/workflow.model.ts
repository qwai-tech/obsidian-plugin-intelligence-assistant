/**
 * Workflow Domain Model
 * Encapsulates workflow business logic
 */

import type { Workflow } from '@/types';

export class WorkflowModel {
	constructor(private data: Workflow) {}

	/**
	 * Add a node to the workflow
	 */
	addNode(node: any): void {
		this.data.nodes.push(node);
		this.data.updatedAt = Date.now();
	}

	/**
	 * Remove a node from the workflow
	 */
	removeNode(nodeId: string): boolean {
		const index = this.data.nodes.findIndex(n => n.id === nodeId);
		if (index === -1) return false;

		this.data.nodes.splice(index, 1);
		this.data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Get node by ID
	 */
	getNode(nodeId: string): any | undefined {
		return this.data.nodes.find(n => n.id === nodeId);
	}

	/**
	 * Update a node
	 */
	updateNode(nodeId: string, updates: any): boolean {
		const node = this.getNode(nodeId);
		if (!node) return false;

		Object.assign(node, updates);
		this.data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Add an edge to the workflow
	 */
	addEdge(edge: any): void {
		this.data.edges.push(edge);
		this.data.updatedAt = Date.now();
	}

	/**
	 * Remove an edge from the workflow
	 */
	removeEdge(edgeId: string): boolean {
		const index = this.data.edges.findIndex(e => e.id === edgeId);
		if (index === -1) return false;

		this.data.edges.splice(index, 1);
		this.data.updatedAt = Date.now();
		return true;
	}

	/**
	 * Get edge by ID
	 */
	getEdge(edgeId: string): any | undefined {
		return this.data.edges.find(e => e.id === edgeId);
	}

	/**
	 * Get all nodes
	 */
	getNodes(): any[] {
		return [...this.data.nodes];
	}

	/**
	 * Get all edges
	 */
	getEdges(): any[] {
		return [...this.data.edges];
	}

	/**
	 * Get node count
	 */
	getNodeCount(): number {
		return this.data.nodes.length;
	}

	/**
	 * Get edge count
	 */
	getEdgeCount(): number {
		return this.data.edges.length;
	}

	/**
	 * Check if workflow is empty
	 */
	isEmpty(): boolean {
		return this.data.nodes.length === 0;
	}

	/**
	 * Get incoming edges for a node
	 */
	getIncomingEdges(nodeId: string): any[] {
		return this.data.edges.filter(e => e.target === nodeId);
	}

	/**
	 * Get outgoing edges for a node
	 */
	getOutgoingEdges(nodeId: string): any[] {
		return this.data.edges.filter(e => e.source === nodeId);
	}

	/**
	 * Get connected nodes for a node
	 */
	getConnectedNodes(nodeId: string): {
		incoming: any[];
		outgoing: any[];
	} {
		const incomingEdges = this.getIncomingEdges(nodeId);
		const outgoingEdges = this.getOutgoingEdges(nodeId);

		return {
			incoming: incomingEdges
				.map(e => this.getNode(e.source))
				.filter(Boolean),
			outgoing: outgoingEdges
				.map(e => this.getNode(e.target))
				.filter(Boolean)
		};
	}

	/**
	 * Set workflow name
	 */
	setName(name: string): void {
		this.data.name = name;
		this.data.updatedAt = Date.now();
	}

	/**
	 * Set workflow description
	 */
	setDescription(description: string): void {
		this.data.description = description;
		this.data.updatedAt = Date.now();
	}

	/**
	 * Clear all nodes and edges
	 */
	clear(): void {
		this.data.nodes = [];
		this.data.edges = [];
		this.data.updatedAt = Date.now();
	}

	/**
	 * Get workflow age in milliseconds
	 */
	getAge(): number {
		return Date.now() - this.data.createdAt;
	}

	/**
	 * Get time since last update in milliseconds
	 */
	getTimeSinceLastUpdate(): number {
		return Date.now() - this.data.updatedAt;
	}

	/**
	 * Validate workflow
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this.data.id || this.data.id.trim() === '') {
			errors.push('Workflow ID is required');
		}

		if (!this.data.name || this.data.name.trim() === '') {
			errors.push('Workflow name is required');
		}

		if (!this.data.createdAt || this.data.createdAt <= 0) {
			errors.push('Invalid creation timestamp');
		}

		if (!this.data.updatedAt || this.data.updatedAt <= 0) {
			errors.push('Invalid update timestamp');
		}

		// Validate edges point to valid nodes
		for (const edge of this.data.edges) {
			if (!this.getNode(edge.source)) {
				errors.push(`Edge ${edge.id} references invalid source node: ${edge.source}`);
			}
			if (!this.getNode(edge.target)) {
				errors.push(`Edge ${edge.id} references invalid target node: ${edge.target}`);
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
		return new WorkflowModel(JSON.parse(JSON.stringify(this.data)));
	}

	/**
	 * Export to plain object
	 */
	toJSON(): Workflow {
		return { ...this.data };
	}

	/**
	 * Get raw data
	 */
	getData(): Workflow {
		return this.data;
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
			id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
