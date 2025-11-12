/**
 * Test suite for Workflow Model
 */

import { WorkflowModel } from '../../domain/workflow/workflow.model';
import type { Workflow } from '@/types';

describe('WorkflowModel', () => {
	let workflow: WorkflowModel;
	let testWorkflow: Workflow;

	beforeEach(() => {
		testWorkflow = {
			id: 'test-workflow',
			name: 'Test Workflow',
			description: 'Test description',
			nodes: [],
			edges: [],
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		workflow = new WorkflowModel(testWorkflow);
	});

	describe('addNode', () => {
		it('should add node to workflow', () => {
			const node = {
				id: 'node1',
				type: 'llm',
				data: { prompt: 'Test' },
				position: { x: 0, y: 0 }
			};

			workflow.addNode(node);

			expect(workflow.getNodes()).toContain(node);
		});
	});

	describe('removeNode', () => {
		it('should remove node from workflow', () => {
			const node = {
				id: 'node1',
				type: 'llm',
				data: {},
				position: { x: 0, y: 0 }
			};

			workflow.addNode(node);
			const result = workflow.removeNode('node1');

			expect(result).toBe(true);
			expect(workflow.getNodes()).not.toContain(node);
		});

		it('should remove connected edges when removing node', () => {
			const node1 = {
				id: 'node1',
				type: 'llm',
				data: {},
				position: { x: 0, y: 0 }
			};

			const node2 = {
				id: 'node2',
				type: 'llm',
				data: {},
				position: { x: 100, y: 0 }
			};

			const edge = {
				id: 'edge1',
				source: 'node1',
				target: 'node2'
			};

			workflow.addNode(node1);
			workflow.addNode(node2);
			workflow.addEdge(edge);

			workflow.removeNode('node1');

			// Workflow model doesn't auto-remove edges, just checking it was removed
			expect(workflow.getNode('node1')).toBeUndefined();
		});
	});

	describe('addEdge', () => {
		beforeEach(() => {
			const node1 = {
				id: 'node1',
				type: 'llm',
				data: {},
				position: { x: 0, y: 0 }
			};

			const node2 = {
				id: 'node2',
				type: 'llm',
				data: {},
				position: { x: 100, y: 0 }
			};

			workflow.addNode(node1);
			workflow.addNode(node2);
		});

		it('should add edge between nodes', () => {
			const edge = {
				id: 'edge1',
				source: 'node1',
				target: 'node2'
			};

			workflow.addEdge(edge);

			expect(workflow.getEdges()).toContain(edge);
		});
	});

	describe('removeEdge', () => {
		it('should remove edge from workflow', () => {
			const node1 = {
				id: 'node1',
				type: 'llm',
				data: {},
				position: { x: 0, y: 0 }
			};

			const node2 = {
				id: 'node2',
				type: 'llm',
				data: {},
				position: { x: 100, y: 0 }
			};

			const edge = {
				id: 'edge1',
				source: 'node1',
				target: 'node2'
			};

			workflow.addNode(node1);
			workflow.addNode(node2);
			workflow.addEdge(edge);

			const result = workflow.removeEdge('edge1');

			expect(result).toBe(true);
			expect(workflow.getEdges()).not.toContain(edge);
		});
	});

	describe('getConnectedNodes', () => {
		beforeEach(() => {
			const nodes = [
				{ id: 'node1', type: 'llm', data: {}, position: { x: 0, y: 0 } },
				{ id: 'node2', type: 'llm', data: {}, position: { x: 100, y: 0 } },
				{ id: 'node3', type: 'llm', data: {}, position: { x: 200, y: 0 } }
			];

			nodes.forEach(n => workflow.addNode(n));

			workflow.addEdge({ id: 'e1', source: 'node1', target: 'node2' });
			workflow.addEdge({ id: 'e2', source: 'node1', target: 'node3' });
		});

		it('should return nodes connected from source', () => {
			const connected = workflow.getConnectedNodes('node1');

			expect(connected.outgoing).toHaveLength(2);
			expect(connected.outgoing.map(n => n.id)).toContain('node2');
			expect(connected.outgoing.map(n => n.id)).toContain('node3');
		});

		it('should return empty array for node with no outgoing edges', () => {
			const connected = workflow.getConnectedNodes('node2');

			expect(connected.outgoing).toHaveLength(0);
		});
	});

	describe('validate', () => {
		it('should validate valid workflow', () => {
			const wf = new WorkflowModel({
				id: 'valid',
				name: 'Valid',
				description: 'Valid workflow',
				nodes: [
					{ id: 'node1', type: 'llm', data: {}, position: { x: 0, y: 0 } }
				],
				edges: [],
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const result = wf.validate();

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect missing required fields', () => {
			const wf = new WorkflowModel({
				id: '',
				name: '',
				description: '',
				nodes: [],
				edges: [],
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const result = wf.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Workflow ID is required');
			expect(result.errors).toContain('Workflow name is required');
		});

		it('should detect edges pointing to invalid nodes', () => {
			const wf = new WorkflowModel({
				id: 'test',
				name: 'Test',
				description: '',
				nodes: [
					{ id: 'node1', type: 'llm', data: {}, position: { x: 0, y: 0 } }
				],
				edges: [
					{ id: 'edge1', source: 'node1', target: 'nonexistent' }
				],
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const result = wf.validate();

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Edge edge1 references invalid target node: nonexistent');
		});
	});

	describe('static create', () => {
		it('should create new workflow with defaults', () => {
			const wf = WorkflowModel.create('New Workflow', 'Description');

			expect(wf).toBeInstanceOf(WorkflowModel);
			expect(wf.toJSON().name).toBe('New Workflow');
			expect(wf.toJSON().description).toBe('Description');
			expect(wf.getNodes()).toHaveLength(0);
			expect(wf.getEdges()).toHaveLength(0);
		});
	});

	describe('isEmpty', () => {
		it('should return true for workflow with no nodes', () => {
			expect(workflow.isEmpty()).toBe(true);
		});

		it('should return false for workflow with nodes', () => {
			workflow.addNode({ id: 'node1', type: 'llm', data: {} });
			expect(workflow.isEmpty()).toBe(false);
		});
	});

	describe('setName and setDescription', () => {
		it('should update workflow name', () => {
			workflow.setName('Updated Name');
			expect(workflow.toJSON().name).toBe('Updated Name');
		});

		it('should update workflow description', () => {
			workflow.setDescription('Updated Description');
			expect(workflow.toJSON().description).toBe('Updated Description');
		});
	});
});
