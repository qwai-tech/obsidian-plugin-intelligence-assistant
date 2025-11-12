/**
 * Workflow System V2 - Workflow Core Class
 *
 * Manages workflow structure, validation, and graph operations.
 * Simplified implementation focusing on essential functionality.
 */

import { Workflow, WorkflowNode, Connection } from './types';

/**
 * Workflow class - represents and manages a workflow
 */
export class WorkflowGraph {
	/** Workflow data */
	private data: Workflow;
	/** Node map for fast lookup */
	private nodeMap: Map<string, WorkflowNode>;

	constructor(workflow: Workflow) {
		this.data = { ...workflow };
		this.nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
	}

	/**
	 * Get workflow data
	 */
	getData(): Workflow {
		return { ...this.data };
	}

	/**
	 * Get all nodes
	 */
	getNodes(): WorkflowNode[] {
		return Array.from(this.nodeMap.values());
	}

	/**
	 * Get node by ID
	 */
	getNode(id: string): WorkflowNode | undefined {
		return this.nodeMap.get(id);
	}

	/**
	 * Get all connections
	 */
	getConnections(): Connection[] {
		return [...this.data.connections];
	}

	/**
	 * Add a node
	 */
	addNode(node: WorkflowNode): void {
		this.nodeMap.set(node.id, node);
		this.data.nodes = Array.from(this.nodeMap.values());
		this.data.updated = Date.now();
	}

	/**
	 * Remove a node and its connections
	 */
	removeNode(nodeId: string): void {
		this.nodeMap.delete(nodeId);
		this.data.nodes = Array.from(this.nodeMap.values());
		this.data.connections = this.data.connections.filter(
			c => c.from !== nodeId && c.to !== nodeId
		);
		this.data.updated = Date.now();
	}

	/**
	 * Update a node
	 */
	updateNode(nodeId: string, updates: Partial<WorkflowNode>): void {
		const node = this.nodeMap.get(nodeId);
		if (node) {
			Object.assign(node, updates);
			this.data.updated = Date.now();
		}
	}

	/**
	 * Add a connection
	 */
	addConnection(connection: Connection): void {
		// Check if connection already exists
		const exists = this.data.connections.some(
			c => c.from === connection.from && c.to === connection.to
		);
		if (!exists) {
			this.data.connections.push(connection);
			this.data.updated = Date.now();
		}
	}

	/**
	 * Remove a connection
	 */
	removeConnection(connection: Connection): void {
		this.data.connections = this.data.connections.filter(
			c => !(c.from === connection.from && c.to === connection.to)
		);
		this.data.updated = Date.now();
	}

	/**
	 * Get start nodes (nodes with no incoming connections)
	 */
	getStartNodes(): WorkflowNode[] {
		const hasIncoming = new Set(this.data.connections.map(c => c.to));
		return this.getNodes().filter(n => !hasIncoming.has(n.id));
	}

	/**
	 * Get nodes connected from a node (outgoing)
	 */
	getNextNodes(nodeId: string): WorkflowNode[] {
		return this.data.connections
			.filter(c => c.from === nodeId)
			.map(c => this.nodeMap.get(c.to))
			.filter((n): n is WorkflowNode => n !== undefined);
	}

	/**
	 * Get nodes connected to a node (incoming)
	 */
	getPreviousNodes(nodeId: string): WorkflowNode[] {
		return this.data.connections
			.filter(c => c.to === nodeId)
			.map(c => this.nodeMap.get(c.from))
			.filter((n): n is WorkflowNode => n !== undefined);
	}

	/**
	 * Get execution order using topological sort
	 * Returns null if there's a cycle
	 */
	getExecutionOrder(): string[] | null {
		const sorted: string[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (nodeId: string): boolean => {
			if (visited.has(nodeId)) return true;
			if (visiting.has(nodeId)) return false; // Cycle detected

			visiting.add(nodeId);

			// Visit all prerequisites first
			for (const conn of this.data.connections) {
				if (conn.to === nodeId) {
					if (!visit(conn.from)) return false;
				}
			}

			visiting.delete(nodeId);
			visited.add(nodeId);
			sorted.push(nodeId);

			return true;
		};

		// Visit all nodes
		for (const [nodeId] of this.nodeMap) {
			if (!visited.has(nodeId)) {
				if (!visit(nodeId)) return null; // Cycle detected
			}
		}

		return sorted;
	}

	/**
	 * Validate workflow structure
	 * Returns array of error messages (empty if valid)
	 */
	validate(): string[] {
		const errors: string[] = [];

		// Check for nodes
		if (this.nodeMap.size === 0) {
			errors.push('工作流必须至少包含一个节点');
			return errors;
		}

		// Check for start nodes
		const startNodes = this.getStartNodes();
		if (startNodes.length === 0) {
			errors.push('工作流必须至少包含一个起始节点（无输入连接的节点）');
		}

		// Check connection validity
		for (const conn of this.data.connections) {
			if (!this.nodeMap.has(conn.from)) {
				errors.push(`连接源节点不存在: ${conn.from}`);
			}
			if (!this.nodeMap.has(conn.to)) {
				errors.push(`连接目标节点不存在: ${conn.to}`);
			}
		}

		// Check for cycles
		const order = this.getExecutionOrder();
		if (order === null) {
			errors.push('工作流包含循环依赖，无法执行');
		}

		// Check for disconnected nodes (except start nodes)
		for (const [nodeId] of this.nodeMap) {
			const hasIncoming = this.data.connections.some(c => c.to === nodeId);
			const hasOutgoing = this.data.connections.some(c => c.from === nodeId);

			if (!hasIncoming && !hasOutgoing && this.nodeMap.size > 1) {
				const node = this.nodeMap.get(nodeId)!;
				errors.push(`节点 "${node.name}" 未连接到任何其他节点`);
			}
		}

		return errors;
	}

	/**
	 * Check if workflow can be executed
	 */
	canExecute(): boolean {
		return this.validate().length === 0;
	}

	/**
	 * Get workflow statistics
	 */
	getStats() {
		return {
			nodeCount: this.nodeMap.size,
			connectionCount: this.data.connections.length,
			startNodeCount: this.getStartNodes().length,
			maxDepth: this.getMaxDepth(),
		};
	}

	/**
	 * Get maximum depth of workflow (longest path)
	 */
	private getMaxDepth(): number {
		let maxDepth = 0;
		const visited = new Set<string>();

		const dfs = (nodeId: string, depth: number): void => {
			if (visited.has(nodeId)) return;
			visited.add(nodeId);

			maxDepth = Math.max(maxDepth, depth);

			for (const next of this.getNextNodes(nodeId)) {
				dfs(next.id, depth + 1);
			}
		};

		for (const start of this.getStartNodes()) {
			dfs(start.id, 0);
		}

		return maxDepth;
	}

	/**
	 * Clone workflow
	 */
	clone(): WorkflowGraph {
		return new WorkflowGraph(JSON.parse(JSON.stringify(this.data)));
	}

	/**
	 * Export to JSON
	 */
	toJSON(): Workflow {
		return {
			...this.data,
			nodes: Array.from(this.nodeMap.values()),
		};
	}

	/**
	 * Create from JSON
	 */
	static fromJSON(data: Workflow): WorkflowGraph {
		return new WorkflowGraph(data);
	}

	/**
	 * Create a new empty workflow
	 */
	static create(name: string): WorkflowGraph {
		return new WorkflowGraph({
			id: `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
			name,
			nodes: [],
			connections: [],
			created: Date.now(),
			updated: Date.now(),
		});
	}
}
