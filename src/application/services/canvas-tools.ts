import { App, TFile } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';
import { createWriteProposal } from './write-proposal-service';
import { createToolDefinition } from '@/application/tools/tool-schema';
import { z } from 'zod';

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface CanvasNode {
	id: string;
	type: 'text' | 'file' | 'link' | 'group';
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	// text node
	text?: string;
	// file node
	file?: string;
	// link node
	url?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: 'top' | 'right' | 'bottom' | 'left';
	toNode: string;
	toSide?: 'top' | 'right' | 'bottom' | 'left';
	color?: string;
	label?: string;
}

export class ReadCanvasTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'read_canvas',
		description: 'Read the contents (nodes and edges) of an Obsidian Canvas file (.canvas)',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the .canvas file',
				required: true
			}
		],
		inputSchema: z.object({ path: z.string().min(1) }),
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const file = this._app.vault.getAbstractFileByPath(path);

			if (!file || !(file instanceof TFile) || file.extension !== 'canvas') {
				return { success: false, error: `Canvas file not found or invalid: ${path}` };
			}

			const content = await this._app.vault.read(file);
			const data = JSON.parse(content) as CanvasData;
			
			return {
				success: true,
				result: data
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
}

export class UpdateCanvasTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'update_canvas',
		description: 'Prepare a proposal to update an Obsidian Canvas file. Can add, move, or remove nodes and edges.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the .canvas file',
				required: true
			},
			{
				name: 'nodes',
				type: 'array',
				description: 'New or updated nodes',
				required: false
			},
			{
				name: 'edges',
				type: 'array',
				description: 'New or updated edges',
				required: false
			}
		],
		inputSchema: z.object({
			path: z.string().min(1),
			nodes: z.array(z.any()).optional(),
			edges: z.array(z.any()).optional(),
		}),
		sideEffects: { vaultWrite: true },
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const newNodes = (args.nodes as CanvasNode[]) || [];
			const newEdges = (args.edges as CanvasEdge[]) || [];
			
			const file = this._app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile) || file.extension !== 'canvas') {
				return { success: false, error: `Canvas file not found: ${path}` };
			}

			const content = await this._app.vault.read(file);
			const data = JSON.parse(content) as CanvasData;

			// Merge nodes
			for (const newNode of newNodes) {
				const index = data.nodes.findIndex(n => n.id === newNode.id);
				if (index !== -1) {
					data.nodes[index] = { ...data.nodes[index], ...newNode };
				} else {
					data.nodes.push(newNode);
				}
			}

			// Merge edges
			for (const newEdge of newEdges) {
				const index = data.edges.findIndex(e => e.id === newEdge.id);
				if (index !== -1) {
					data.edges[index] = { ...data.edges[index], ...newEdge };
				} else {
					data.edges.push(newEdge);
				}
			}

			const proposedContent = JSON.stringify(data, null, '\t');

			return {
				success: true,
				result: createWriteProposal({
					operation: 'update',
					path,
					proposedContent,
					previousContent: content,
					reason: `Update canvas ${path}: added/updated ${newNodes.length} nodes and ${newEdges.length} edges`
				})
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
}
