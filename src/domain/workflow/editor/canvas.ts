/**
 * Workflow System V2 - Canvas Renderer
 *
 * High-performance canvas renderer with differential rendering,
 * virtualization, and smart update mechanisms for large workflows.
 */

import {
	WorkflowNode,
	Connection,
	NodeExecutionState,
	CanvasState,
	WorkflowEvents
} from '../core/types';
import { EventEmitter } from './event-emitter';
import { WorkflowGraph } from '../core/workflow';
import { NodeRegistry } from '../nodes/registry';
import { ErrorHandler } from '../services/error-handler';
import { extractVariables } from '../core/variable-resolver';

// ============================================================================
// CONSTANTS
// ============================================================================

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const NODE_RADIUS = 8;
const GRID_SIZE = 20;
const HANDLE_RADIUS = 6;
const VIEWPORT_BUFFER = 200; // Extra pixels around viewport for rendering

// ============================================================================
// TYPES
// ============================================================================

interface RenderCache {
	nodes: Map<string, CachedNode>;
	connections: Map<string, CachedConnection>;
	grid: CachedGrid | null;
}

interface CachedNode {
	x: number;
	y: number;
	width: number;
	height: number;
	hash: string;
	lastRenderTime: number;
}

interface CachedConnection {
	fromNodeId: string;
	toNodeId: string;
	path: Path2D;
	boundingBox: { x: number; y: number; width: number; height: number };
	hash: string;
	lastRenderTime: number;
}

interface CachedGrid {
	offsetX: number;
	offsetY: number;
	scale: number;
	pattern: CanvasPattern | null;
	lastRenderTime: number;
	hash?: string;
}

interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

// ============================================================================
// CANVAS RENDERER
// ============================================================================

export class WorkflowCanvas {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private workflow: WorkflowGraph;
	private nodeRegistry: NodeRegistry;
	
	// State
	private state: CanvasState = {
		offset: { x: 0, y: 0 },
		scale: 1,
		selectedNodeId: null,
		draggingNodeId: null,
		creatingConnection: null,
	};

	// Track selected connection
	private selectedConnectionId: string | null = null;
	
	// Execution states
	private executionStates = new Map<string, NodeExecutionState>();

	// Cached bounds for execution info panels near each node
	private executionInfoAreas = new Map<string, { x: number; y: number; width: number; height: number }>();

	// Cached bounds for "More details" buttons (clickable areas)
	private moreDetailsButtons = new Map<string, { x: number; y: number; width: number; height: number }>();

	// Rendering
	private renderCache: RenderCache = {
		nodes: new Map(),
		connections: new Map(),
		grid: null,
	};
	private viewport: Viewport = { x: 0, y: 0, width: 0, height: 0 };
	private needsFullRedraw = false;
	private redrawScheduled = false;
	private lastRenderTime = 0;
	private animationFrame: number | null = null;
	
	// Events
	private events = new EventEmitter<WorkflowEvents>();
	
	// Interaction
	private isDragging = false;
	private isPanning = false;
	private dragStart = { x: 0, y: 0 };
	private nodeOffset = { x: 0, y: 0 };

	// Cached event handlers to properly remove them
	private mouseDownHandler: (_event: MouseEvent) => void;
	private mouseMoveHandler: (_event: MouseEvent) => void;
	private mouseUpHandler: (_event: MouseEvent) => void;
	private wheelHandler: (_event: WheelEvent) => void;
	private doubleClickHandler: (_event: MouseEvent) => void;
	private contextMenuHandler: (_event: MouseEvent) => void;
	private dragOverHandler: (_event: DragEvent) => void;
	private dropHandler: (_event: DragEvent) => void;
	private keyDownHandler: (_event: KeyboardEvent) => void;
	private resizeHandler: () => void;

	// ResizeObserver to handle container size changes
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		workflow: WorkflowGraph,
		nodeRegistry: NodeRegistry
	) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		this.workflow = workflow;
		this.nodeRegistry = nodeRegistry;

		// Initialize event handlers before setup
		this.initializeEventHandlers();

		this.setupCanvas();
		this.setupEventListeners();
		this.startRenderLoop();
	}

	/**
	 * Draw rounded rectangle with fallback for browsers without roundRect support
	 */
	private drawRoundRect(x: number, y: number, width: number, height: number, radius: number): void {
		if (this.ctx.roundRect) {
			this.ctx.roundRect(x, y, width, height, radius);
		} else {
			// Fallback for browsers without roundRect
			this.ctx.moveTo(x + radius, y);
			this.ctx.lineTo(x + width - radius, y);
			this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
			this.ctx.lineTo(x + width, y + height - radius);
			this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
			this.ctx.lineTo(x + radius, y + height);
			this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
			this.ctx.lineTo(x, y + radius);
			this.ctx.quadraticCurveTo(x, y, x + radius, y);
			this.ctx.closePath();
		}
	}

	// ============================================================================
	// SETUP METHODS
	// ============================================================================

	/**
	 * Initialize event handlers to maintain consistent function references
	 */
	private initializeEventHandlers(): void {
		this.mouseDownHandler = this.onMouseDown.bind(this) as (_event: MouseEvent) => void;
		this.mouseMoveHandler = this.onMouseMove.bind(this) as (_event: MouseEvent) => void;
		this.mouseUpHandler = this.onMouseUp.bind(this) as (_event: MouseEvent) => void;
		this.wheelHandler = this.onWheel.bind(this) as (_event: WheelEvent) => void;
		this.doubleClickHandler = this.onDoubleClick.bind(this) as (_event: MouseEvent) => void;
		this.contextMenuHandler = this.onContextMenu.bind(this) as (_event: MouseEvent) => void;
		this.dragOverHandler = this.onDragOver.bind(this) as (_event: DragEvent) => void;
		this.dropHandler = this.onDrop.bind(this) as (_event: DragEvent) => void;
		this.keyDownHandler = this.onKeyDown.bind(this) as (_event: KeyboardEvent) => void;
	}
	
	/**
	 * Setup canvas size and DPI
	 */
	private setupCanvas(): void {
		this.resizeHandler = () => {
			if (!this.canvas.parentElement) return;

			const rect = this.canvas.parentElement.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;

		this.canvas.width = rect.width * dpr;
		this.canvas.height = rect.height * dpr;
		this.canvas.setCssProps({ width: `${rect.width}px` });
		this.canvas.setCssProps({ height: `${rect.height}px` });

			// Reset context transform after resize
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.scale(dpr, dpr);

			// Update viewport
			this.viewport = {
				x: -this.state.offset.x / this.state.scale - VIEWPORT_BUFFER,
				y: -this.state.offset.y / this.state.scale - VIEWPORT_BUFFER,
				width: rect.width / this.state.scale + VIEWPORT_BUFFER * 2,
				height: rect.height / this.state.scale + VIEWPORT_BUFFER * 2,
			};

			this.needsFullRedraw = true;
		};

		// Initial resize
		this.resizeHandler();

		// Listen to window resize events
		window.addEventListener('resize', this.resizeHandler);

		// Use ResizeObserver to handle container size changes
		// This is more reliable for detecting size changes in Obsidian views
		if (this.canvas.parentElement && typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => {
				this.resizeHandler();
			});
			// Observe both the direct parent and higher level containers
			this.resizeObserver.observe(this.canvas.parentElement);

			// Also observe higher level containers for better resize detection
			let parent = this.canvas.parentElement.parentElement;
			while (parent && parent.classList) {
				this.resizeObserver.observe(parent);
				// Stop at workflow editor container
				if (parent.classList.contains('workflow-v2-editor') ||
				    parent.classList.contains('workflow-editor-v2-container')) {
					break;
				}
				parent = parent.parentElement;
			}
		}

		// Force an additional resize after a short delay to ensure proper initialization
		setTimeout(() => {
			this.resizeHandler();
		}, 100);
	}
	
	/**
	 * Setup event listeners
	 */
	private setupEventListeners(): void {
		// Mouse events
		this.canvas.addEventListener('mousedown', this.mouseDownHandler);
		this.canvas.addEventListener('mousemove', this.mouseMoveHandler);
		this.canvas.addEventListener('mouseup', this.mouseUpHandler);
		this.canvas.addEventListener('wheel', this.wheelHandler);
		this.canvas.addEventListener('dblclick', this.doubleClickHandler);

		// Context menu
		this.canvas.addEventListener('contextmenu', this.contextMenuHandler);

		// Drag and drop
		this.canvas.addEventListener('dragover', this.dragOverHandler);
		this.canvas.addEventListener('drop', this.dropHandler);

		// Keyboard events
		document.addEventListener('keydown', this.keyDownHandler);
	}
	
	// ============================================================================
	// RENDERING METHODS
	// ============================================================================
	
	/**
	 * Start render loop with frame rate limiting
	 */
	private startRenderLoop(): void {
		const render = (time: number) => {
			// Throttle to 60 FPS (16.67ms per frame)
			if (time - this.lastRenderTime > 16 || this.needsFullRedraw) {
				try {
					this.render();
					this.lastRenderTime = time;
					this.needsFullRedraw = false;
				} catch (error: unknown) {
					const normalizedError = error instanceof Error ? error : new Error(String(error));
					ErrorHandler.logError(ErrorHandler.fromError(normalizedError));
				}
			}
			this.animationFrame = requestAnimationFrame(render);
		};
		this.animationFrame = requestAnimationFrame(render);
	}
	
	/**
	 * Schedule a redraw
	 */
	scheduleRedraw(): void {
		if (!this.redrawScheduled) {
			this.redrawScheduled = true;
			requestAnimationFrame(() => {
				this.redrawScheduled = false;
				this.needsFullRedraw = true;
			});
		}
	}
	
	/**
	 * Render everything with optimization
	 */
	public render(): void {
		const width = this.canvas.width / (window.devicePixelRatio || 1);
		const height = this.canvas.height / (window.devicePixelRatio || 1);
		
		// Clear with background color
		this.ctx.fillStyle = '#0f0f0f';
		this.ctx.fillRect(0, 0, width, height);
		
		// Apply transform
		this.ctx.save();
		this.ctx.translate(this.state.offset.x, this.state.offset.y);
		this.ctx.scale(this.state.scale, this.state.scale);
		
		// Update viewport bounds
		this.updateViewportBounds(width, height);
		
		// Draw grid if needed
		this.drawGridOptimized(width, height);
		
		// Draw connections
		for (const conn of this.workflow.getConnections()) {
			if (this.isConnectionInView(conn)) {
				this.drawConnectionOptimized(conn);
			}
		}
		
		// Draw connection being created
		if (this.state.creatingConnection) {
			this.drawTempConnection();
		}
		
		// Draw nodes
		for (const node of this.workflow.getNodes()) {
			if (this.isNodeInView(node)) {
				this.drawNodeOptimized(node);
			}
		}
		
		this.ctx.restore();
		
		// Draw UI overlay
		this.drawOverlay(width, height);
	}
	
	/**
	 * Update viewport bounds for culling
	 */
	private updateViewportBounds(width: number, height: number): void {
		this.viewport = {
			x: (-this.state.offset.x / this.state.scale) - VIEWPORT_BUFFER,
			y: (-this.state.offset.y / this.state.scale) - VIEWPORT_BUFFER,
			width: (width / this.state.scale) + VIEWPORT_BUFFER * 2,
			height: (height / this.state.scale) + VIEWPORT_BUFFER * 2,
		};
	}
	
	/**
	 * Check if node is in current viewport
	 */
	private isNodeInView(node: WorkflowNode): boolean {
		return (
			node.x + NODE_WIDTH >= this.viewport.x &&
			node.x <= this.viewport.x + this.viewport.width &&
			node.y + NODE_HEIGHT >= this.viewport.y &&
			node.y <= this.viewport.y + this.viewport.height
		);
	}
	
	/**
	 * Check if connection is in current viewport
	 */
	private isConnectionInView(conn: Connection): boolean {
		const fromNode = this.workflow.getNode(conn.from);
		const toNode = this.workflow.getNode(conn.to);
		
		if (!fromNode || !toNode) return false;
		
		// Simple bounding box check
		const minX = Math.min(fromNode.x, toNode.x);
		const maxX = Math.max(fromNode.x + NODE_WIDTH, toNode.x + NODE_WIDTH);
		const minY = Math.min(fromNode.y, toNode.y);
		const maxY = Math.max(fromNode.y + NODE_HEIGHT, toNode.y + NODE_HEIGHT);
		
		return !(
			maxX < this.viewport.x ||
			minX > this.viewport.x + this.viewport.width ||
			maxY < this.viewport.y ||
			minY > this.viewport.y + this.viewport.height
		);
	}
	
	/**
	 * Optimized grid drawing with caching
	 */
	private drawGridOptimized(_width: number, _height: number): void {
		const cacheKey = `${this.state.offset.x},${this.state.offset.y},${this.state.scale}`;
		
		// Check if we have a cached grid pattern
		if (this.renderCache.grid && this.renderCache.grid.hash === cacheKey) {
			// Use cached pattern
			if (this.renderCache.grid.pattern) {
				this.ctx.fillStyle = this.renderCache.grid.pattern;
				this.ctx.fillRect(
					-this.state.offset.x / this.state.scale,
					-this.state.offset.y / this.state.scale,
					_width / this.state.scale,
					_height / this.state.scale
				);
				return;
			}
		}
		
		// Create new grid pattern
		this.drawGrid(_width, _height);
		
		// Cache for future use
		this.renderCache.grid = {
			offsetX: this.state.offset.x,
			offsetY: this.state.offset.y,
			scale: this.state.scale,
			pattern: null, // In a real implementation, we would create a pattern here
			lastRenderTime: Date.now(),
			hash: cacheKey,
		};
	}
	
	/**
	 * Draw grid with viewport culling
	 */
	private drawGrid(_width: number, _height: number): void {
		this.ctx.strokeStyle = '#1a1a1a';
		this.ctx.lineWidth = 1 / this.state.scale;
		
		const startX = Math.floor(this.viewport.x / GRID_SIZE) * GRID_SIZE;
		const startY = Math.floor(this.viewport.y / GRID_SIZE) * GRID_SIZE;
		const endX = startX + this.viewport.width + GRID_SIZE;
		const endY = startY + this.viewport.height + GRID_SIZE;
		
		// Vertical lines
		for (let x = startX; x < endX; x += GRID_SIZE) {
			this.ctx.beginPath();
			this.ctx.moveTo(x, this.viewport.y);
			this.ctx.lineTo(x, this.viewport.y + this.viewport.height);
			this.ctx.stroke();
		}
		
		// Horizontal lines
		for (let y = startY; y < endY; y += GRID_SIZE) {
			this.ctx.beginPath();
			this.ctx.moveTo(this.viewport.x, y);
			this.ctx.lineTo(this.viewport.x + this.viewport.width, y);
			this.ctx.stroke();
		}
	}
	
	/**
	 * Optimized node drawing with caching
	 */
	private drawNodeOptimized(node: WorkflowNode): void {
		const nodeDef = this.nodeRegistry.get(node.type);
		if (!nodeDef) return;
		
		const configKey = this.stringifyValue(node.config);
		const cacheKey = `${node.x},${node.y},${configKey},${String(this.state.selectedNodeId === node.id)}`;
		const cachedNode = this.renderCache.nodes.get(node.id);
		
		// Check if we can reuse cached rendering
		if (cachedNode && cachedNode.hash === cacheKey) {
			// In a real implementation, we might have a cached canvas or image
			// For now, we'll still draw but with more efficient methods
		}
		
		// Draw the node
		this.drawNode(node);
		
		// Update cache
		this.renderCache.nodes.set(node.id, {
			x: node.x,
			y: node.y,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
			hash: cacheKey,
			lastRenderTime: Date.now(),
		});
	}
	
	/**
	 * Optimized connection drawing with caching
	 */
	private drawConnectionOptimized(conn: Connection): void {
		const fromNode = this.workflow.getNode(conn.from);
		const toNode = this.workflow.getNode(conn.to);
		if (!fromNode || !toNode) return;
		
		const cacheKey = `${fromNode.x},${fromNode.y},${toNode.x},${toNode.y}`;
		const cachedConn = this.renderCache.connections.get(`${conn.from}-${conn.to}`);
		
		// Check if we can reuse cached path
		if (cachedConn && cachedConn.hash === cacheKey) {
			// Reuse cached path
			this.drawCachedConnection(cachedConn);
			return;
		}
		
		// Draw fresh connection
		this.drawConnection(conn);
		
		// Update cache (in a real implementation, we would cache the Path2D)
		this.renderCache.connections.set(`${conn.from}-${conn.to}`, {
			fromNodeId: conn.from,
			toNodeId: conn.to,
			path: new Path2D(), // Placeholder - in real implementation we would cache the actual path
			boundingBox: {
				x: Math.min(fromNode.x, toNode.x),
				y: Math.min(fromNode.y, toNode.y),
				width: Math.abs(toNode.x - fromNode.x) + NODE_WIDTH,
				height: Math.abs(toNode.y - fromNode.y) + NODE_HEIGHT,
			},
			hash: cacheKey,
			lastRenderTime: Date.now(),
		});
	}
	
	/**
	 * Draw cached connection
	 */
	private drawCachedConnection(cachedConn: CachedConnection): void {
		// In a real implementation, we would draw the cached Path2D
		// For now, we'll just call the regular drawConnection
		const conn = this.workflow.getConnections().find(
			c => c.from === cachedConn.fromNodeId && c.to === cachedConn.toNodeId
		);
		if (conn) {
			this.drawConnection(conn);
		}
	}
	
	// ============================================================================
	// EXISTING RENDERING METHODS (COPIED FROM ORIGINAL IMPLEMENTATION)
	// ============================================================================
	
	/**
	 * Draw node (same as original but with viewport awareness)
	 */
	private drawNode(node: WorkflowNode): void {
		const nodeDef = this.nodeRegistry.get(node.type);
		if (!nodeDef) return;
		
		const isSelected = node.id === this.state.selectedNodeId;
		const executionState = this.executionStates.get(node.id);
		
		// Shadow
		if (!executionState || executionState.status !== 'running') {
			this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
			this.ctx.shadowBlur = 10;
			this.ctx.shadowOffsetY = 2;
		}
		
		// Background (placeholder solid fill; gradient hookup TBD)
		this.ctx.fillStyle = '#333';
		this.ctx.beginPath();
		this.drawRoundRect(node.x, node.y, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS);
		this.ctx.fill();
		
		// Reset shadow
		this.ctx.shadowColor = 'transparent';
		
		// Border
		if (isSelected) {
			this.ctx.strokeStyle = '#fff';
			this.ctx.lineWidth = 2 / this.state.scale;
		} else if (executionState) {
			const borderColors: Record<string, string> = {
				pending: '#fbbf24',
				running: '#3b82f6',
				success: '#10b981',
				error: '#ef4444',
			};
			this.ctx.strokeStyle = borderColors[executionState.status];
			this.ctx.lineWidth = 2 / this.state.scale;
		} else {
			this.ctx.strokeStyle = '#444';
			this.ctx.lineWidth = 1 / this.state.scale;
		}
		
		this.ctx.beginPath();
		this.drawRoundRect(node.x, node.y, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS);
		this.ctx.stroke();
		
		// Icon and text
		this.ctx.font = `${20 / this.state.scale}px sans-serif`;
		this.ctx.fillStyle = '#fff';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText(nodeDef.icon, node.x + 20, node.y + 25);
		
		this.ctx.font = `${12 / this.state.scale}px sans-serif`;
		this.ctx.textAlign = 'left';
		this.ctx.fillText(node.name, node.x + 40, node.y + 25);
		
		this.ctx.font = `${10 / this.state.scale}px sans-serif`;
		this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		this.ctx.fillText(nodeDef.name, node.x + 40, node.y + 45);
		
		// Handles
		this.drawHandles(node);

		// Execution status indicators
		if (executionState) {
			this.drawExecutionStatus(node, executionState);
		}

		// Draw simplified execution info with "More details" button
		if (this.shouldRenderExecutionInfo(executionState) && executionState) {
			this.drawNodeIOInfo(node, executionState);
		} else {
			this.executionInfoAreas.delete(node.id);
			this.moreDetailsButtons.delete(node.id);
		}

		// Draw variable indicator if node config uses variables
		this.drawVariableIndicator(node);
	}
	
	/**
	 * Draw handles
	 */
	private drawHandles(node: WorkflowNode): void {
		const nodeDef = this.nodeRegistry.get(node.type);
		if (!nodeDef) return;

		// Input handle (left)
		this.ctx.fillStyle = '#10b981';
		this.ctx.beginPath();
		this.ctx.arc(node.x, node.y + NODE_HEIGHT / 2, HANDLE_RADIUS, 0, Math.PI * 2);
		this.ctx.fill();

		// Output handle (right)
		this.ctx.fillStyle = '#3b82f6';
		this.ctx.beginPath();
		this.ctx.arc(node.x + NODE_WIDTH, node.y + NODE_HEIGHT / 2, HANDLE_RADIUS, 0, Math.PI * 2);
		this.ctx.fill();
	}

	/**
	 * Draw execution status indicator
	 */
	private drawExecutionStatus(node: WorkflowNode, state: NodeExecutionState): void {
		// Status badge on top-left corner
		const badgeSize = 24;
		const badgeX = node.x + 4;
		const badgeY = node.y + 4;

		// Badge background
		const bgColors: Record<string, string> = {
			pending: '#fbbf24',
			running: '#3b82f6',
			completed: '#10b981',
			error: '#ef4444',
		};
		this.ctx.fillStyle = bgColors[state.status] || '#666';
		this.ctx.beginPath();
		this.ctx.arc(
			badgeX + badgeSize / 2,
			badgeY + badgeSize / 2,
			badgeSize / 2,
			0,
			Math.PI * 2
		);
		this.ctx.fill();

		// Status icon
		this.ctx.font = `${12 / this.state.scale}px sans-serif`;
		this.ctx.fillStyle = '#fff';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		const icons: Record<string, string> = {
			pending: '⏸',
			running: '▶',
			completed: '✓',
			error: '✗',
		};
		this.ctx.fillText(
			icons[state.status] || '?',
			badgeX + badgeSize / 2,
			badgeY + badgeSize / 2
		);

		// Duration text if available
		if (state.duration !== undefined && typeof state.duration === 'number') {
			this.ctx.font = `${9 / this.state.scale}px sans-serif`;
			this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
			this.ctx.textAlign = 'left';
			this.ctx.textBaseline = 'top';
			this.ctx.fillText(
				`${state.duration.toFixed(0)}ms`,
				node.x + 4,
				node.y + NODE_HEIGHT - 14
			);
		}
	}

	/**
	 * Determine whether execution info (input/output/metadata) should be rendered
	 */
	private shouldRenderExecutionInfo(state?: NodeExecutionState | null): boolean {
		if (!state) {
			return false;
		}

		return state.status === 'success' || state.status === 'completed' || state.status === 'error';
	}

	/**
	 * Draw simplified node execution info with "More details" button
	 */
	private drawNodeIOInfo(node: WorkflowNode, state: NodeExecutionState): void {
		const padding = 8;
		const lineHeight = 12;
		const boxX = node.x;
		const boxY = node.y + NODE_HEIGHT + 8;
		const boxHeight = 90; // Increased height to show input/output
		const buttonWidth = 100;
		const buttonHeight = 24;

		// Background
		this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
		this.ctx.beginPath();
		this.drawRoundRect(boxX, boxY, NODE_WIDTH, boxHeight, 8);
		this.ctx.fill();

		// Border
		this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.65)';
		this.ctx.lineWidth = 1 / this.state.scale;
		this.ctx.beginPath();
		this.drawRoundRect(boxX, boxY, NODE_WIDTH, boxHeight, 8);
		this.ctx.stroke();

		let currentY = boxY + padding;

		// Status text
		const statusText = state.error ? `Error: ${state.error.substring(0, 30)}...` :
			state.duration !== undefined ? `Duration: ${state.duration}ms` : 'Completed';

		this.ctx.font = `${10 / this.state.scale}px sans-serif`;
		this.ctx.fillStyle = state.error ? '#fca5a5' : '#93c5fd';
		this.ctx.textAlign = 'left';
		this.ctx.textBaseline = 'top';
		this.ctx.fillText(statusText, boxX + padding, currentY);
		currentY += lineHeight;

		// Input preview
		if (state.input !== undefined) {
			this.ctx.fillStyle = '#94a3b8';
			this.ctx.font = `${9 / this.state.scale}px sans-serif`;
			this.ctx.fillText('Input:', boxX + padding, currentY);
			currentY += lineHeight;

			const inputPreview = this.formatValuePreview(state.input, 35);
			this.ctx.fillStyle = '#cbd5e1';
			this.ctx.fillText(inputPreview, boxX + padding + 4, currentY);
			currentY += lineHeight;
		}

		// Output preview
		if (state.output !== undefined) {
			this.ctx.fillStyle = '#94a3b8';
			this.ctx.font = `${9 / this.state.scale}px sans-serif`;
			this.ctx.fillText('Output:', boxX + padding, currentY);
			currentY += lineHeight;

			const outputPreview = this.formatValuePreview(state.output, 35);
			this.ctx.fillStyle = '#cbd5e1';
			this.ctx.fillText(outputPreview, boxX + padding + 4, currentY);
		}

		// "More details" button
		const buttonX = boxX + (NODE_WIDTH - buttonWidth) / 2;
		const buttonY = boxY + boxHeight - buttonHeight - padding;

		// Button background
		this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
		this.ctx.beginPath();
		this.drawRoundRect(buttonX, buttonY, buttonWidth, buttonHeight, 4);
		this.ctx.fill();

		// Button text
		this.ctx.font = `${11 / this.state.scale}px sans-serif`;
		this.ctx.fillStyle = '#fff';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText('More details', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);

		// Store button bounds for click detection
		this.moreDetailsButtons.set(node.id, {
			x: buttonX,
			y: buttonY,
			width: buttonWidth,
			height: buttonHeight,
		});

		// Store info area bounds
		this.executionInfoAreas.set(node.id, {
			x: boxX,
			y: boxY,
			width: NODE_WIDTH,
			height: boxHeight,
		});
	}

	/**
	 * Format a value as a brief preview string
	 */
	private formatValuePreview(value: unknown, maxLength: number): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';

		if (typeof value === 'string') {
			return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			const str = String(value);
			return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
		}

		if (typeof value === 'object') {
			try {
				const json = JSON.stringify(value);
				return json.length > maxLength ? `${json.substring(0, maxLength)}...` : json;
			} catch {
				return '[Complex Object]';
			}
		}

		// For other types (function, symbol, etc.)
		return `[${typeof value}]`;
	}

	/**
	 * Build display sections for execution data
	 */
	private buildExecutionSections(state: NodeExecutionState): Array<{ title: string; lines: string[] }> {
		const sections: Array<{ title: string; lines: string[] }> = [];

		sections.push({
			title: 'Input',
			lines: [this.formatExecutionValue(state.input)],
		});

		sections.push({
			title: 'Output',
			lines: [this.formatExecutionValue(state.output)],
		});

		const metadataLines = this.buildMetadataLines(state);
		if (metadataLines.length > 0) {
			sections.push({
				title: 'Metadata',
				lines: metadataLines,
			});
		}

		if (state.error) {
			sections.push({
				title: 'Error',
				lines: [state.error],
			});
		}

		return sections;
	}

	/**
	 * Build metadata lines from execution state
	 */
	private buildMetadataLines(state: NodeExecutionState): string[] {
		const lines: string[] = [];
		lines.push(`Status: ${state.status}`);
		if (typeof state.duration === 'number') {
			lines.push(`Duration: ${Math.max(0, Math.round(state.duration))}ms`);
		}
		const startTime = this.formatTimestamp(state.startTime);
		if (startTime) {
			lines.push(`Start: ${startTime}`);
		}
		const endTime = this.formatTimestamp(state.endTime);
		if (endTime) {
			lines.push(`End: ${endTime}`);
		}
		return lines;
	}

	/**
	 * Convert execution value into a readable string
	 */
	private formatExecutionValue(value: unknown): string {
		if (value === undefined || value === null) {
			return 'No data';
		}
		if (typeof value === 'string') {
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed : '(empty string)';
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		try {
			const serialized = JSON.stringify(value);
			if (serialized) {
				return serialized;
			}
		} catch (error) {
			console.warn('Failed to stringify execution value:', error);
		}
		if (typeof value === 'object' && value !== null) {
			return '[Complex Object]';
		}
		return `[${typeof value}]`;
	}

	/**
	 * Wrap text into multiple lines within the provided width
	 */
	private wrapText(text: string, maxWidth: number, fontSize: number, maxLines = 3): string[] {
		const previousFont = this.ctx.font;
		this.ctx.font = `${fontSize}px sans-serif`;

		const sanitized = text.replace(/\s+/g, ' ').trim();
		if (sanitized.length === 0) {
			this.ctx.font = previousFont;
			return ['No data'];
		}

		const limited = sanitized.slice(0, 500);
		const lines: string[] = [];
		let remaining = limited;

		while (remaining.length > 0 && lines.length < maxLines) {
			let low = 1;
			let high = remaining.length;
			let best = 1;

			while (low <= high) {
				const mid = Math.floor((low + high) / 2);
				const slice = remaining.slice(0, mid);
				if (this.ctx.measureText(slice).width <= maxWidth) {
					best = mid;
					low = mid + 1;
				} else {
					high = mid - 1;
				}
			}

			let line = remaining.slice(0, best).trim();
			remaining = remaining.slice(best).replace(/^\s+/, '');

			if (remaining.length > 0 && lines.length === maxLines - 1) {
				if (line.length > 1) {
					line = `${line.slice(0, line.length - 1)}…`;
				} else {
					line = `${line}…`;
				}
				lines.push(line);
				this.ctx.font = previousFont;
				return lines;
			}

			lines.push(line);
		}

		this.ctx.font = previousFont;
		return lines.length > 0 ? lines : ['No data'];
	}

	/**
	 * Format timestamp into readable time
	 */
	private formatTimestamp(timestamp?: number): string | null {
		if (!timestamp) {
			return null;
		}
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return date.toLocaleTimeString();
	}

	/**
	 * Prepare metadata payload for event consumers
	 */
	private createExecutionMetadata(state?: NodeExecutionState): {
		status?: NodeExecutionState['status'];
		duration?: number;
		startTime?: number;
		endTime?: number;
		error?: string;
	} | undefined {
		if (!state) {
			return undefined;
		}

		const metadata: {
			status?: NodeExecutionState['status'];
			duration?: number;
			startTime?: number;
			endTime?: number;
			error?: string;
		} = {};

		if (state.status) {
			metadata.status = state.status;
		}
		if (typeof state.duration === 'number') {
			metadata.duration = state.duration;
		}
		if (state.startTime) {
			metadata.startTime = state.startTime;
		}
		if (state.endTime) {
			metadata.endTime = state.endTime;
		}
		if (state.error) {
			metadata.error = state.error;
		}

		return Object.keys(metadata).length > 0 ? metadata : undefined;
	}

	/**
	 * Check if a point is inside a rectangular bounds object
	 */
	private isPointInsideBounds(
		x: number,
		y: number,
		bounds: { x: number; y: number; width: number; height: number }
	): boolean {
		return (
			x >= bounds.x &&
			x <= bounds.x + bounds.width &&
			y >= bounds.y &&
			y <= bounds.y + bounds.height
		);
	}

	/**
	 * Draw variable indicator badge if node uses variables
	 */
	private drawVariableIndicator(node: WorkflowNode): void {
		// Check if node config contains any variables
		const configStr = JSON.stringify(node.config);
		const variables = extractVariables(configStr);

		if (variables.length === 0) return;

		// Draw a small badge on the top-right corner
		const badgeSize = 20;
		const badgeX = node.x + NODE_WIDTH - badgeSize - 4;
		const badgeY = node.y + 4;

		// Badge background
		this.ctx.fillStyle = 'rgba(147, 51, 234, 0.9)'; // Purple color for variables
		this.ctx.beginPath();
		this.ctx.arc(
			badgeX + badgeSize / 2,
			badgeY + badgeSize / 2,
			badgeSize / 2,
			0,
			Math.PI * 2
		);
		this.ctx.fill();

		// Badge border
		this.ctx.strokeStyle = '#a855f7';
		this.ctx.lineWidth = 1 / this.state.scale;
		this.ctx.beginPath();
		this.ctx.arc(
			badgeX + badgeSize / 2,
			badgeY + badgeSize / 2,
			badgeSize / 2,
			0,
			Math.PI * 2
		);
		this.ctx.stroke();

		// Variable icon (double braces)
		this.ctx.font = `${10 / this.state.scale}px monospace`;
		this.ctx.fillStyle = '#fff';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText('{{}}', badgeX + badgeSize / 2, badgeY + badgeSize / 2);
	}

	/**
	 * Draw connection
	 */
	private drawConnection(conn: Connection): void {
		const fromNode = this.workflow.getNode(conn.from);
		const toNode = this.workflow.getNode(conn.to);
		if (!fromNode || !toNode) return;

		const x1 = fromNode.x + NODE_WIDTH;
		const y1 = fromNode.y + NODE_HEIGHT / 2;
		const x2 = toNode.x;
		const y2 = toNode.y + NODE_HEIGHT / 2;

		// Bezier curve control points
		const dx = x2 - x1;
		const cp1x = x1 + Math.max(50, Math.abs(dx) * 0.5);
		const cp1y = y1;
		const cp2x = x2 - Math.max(50, Math.abs(dx) * 0.5);
		const cp2y = y2;

		// Check if this connection is selected
		const connId = `${conn.from}-${conn.to}`;
		const isSelected = this.selectedConnectionId === connId;

		// Line
		this.ctx.strokeStyle = isSelected ? '#60a5fa' : '#4a5568';
		this.ctx.lineWidth = isSelected ? 3 / this.state.scale : 2 / this.state.scale;
		this.ctx.beginPath();
		this.ctx.moveTo(x1, y1);
		this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
		this.ctx.stroke();

		// Arrow
		const angle = Math.atan2(cp2y - y2, cp2x - x2);
		const arrowSize = 8 / this.state.scale;

		this.ctx.fillStyle = isSelected ? '#60a5fa' : '#4a5568';
		this.ctx.beginPath();
		this.ctx.moveTo(x2, y2);
		this.ctx.lineTo(
			x2 + arrowSize * Math.cos(angle - Math.PI / 6),
			y2 + arrowSize * Math.sin(angle - Math.PI / 6)
		);
		this.ctx.lineTo(
			x2 + arrowSize * Math.cos(angle + Math.PI / 6),
			y2 + arrowSize * Math.sin(angle + Math.PI / 6)
		);
		this.ctx.closePath();
		this.ctx.fill();
	}
	
	/**
	 * Draw temporary connection
	 */
	private drawTempConnection(): void {
		if (!this.state.creatingConnection) return;
		
		const fromNode = this.workflow.getNode(this.state.creatingConnection.fromNodeId);
		if (!fromNode) return;
		
		const x1 = fromNode.x + NODE_WIDTH;
		const y1 = fromNode.y + NODE_HEIGHT / 2;
		const mousePos = this.screenToWorld(
			this.state.creatingConnection.mouseX,
			this.state.creatingConnection.mouseY
		);
		
		this.ctx.strokeStyle = '#60a5fa';
		this.ctx.lineWidth = 2 / this.state.scale;
		this.ctx.setLineDash([5 / this.state.scale, 5 / this.state.scale]);
		this.ctx.beginPath();
		this.ctx.moveTo(x1, y1);
		this.ctx.lineTo(mousePos.x, mousePos.y);
		this.ctx.stroke();
		this.ctx.setLineDash([]);
	}
	
	/**
	 * Draw spinner
	 */
	private drawSpinner(x: number, y: number, radius: number): void {
		const time = Date.now() / 1000;
		const angle = (time * Math.PI * 2) % (Math.PI * 2);

		this.ctx.strokeStyle = '#fff';
		this.ctx.lineWidth = 2 / this.state.scale;
		this.ctx.beginPath();
		this.ctx.arc(x, y, radius, angle, angle + Math.PI * 1.5);
		this.ctx.stroke();
	}

	/**
	 * Helper method to stringify values for display
	 */
	private stringifyValue(value: unknown): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
			return String(value);
		}
		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch {
				return '[unserializable]';
			}
		}
		if (typeof value === 'symbol') {
			return value.toString();
		}
		if (typeof value === 'function') {
			return value.name ? `[Function ${value.name}]` : '[Function]';
		}
		return '[unsupported]';
	}

	/**
	 * Draw overlay
	 */
	private drawOverlay(_width: number, _height: number): void {
		// Zoom indicator
		this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		this.ctx.fillRect(10, 10, 80, 30);
		this.ctx.fillStyle = '#fff';
		this.ctx.font = '12px monospace';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';
		this.ctx.fillText(`${Math.round(this.state.scale * 100)}%`, 50, 25);
	}
	
	// ============================================================================
	// EVENT HANDLERS (SAME AS ORIGINAL)
	// ============================================================================
	
	/**
	 * Mouse down handler
	 */
	private onMouseDown(e: MouseEvent): void {
		const pos = this.screenToWorld(e.offsetX, e.offsetY);

		// First, check if clicking on any "More details" button (they're below nodes)
		for (const node of this.workflow.getNodes()) {
			if (this.isOverMoreDetailsButton(node, pos.x, pos.y)) {
				const executionState = this.executionStates.get(node.id);
				if (executionState) {
					this.events.emit('execution:details-click', {
						nodeId: node.id,
						nodeName: node.name,
						executionState,
					});
				}
				return;
			}
		}

		// Check if clicking on a node
		const node = this.getNodeAt(pos.x, pos.y);

		if (node) {
			// Check if clicking on output handle
			if (this.isOverOutputHandle(node, pos.x, pos.y)) {
				// Start creating connection
				this.state.creatingConnection = {
					fromNodeId: node.id,
					mouseX: e.offsetX,
					mouseY: e.offsetY,
				};
				return;
			}

			// Start dragging node
			this.isDragging = true;
			this.state.draggingNodeId = node.id;
			this.state.selectedNodeId = node.id;
			this.selectedConnectionId = null; // Deselect connection
			this.dragStart = pos;
			this.nodeOffset = { x: pos.x - node.x, y: pos.y - node.y };
		} else {
			// Check if clicking on a connection
			const connection = this.getConnectionAt(pos.x, pos.y);
			if (connection) {
				// Select the connection
				this.selectedConnectionId = `${connection.from}-${connection.to}`;
				this.state.selectedNodeId = null; // Deselect node
				this.events.emit('node:selected', { nodeId: null });
				this.scheduleRedraw();
				return;
			}

			// Start panning when left mouse button is held down
			if (e.button === 0) {
				this.isPanning = true;
				this.dragStart = { x: e.offsetX, y: e.offsetY };
			} else {
				// Deselect
				this.state.selectedNodeId = null;
				this.selectedConnectionId = null;
				this.events.emit('node:selected', { nodeId: null });
			}
		}
	}
	
	/**
	 * Mouse move handler
	 */
	private onMouseMove(e: MouseEvent): void {
		const pos = this.screenToWorld(e.offsetX, e.offsetY);
		
		if (this.isDragging && this.state.draggingNodeId) {
			// Drag node
			const node = this.workflow.getNode(this.state.draggingNodeId);
			if (node) {
				// Snap to grid
				const snapX = Math.round((pos.x - this.nodeOffset.x) / GRID_SIZE) * GRID_SIZE;
				const snapY = Math.round((pos.y - this.nodeOffset.y) / GRID_SIZE) * GRID_SIZE;
				
				this.workflow.updateNode(node.id, { x: snapX, y: snapY });
				this.events.emit('node:updated', { node });
				this.scheduleRedraw(); // Use optimized redraw
			}
		} else if (this.isPanning) {
			// Pan canvas
			const dx = e.offsetX - this.dragStart.x;
			const dy = e.offsetY - this.dragStart.y;
			this.state.offset.x += dx;
			this.state.offset.y += dy;
			this.dragStart = { x: e.offsetX, y: e.offsetY };
			this.scheduleRedraw(); // Use optimized redraw
		} else if (this.state.creatingConnection) {
			// Update connection preview
			this.state.creatingConnection.mouseX = e.offsetX;
			this.state.creatingConnection.mouseY = e.offsetY;
			this.scheduleRedraw(); // Use optimized redraw
		}
		
		// Update cursor
		// First check if over any "More details" button
		let overButton = false;
		for (const buttonNode of this.workflow.getNodes()) {
			if (this.isOverMoreDetailsButton(buttonNode, pos.x, pos.y)) {
				this.canvas.setCssProps({ cursor: 'pointer' });
				overButton = true;
				break;
			}
		}

		if (!overButton) {
			const node = this.getNodeAt(pos.x, pos.y);
			if (node) {
				if (this.isOverOutputHandle(node, pos.x, pos.y)) {
					this.canvas.setCssProps({ cursor: 'crosshair' });
				} else {
					this.canvas.setCssProps({ cursor: 'move' });
				}
			} else {
				this.canvas.setCssProps({ cursor: 'default' });
			}
		}
	}
	
	/**
	 * Mouse up handler
	 */
	private onMouseUp(e: MouseEvent): void {
		const pos = this.screenToWorld(e.offsetX, e.offsetY);

		// Finish creating connection
		if (this.state.creatingConnection) {
			const targetNode = this.getNodeAt(pos.x, pos.y);

			if (targetNode && targetNode.id !== this.state.creatingConnection.fromNodeId) {
				// Check if clicking on input handle
				if (this.isOverInputHandle(targetNode, pos.x, pos.y)) {
					const connection: Connection = {
						id: `edge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
						from: this.state.creatingConnection.fromNodeId,
						to: targetNode.id,
					};

					this.workflow.addConnection(connection);
					this.events.emit('connection:added', { connection });
					this.scheduleRedraw(); // Use optimized redraw
				}
			}

			this.state.creatingConnection = null;
			this.scheduleRedraw(); // Use optimized redraw
		}

		this.isDragging = false;
		this.isPanning = false;
		this.state.draggingNodeId = null;
	}
	
	/**
	 * Wheel handler (zoom disabled)
	 */
	private onWheel(e: WheelEvent): void {
		e.preventDefault();
		// Zoom is disabled - wheel events only prevented to avoid page scrolling
	}
	
	/**
	 * Double click handler - opens node config modal
	 */
	private onDoubleClick(e: MouseEvent): void {
		const pos = this.screenToWorld(e.offsetX, e.offsetY);
		const node = this.getNodeAt(pos.x, pos.y);
		
		if (node) {
			// Reset dragging state before opening modal to prevent cursor sticking
			this.isDragging = false;
			this.state.draggingNodeId = null;
			
			// Open config modal instead of sidebar panel
			this.events.emit('node:edit', { nodeId: node.id });
		}
	}
	
	/**
	 * Context menu handler
	 */
	private onContextMenu(e: MouseEvent): void {
		e.preventDefault();

		const pos = this.screenToWorld(e.offsetX, e.offsetY);
		const node = this.getNodeAt(pos.x, pos.y);

		if (node) {
			// Show node context menu
			this.showNodeMenu(node, e.clientX, e.clientY);
		} else {
			// Check if right-clicking on a connection
			const connection = this.getConnectionAt(pos.x, pos.y);
			if (connection) {
				this.showConnectionMenu(connection, e.clientX, e.clientY);
			}
		}
	}
	
	/**
	 * Show node context menu
	 */
	private showNodeMenu(node: WorkflowNode, x: number, y: number): void {
		// Create menu
		const menu = document.body.createDiv('workflow-v2-context-menu');
		menu.style.left = `${x}px`;
		menu.style.top = `${y}px`;

		// Delete option
		const deleteItem = menu.createDiv('context-menu-item');
		deleteItem.setText('🗑️ delete');
		deleteItem.addEventListener('click', () => {
			this.workflow.removeNode(node.id);
			this.executionStates.delete(node.id);
			this.executionInfoAreas.delete(node.id);
			this.events.emit('node:removed', { nodeId: node.id });
			menu.remove();
			this.scheduleRedraw(); // Use optimized redraw
		});

		// Duplicate option
		const duplicateItem = menu.createDiv('context-menu-item');
		duplicateItem.setText('📋 duplicate');
		duplicateItem.addEventListener('click', () => {
			const newNode: WorkflowNode = {
				...node,
				id: `node_${Date.now()}`,
				x: node.x + 20,
				y: node.y + 20,
			};
			this.workflow.addNode(newNode);
			this.events.emit('node:added', { node: newNode });
			menu.remove();
			this.scheduleRedraw(); // Use optimized redraw
		});

		// Close menu on click outside
		setTimeout(() => {
			const closeMenu = () => {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			};
			document.addEventListener('click', closeMenu);
		}, 0);
	}

	/**
	 * Show connection context menu
	 */
	private showConnectionMenu(connection: Connection, x: number, y: number): void {
		// Create menu
		const menu = document.body.createDiv('workflow-v2-context-menu');
		menu.style.left = `${x}px`;
		menu.style.top = `${y}px`;

		// Delete option
		const deleteItem = menu.createDiv('context-menu-item');
		deleteItem.setText('🗑️ delete connection');
		deleteItem.addEventListener('click', () => {
			this.workflow.removeConnection(connection);
			this.selectedConnectionId = null;
			this.events.emit('connection:removed', { connection });
			menu.remove();
			this.scheduleRedraw();
		});

		// Close menu on click outside
		setTimeout(() => {
			const closeMenu = () => {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			};
			document.addEventListener('click', closeMenu);
		}, 0);
	}
	
	/**
	 * Drag over handler
	 */
	private onDragOver(e: DragEvent): void {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
	}
	
	/**
	 * Drop handler (add new node)
	 */
	private onDrop(e: DragEvent): void {
		e.preventDefault();

		const nodeType = e.dataTransfer!.getData('nodeType');
		if (!nodeType) return;

		const nodeDef = this.nodeRegistry.get(nodeType);
		if (!nodeDef) return;

		const pos = this.screenToWorld(e.offsetX, e.offsetY);

		// Snap to grid
		const x = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
		const y = Math.round(pos.y / GRID_SIZE) * GRID_SIZE;

		const newNode: WorkflowNode = {
			id: `node_${Date.now()}`,
			type: nodeType,
			name: nodeDef.name,
			x,
			y,
			config: {},
		};

		// Initialize default config
		for (const param of nodeDef.parameters) {
			newNode.config[param.name] = param.default;
		}

		this.workflow.addNode(newNode);
		this.events.emit('node:added', { node: newNode });
		this.scheduleRedraw(); // Use optimized redraw
	}

	/**
	 * Key down handler
	 */
	private onKeyDown(e: KeyboardEvent): void {
		// Delete key or Backspace
		if (e.key === 'Delete' || e.key === 'Backspace') {
			// Delete selected connection
			if (this.selectedConnectionId) {
				const parts = this.selectedConnectionId.split('-');
				if (parts.length === 2) {
					const connection = this.workflow.getConnections().find(
						c => c.from === parts[0] && c.to === parts[1]
					);
					if (connection) {
						this.workflow.removeConnection(connection);
						this.selectedConnectionId = null;
						this.events.emit('connection:removed', { connection });
						this.scheduleRedraw();
					}
				}
			}
			// Delete selected node
			else if (this.state.selectedNodeId) {
				this.workflow.removeNode(this.state.selectedNodeId);
				this.executionStates.delete(this.state.selectedNodeId);
				this.executionInfoAreas.delete(this.state.selectedNodeId);
				this.events.emit('node:removed', { nodeId: this.state.selectedNodeId });
				this.state.selectedNodeId = null;
				this.scheduleRedraw();
			}
		}
	}
	
	// ============================================================================
	// HELPER METHODS (SAME AS ORIGINAL)
	// ============================================================================
	
	/**
	 * Screen to world coordinates
	 */
	private screenToWorld(x: number, y: number): { x: number; y: number } {
		return {
			x: (x - this.state.offset.x) / this.state.scale,
			y: (y - this.state.offset.y) / this.state.scale,
		};
	}
	
	/**
	 * Get node at position
	 */
	private getNodeAt(x: number, y: number): WorkflowNode | null {
		for (const node of this.workflow.getNodes()) {
			if (
				x >= node.x &&
				x <= node.x + NODE_WIDTH &&
				y >= node.y &&
				y <= node.y + NODE_HEIGHT
			) {
				return node;
			}
		}
		return null;
	}
	
	/**
	 * Check if over output handle
	 */
	private isOverOutputHandle(node: WorkflowNode, x: number, y: number): boolean {
		const hx = node.x + NODE_WIDTH;
		const hy = node.y + NODE_HEIGHT / 2;
		const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
		return dist <= HANDLE_RADIUS + 5;
	}

	/**
	 * Check if over "More details" button
	 */
	private isOverMoreDetailsButton(node: WorkflowNode, x: number, y: number): boolean {
		const button = this.moreDetailsButtons.get(node.id);
		if (!button) return false;

		return (
			x >= button.x &&
			x <= button.x + button.width &&
			y >= button.y &&
			y <= button.y + button.height
		);
	}

	/**
	 * Check if over input handle
	 */
	private isOverInputHandle(node: WorkflowNode, x: number, y: number): boolean {
		const hx = node.x;
		const hy = node.y + NODE_HEIGHT / 2;
		const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
		return dist <= HANDLE_RADIUS + 5;
	}

	/**
	 * Get connection at position using bezier curve sampling
	 */
	private getConnectionAt(x: number, y: number): Connection | null {
		const threshold = 8; // Distance threshold for detecting click on connection

		for (const conn of this.workflow.getConnections()) {
			const fromNode = this.workflow.getNode(conn.from);
			const toNode = this.workflow.getNode(conn.to);
			if (!fromNode || !toNode) continue;

			const x1 = fromNode.x + NODE_WIDTH;
			const y1 = fromNode.y + NODE_HEIGHT / 2;
			const x2 = toNode.x;
			const y2 = toNode.y + NODE_HEIGHT / 2;

			// Bezier curve control points
			const dx = x2 - x1;
			const cp1x = x1 + Math.max(50, Math.abs(dx) * 0.5);
			const cp1y = y1;
			const cp2x = x2 - Math.max(50, Math.abs(dx) * 0.5);
			const cp2y = y2;

			// Sample the bezier curve and check distance
			const samples = 50;
			for (let i = 0; i <= samples; i++) {
				const t = i / samples;
				const t2 = t * t;
				const t3 = t2 * t;
				const mt = 1 - t;
				const mt2 = mt * mt;
				const mt3 = mt2 * mt;

				// Cubic bezier formula
				const px = mt3 * x1 + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * x2;
				const py = mt3 * y1 + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * y2;

				const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
				if (dist <= threshold) {
					return conn;
				}
			}
		}

		return null;
	}
	
	// ============================================================================
	// PUBLIC METHODS
	// ============================================================================
	
	/**
	 * Zoom in
	 */
	zoomIn(): void {
		this.state.scale = Math.min(3, this.state.scale * 1.2);
		this.scheduleRedraw(); // Use optimized redraw
	}
	
	/**
	 * Zoom out
	 */
	zoomOut(): void {
		this.state.scale = Math.max(0.1, this.state.scale / 1.2);
		this.scheduleRedraw(); // Use optimized redraw
	}
	
	/**
	 * Reset zoom
	 */
	resetZoom(): void {
		this.state.scale = 1;
		this.state.offset = { x: 0, y: 0 };
		this.scheduleRedraw(); // Use optimized redraw
	}
	
	/**
	 * Set workflow
	 */
	setWorkflow(workflow: WorkflowGraph): void {
		this.workflow = workflow;
		this.executionStates.clear();
		this.executionInfoAreas.clear();
		this.renderCache.nodes.clear();
		this.renderCache.connections.clear();
		this.renderCache.grid = null;
		this.scheduleRedraw(); // Use optimized redraw
	}

	/**
	 * Update node state
	 */
	updateNodeState(nodeId: string, state: NodeExecutionState): void {
		this.executionStates.set(nodeId, state);
		this.scheduleRedraw(); // Use optimized redraw
	}

	/**
	 * Clear execution states
	 */
	clearExecutionStates(): void {
		this.executionStates.clear();
		this.executionInfoAreas.clear();
		this.scheduleRedraw(); // Use optimized redraw
	}

	/**
	 * Get node execution state
	 */
	getNodeExecutionState(nodeId: string): NodeExecutionState | undefined {
		return this.executionStates.get(nodeId);
	}

	/**
	 * Deselect all
	 */
	deselectAll(): void {
		this.state.selectedNodeId = null;
		this.scheduleRedraw(); // Use optimized redraw
	}
	
	/**
	 * Add event listener
	 */
	on<K extends keyof WorkflowEvents>(event: K, handler: (_data: WorkflowEvents[K]) => void): void {
		this.events.on(event, handler);
	}
	
	/**
	 * Remove event listener
	 */
	off<K extends keyof WorkflowEvents>(event: K, handler: (_data: WorkflowEvents[K]) => void): void {
		this.events.off(event, handler);
	}
	
	/**
	 * Destroy canvas
	 */
	destroy(): void {
		if (this.animationFrame) {
			cancelAnimationFrame(this.animationFrame);
		}
		this.events.clear();

		// Remove event listeners to prevent memory leaks
		this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
		this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
		this.canvas.removeEventListener('mouseup', this.mouseUpHandler);
		this.canvas.removeEventListener('wheel', this.wheelHandler);
		this.canvas.removeEventListener('dblclick', this.doubleClickHandler);
		this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
		this.canvas.removeEventListener('dragover', this.dragOverHandler);
		this.canvas.removeEventListener('drop', this.dropHandler);
		document.removeEventListener('keydown', this.keyDownHandler);

		// Remove resize handler
		window.removeEventListener('resize', this.resizeHandler);

		// Disconnect ResizeObserver
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}
}
