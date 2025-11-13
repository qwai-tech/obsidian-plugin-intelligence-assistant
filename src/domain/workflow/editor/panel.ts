/**
 * Workflow System V2 - Config Panel
 *
 * Node configuration panel with dynamic form generation.
 * Provides intuitive UI for editing node parameters.
 */

import { WorkflowNode, NodeParameter, WorkflowServices } from '../core/types';
import { NodeRegistry } from '../nodes/registry';
import { EventEmitter } from './event-emitter';
import { showConfirm } from '../../../presentation/components/modals/confirm-modal';

/**
 * Panel events
 */
interface PanelEvents {
	'update': { nodeId: string; config: Record<string, any> };
	'delete': { nodeId: string };
	'close': void;
}

/**
 * Config panel - node configuration UI
 */
export class ConfigPanel {
	private container: HTMLElement;
	private nodeRegistry: NodeRegistry;
	private currentNode: WorkflowNode | null = null;
	private events = new EventEmitter<PanelEvents>();
	private services?: WorkflowServices;

	constructor(container: HTMLElement, nodeRegistry: NodeRegistry, services?: WorkflowServices) {
		this.container = container;
		this.nodeRegistry = nodeRegistry;
		this.services = services;
	}

	/**
	 * Show panel for a node
	 */
	show(node: WorkflowNode): void {
		this.currentNode = node;
		this.container.removeClass('ia-hidden');
		this.render();
	}

	/**
	 * Hide panel
	 */
	hide(): void {
		this.container.addClass('ia-hidden');
		this.currentNode = null;
		this.events.emit('close', undefined);
	}

	/**
	 * Render panel
	 */
	private render(): void {
		if (!this.currentNode) return;

		const nodeDef = this.nodeRegistry.get(this.currentNode.type);
		if (!nodeDef) return;

		this.container.empty();

		// Header
		const header = this.container.createDiv('config-panel-header');

		const title = header.createDiv('config-panel-title');
		title.createSpan({ text: nodeDef.icon, cls: 'config-panel-icon' });
		title.createSpan({ text: this.currentNode.name, cls: 'config-panel-name' });

		const closeBtn = header.createEl('button', {
			text: '✕',
			cls: 'config-panel-close',
		});
		closeBtn.addEventListener('click', () => this.hide());

		// Create scrollable content wrapper
		const scrollContent = this.container.createDiv('config-panel-scroll-content');

		// Node info
		const info = scrollContent.createDiv('config-panel-info');
		info.createDiv('config-panel-info-label').setText('Type');
		info.createDiv('config-panel-info-value').setText(nodeDef.name);
		info.createDiv('config-panel-info-label').setText('Description');
		info.createDiv('config-panel-info-value').setText(nodeDef.description);

		// Form
		const form = scrollContent.createDiv('config-panel-form');

		for (const param of nodeDef.parameters) {
			this.renderParameter(form, param);
		}

		// Actions
		const actions = this.container.createDiv('config-panel-actions');

		const deleteBtn = actions.createEl('button', {
			text: 'Delete Node',
			cls: 'config-panel-btn config-panel-btn-danger',
		});
		deleteBtn.addEventListener('click', async () => {
			if (!this.services?.app || !this.currentNode) return;
			const confirmed = await showConfirm(
				this.services.app,
				`Are you sure you want to delete node "${this.currentNode.name}"?`
			);
			if (confirmed) {
				this.events.emit('delete', { nodeId: this.currentNode.id });
			}
		});
	}

	/**
	 * Render a parameter
	 */
	private renderParameter(container: HTMLElement, param: NodeParameter): void {
		const field = container.createDiv('config-panel-field');

		// Label
		const label = field.createEl('label', {
			text: param.label,
			cls: 'config-panel-field-label',
		});

		if (param.required) {
			label.createSpan({ text: ' *', cls: 'field-required' });
		}

		// Description
		if (param.description) {
			field.createDiv('config-panel-field-desc').setText(param.description);
		}

		// Input
		// Initialize config with default value if not present
		if (!(param.name in this.currentNode!.config)) {
			this.currentNode!.config[param.name] = param.default;
		}
		const value = this.currentNode!.config[param.name];

		switch (param.type) {
			case 'string':
				this.renderStringInput(field, param, value);
				break;
			case 'number':
				this.renderNumberInput(field, param, value);
				break;
			case 'boolean':
				this.renderBooleanInput(field, param, value);
				break;
			case 'select':
				this.renderSelectInput(field, param, value);
				break;
			case 'textarea':
				this.renderTextareaInput(field, param, value);
				break;
			case 'code':
				this.renderCodeInput(field, param, value);
				break;
			case 'json':
				this.renderJsonInput(field, param, value);
				break;
		}
	}

	/**
	 * Render string input
	 */
	private renderStringInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const input = container.createEl('input', {
			type: 'text',
			cls: 'config-panel-input',
			value: String(value || ''),
		});

		if (param.placeholder) {
			input.placeholder = param.placeholder;
		}

		input.addEventListener('input', () => {
			this.updateConfig(param.name, input.value);
		});
	}

	/**
	 * Render number input
	 */
	private renderNumberInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const input = container.createEl('input', {
			type: 'number',
			cls: 'config-panel-input',
			value: String(value || 0),
		});

		if (param.placeholder) {
			input.placeholder = param.placeholder;
		}

		input.addEventListener('input', () => {
			this.updateConfig(param.name, parseFloat(input.value) || 0);
		});
	}

	/**
	 * Render boolean input
	 */
	private renderBooleanInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const wrapper = container.createDiv('config-panel-checkbox-wrapper');

		const input = wrapper.createEl('input', {
			type: 'checkbox',
			cls: 'config-panel-checkbox',
		});
		input.checked = Boolean(value);

		const label = wrapper.createEl('label', {
			text: value ? 'Yes' : 'No',
			cls: 'config-panel-checkbox-label',
		});

		input.addEventListener('change', () => {
			label.setText(input.checked ? 'Yes' : 'No');
			this.updateConfig(param.name, input.checked);
		});
	}

	/**
	 * Render select input
	 */
	private renderSelectInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const select = container.createEl('select', {
			cls: 'config-panel-select',
		});

		// Get options - use dynamic models if param.name is 'model' and settings are available
		let options = param.options || [];
		if (param.name === 'model' && this.services?.settings?.llmConfigs) {
			// Build options from all LLM configurations' cached models
			options = [];
			for (const config of this.services.settings.llmConfigs) {
				if (config.cachedModels) {
					// Filter out disabled models
					const enabledModels = config.cachedModels.filter((model: any) => model.enabled !== false);
					for (const model of enabledModels) {
						// Avoid duplicates by checking if model is already added
						const existingOption = options.find(opt => opt.value === model.id);
						if (!existingOption) {
							options.push({
								label: model.name || model.id,
								value: model.id
							});
						}
					}
				}
			}
		}

		for (const option of options) {
			const optionEl = select.createEl('option', {
				value: option.value,
				text: option.label,
			});

			if (option.value === value) {
				optionEl.selected = true;
			}
		}

		select.addEventListener('change', () => {
			this.updateConfig(param.name, select.value);
		});
	}

	/**
	 * Render textarea input
	 */
	private renderTextareaInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const textarea = container.createEl('textarea', {
			cls: 'config-panel-textarea',
		});

		// Set value after creation (Obsidian's createEl doesn't handle value in options for textarea)
		textarea.value = String(value || '');

		if (param.placeholder) {
			textarea.placeholder = param.placeholder;
		}

		textarea.rows = 5;

		textarea.addEventListener('input', () => {
			this.updateConfig(param.name, textarea.value);
		});
	}

	/**
	 * Render code input
	 */
	private renderCodeInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const textarea = container.createEl('textarea', {
			cls: 'config-panel-textarea config-panel-code',
		});

		// Set value after creation (Obsidian's createEl doesn't handle value in options for textarea)
		textarea.value = String(value || '');

		if (param.placeholder) {
			textarea.placeholder = param.placeholder;
		}

		textarea.rows = 8;
		textarea.setCssProps({ 'font-family': 'monospace' });
		textarea.setCssProps({ 'font-size': '12px' });

		textarea.addEventListener('input', () => {
			this.updateConfig(param.name, textarea.value);
		});
	}

	/**
	 * Render JSON input
	 */
	private renderJsonInput(container: HTMLElement, param: NodeParameter, value: any): void {
		const textarea = container.createEl('textarea', {
			cls: 'config-panel-textarea config-panel-code',
		});

		// Pretty print JSON
		try {
			const jsonValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
			textarea.value = jsonValue;
		} catch (error) {
			textarea.value = String(value || '{}');
		}

		textarea.rows = 8;
		textarea.setCssProps({ 'font-family': 'monospace' });
		textarea.setCssProps({ 'font-size': '12px' });

		// Validate JSON on input
		let validationTimeout: NodeJS.Timeout;
		textarea.addEventListener('input', () => {
			clearTimeout(validationTimeout);
			validationTimeout = setTimeout(() => {
				try {
					const parsed = JSON.parse(textarea.value);
					textarea.setCssProps({ 'border-color': '' });
					this.updateConfig(param.name, parsed);
				} catch (error) {
					textarea.setCssProps({ 'border-color': '#ef4444' });
				}
			}, 500);
		});
	}

	/**
	 * Update config
	 */
	private updateConfig(key: string, value: any): void {
		if (!this.currentNode) return;

		this.currentNode.config[key] = value;
		this.events.emit('update', {
			nodeId: this.currentNode.id,
			config: this.currentNode.config,
		});
	}

	/**
	 * Event listeners
	 */
	on<K extends keyof PanelEvents>(event: K, handler: (data: PanelEvents[K]) => void): void {
		this.events.on(event, handler);
	}

	/**
	 * Destroy panel
	 */
	destroy(): void {
		this.events.clear();
		this.container.empty();
	}
}
