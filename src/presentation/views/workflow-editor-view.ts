/**
 * Workflow Editor View
 *
 * Integrates the workflow system with Obsidian's FileView.
 * Provides a complete visual workflow editor with drag-drop, execution, and history.
 */

import { FileView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import {
	WorkflowEditor,
	WorkflowGraph,
	WorkflowStorage,
	ExecutionHistoryStorage,
	WorkflowIndexManager,
	nodeRegistry,
	initializeWorkflowSystem,
	WorkflowServices,
} from '@/domain/workflow';
import { NodeConfigModal } from '@/domain/workflow/editor/node-config-modal';

export const WORKFLOW_EDITOR_VIEW_TYPE = 'workflow-editor-view';

/**
 * Workflow Editor View
 * Integrates workflow system with Obsidian FileView
 */
export class WorkflowEditorView extends FileView {
	private editor: WorkflowEditor | null = null;
	private storage: WorkflowStorage;
	private executionHistoryStorage: ExecutionHistoryStorage;
	private indexManager: WorkflowIndexManager;
	private currentWorkflow: WorkflowGraph | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: IntelligenceAssistantPlugin) {
		super(leaf);

		// Initialize workflow system
		initializeWorkflowSystem();

		// Get plugin data directory path
		// In Obsidian, plugin data is typically stored at: {vault}/.obsidian/plugins/{plugin-id}/data
		const pluginDataPath = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data`;

		// Create storage instances
		this.storage = new WorkflowStorage(this.app.vault);
		this.executionHistoryStorage = new ExecutionHistoryStorage(this.app.vault, pluginDataPath);
		this.indexManager = new WorkflowIndexManager(this.app.vault, pluginDataPath);

		// Initialize storage systems
		this.initializeStorage();
	}

	/**
	 * Initialize storage systems
	 */
	private async initializeStorage(): Promise<void> {
		try {
			await this.executionHistoryStorage.initialize();
			await this.indexManager.initialize();
		} catch (error) {
			console.error('Failed to initialize storage systems:', error);
		}
	}

	getViewType(): string {
		return WORKFLOW_EDITOR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? `Workflow: ${this.file.basename}` : 'Workflow Editor';
	}

	getIcon(): string {
		return 'workflow';
	}

	/**
	 * Called when the view is opened
	 */
	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('workflow-editor-v2-container');

		// Add styles
		this.addStyles();

		// If file is set, load it
		if (this.file) {
			await this.loadWorkflowFromFile();
		} else {
			// Create new empty workflow
			await this.createNewWorkflow();
		}
	}

	/**
	 * Called when closing the view
	 */
	async onClose() {
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}
	}

	/**
	 * Called when a file is loaded (FileView integration)
	 */
	async onLoadFile(_file: TFile): Promise<void> {
		await this.loadWorkflowFromFile();
	}

	/**
	 * Called when a file is unloaded (FileView integration)
	 */
	async onUnloadFile(_file: TFile): Promise<void> {
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}
	}

	/**
	 * Get view data (FileView requirement)
	 */
	getViewData(): string {
		if (this.currentWorkflow) {
			return JSON.stringify(this.currentWorkflow.toJSON(), null, 2);
		}
		return '';
	}

	/**
	 * Set view data (FileView requirement)
	 */
	setViewData(_data: string, _clear: boolean): void {
		// Data is loaded in onLoadFile instead
	}

	/**
	 * Clear view (FileView requirement)
	 */
	clear(): void {
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}
		this.currentWorkflow = null;
	}

	/**
	 * Load workflow from current file
	 */
	private async loadWorkflowFromFile() {
		if (!this.file) {
			console.error('No file to load workflow from');
			return;
		}

		try {
			// Read file content
			const content = await this.app.vault.read(this.file);
			const workflowData = JSON.parse(content);

			// Create workflow graph
			this.currentWorkflow = WorkflowGraph.fromJSON(workflowData);

			// Create editor
			await this.createEditor();

			console.debug('Workflow loaded successfully:', this.file.path);
		} catch (error) {
			console.error('Failed to load workflow:', error);
			new Notice(`Failed to load workflow: ${error.message}`);

			// Create empty workflow as fallback
			await this.createNewWorkflow();
		}
	}

	/**
	 * Create a new empty workflow
	 */
	private async createNewWorkflow() {
		const name = this.file ? this.file.basename : 'New Workflow';
		this.currentWorkflow = WorkflowGraph.create(name);
		await this.createEditor();
	}

	/**
	 * Create the workflow editor
	 */
	private async createEditor() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		if (!this.currentWorkflow) {
			new Notice('No workflow to edit');
			return;
		}

		// Prepare services
		const services = this.getWorkflowServices();

		// Create editor
		this.editor = new WorkflowEditor(
			container,
			this.currentWorkflow,
			this.storage,
			nodeRegistry,
			services,
			this.executionHistoryStorage,
			this.indexManager
		);

		// Listen to editor events
		this.setupEditorEventListeners();
	}

	/**
	 * Get workflow services for execution
	 */
	private getWorkflowServices(): WorkflowServices {
		return {
			app: this.app, // Add app instance for modal creation
			vault: this.app.vault,
			http: {
				request: async (url: string | URL, options?: any) => {
					try {
						const response = await fetch(url, options);
						return response;
					} catch (error) {
						console.error('HTTP request error:', error);
						throw error;
					}
				}
			},
			settings: this.plugin.settings,
			ai: {
				chat: async (messages: any[], options?: any) => {
					if (!options?.model) {
						throw new Error('Model not specified for AI chat');
					}

					// Find the appropriate LLM configuration for the specified model
					const modelId = options.model;
					const settings = this.plugin.settings;
					let llmConfig = null;
					
					// First, try to find exact match in cached models
					for (const config of settings.llmConfigs) {
						if (config.cachedModels && config.cachedModels.some((m: any) => m.id === modelId)) {
							llmConfig = config;
							break;
						}
					}

					if (!llmConfig) {
						// If model not found in cached models, try to match by provider prefixes
						// Some models may be prefixed (e.g., openai/gpt-4o)
						for (const config of settings.llmConfigs) {
							if (modelId.includes(config.provider) || 
							   (config.provider === 'openai' && modelId.includes('gpt-')) ||
							   (config.provider === 'anthropic' && modelId.includes('claude')) ||
							   (config.provider === 'google' && modelId.includes('gemini'))) {
								llmConfig = config;
								break;
							}
						}
					}

					if (!llmConfig) {
						throw new Error(`No configuration found for model: ${modelId}`);
					}

					// Create the provider for this configuration
					const { ProviderFactory } = await import('@/infrastructure/llm/provider-factory');
					const _provider = ProviderFactory.createProvider(llmConfig);

					// Prepare chat request
					const chatRequest = {
						messages,
						model: modelId,
						temperature: options.temperature,
						maxTokens: options.maxTokens,
						stream: false
					};

					// Execute the chat request
					const result = await provider.chat(chatRequest);
					return result.content;
				},
				embed: async (_text: string) => {
					// Find the first available embedding model
					const settings = this.plugin.settings;
					let embeddingConfig = null;
					for (const config of settings.llmConfigs) {
						if (config.cachedModels && config.cachedModels.some((m: any) => 
							m.capabilities?.includes('embedding') || m.id.includes('embed')
						)) {
							embeddingConfig = config;
							break;
						}
					}

					if (!embeddingConfig) {
						throw new Error('No embedding model configured');
					}

					// Create the provider for embedding
					const { ProviderFactory } = await import('@/infrastructure/llm/provider-factory');
					const _provider = ProviderFactory.createProvider(embeddingConfig);

					// For now, we'll throw an error since embedding isn't fully implemented
					// in the current providers as per the interface above
					throw new Error('Embedding not implemented in current providers');
				}
			}
		};
	}

	/**
	 * Setup editor event listeners
	 */
	private setupEditorEventListeners() {
		if (!this.editor) return;

		// Listen to save events
		this.editor.on('workflow:saved', async ({ workflow }) => {
			console.debug('Workflow saved:', workflow.name);

			// Update file if it exists
			if (this.file) {
				try {
					const content = JSON.stringify(workflow, null, 2);
					await this.app.vault.modify(this.file, content);
					new Notice('✅ Workflow saved successfully!');
				} catch (error) {
					console.error('Failed to save workflow file:', error);
					new Notice(`❌ Failed to save: ${error.message}`);
				}
			}
		});

		// Listen to execution events
		this.editor.on('execution:started', () => {
			console.debug('Workflow execution started');
		});

		this.editor.on('execution:completed', ({ result }) => {
			console.debug('Workflow execution completed:', result);

			if (result.success) {
				new Notice('✅ Workflow executed successfully!');
			} else {
				new Notice(`❌ Workflow failed: ${result.error}`);
			}
		});

		// Listen to node events
		this.editor.on('node:added', ({ node }) => {
			console.debug('Node added:', node.type);
		});

		this.editor.on('node:selected', ({ nodeId }) => {
			console.debug('Node selected:', nodeId);
		});

		this.editor.on('node:edit', ({ nodeId }) => {
			if (!this.editor) return;
			
			const node = this.editor.getWorkflow().getNode(nodeId);
			if (node) {
				const modal = new NodeConfigModal(
					this.app,
					node,
					nodeRegistry,
					this.editor?.getWorkflow(),
					this.getWorkflowServices()
				);

				modal.on('update', ({ nodeId, config }) => {
					this.editor?.getWorkflow().updateNode(nodeId, { config });
					// Canvas will automatically update since node:updated event is emitted
				});

				modal.open();
			}
		});

		this.editor.on('node:updated', ({ node }) => {
			console.debug('Node updated:', node.id);
		});
	}

	/**
	 * Add required styles
	 */
	private addStyles() {
		const styleId = 'workflow-editor-styles';
		if (document.getElementById(styleId)) {
			return; // Already added
		}

		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			.workflow-editor-v2-container {
				width: 100%;
				height: 100%;
				overflow: hidden;
			}
		`;
		document.head.appendChild(style);
	}
}
