/**
 * Workflow System V2 - Node Configuration Modal
 *
 * A modal-based configuration system similar to n8n for editing node parameters.
 * Provides better UX for nodes with many parameters or long option lists.
 */

import { Modal, App } from 'obsidian';
import { WorkflowNode, NodeParameter, WorkflowServices } from '../core/types';
import { NodeRegistry } from '../nodes/registry';
import { EventEmitter } from './event-emitter';
import { WorkflowGraph } from '../core/workflow';
import { isRecord } from '@/types/type-utils';

/**
 * Modal events
 */
interface ModalEvents extends Record<string, unknown> {
	'update': { nodeId: string; config: Record<string, unknown> };
	'close': void;
}

/**
 * Node configuration modal - opens in a modal dialog
 */
export class NodeConfigModal extends Modal {
  private node: WorkflowNode;
  private nodeRegistry: NodeRegistry;
  private workflow?: WorkflowGraph;
  private services?: WorkflowServices;
  private events = new EventEmitter<ModalEvents>();

  // Form state
  private formConfig: Record<string, unknown> = {};
  private originalConfig: Record<string, unknown> = {};

  constructor(
    app: App,
    node: WorkflowNode,
    nodeRegistry: NodeRegistry,
    workflow?: WorkflowGraph,
    services?: WorkflowServices
  ) {
    super(app);
    this.node = node;
    this.nodeRegistry = nodeRegistry;
    this.workflow = workflow;
    this.services = services;

    // Initialize form config with node config
    this.formConfig = { ...node.config };
    this.originalConfig = { ...node.config };
  }

	async onOpen() {
		const { contentEl } = this;

    console.debug('[NodeConfigModal] onOpen - node type:', this.node.type, 'name:', this.node.name);
    console.debug('[NodeConfigModal] Services available:', !!this.services);
    console.debug('[NodeConfigModal] Settings available:', !!this.services?.settings);

    const nodeDef = this.nodeRegistry.get(this.node.type);
    if (!nodeDef) return;

    console.debug('[NodeConfigModal] NodeDef found:', nodeDef.name, 'parameters:', nodeDef.parameters.length);

    // Set modal title using Obsidian's API (this uses the existing modal-title element)
    this.setTitle(`${nodeDef.icon ?? ''} ${this.node.name}`);

    // Add our custom class to contentEl only
    contentEl.addClass('node-config-modal-content');

    await this.render();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.removeClass('node-config-modal-content');
    this.events.emit('close', undefined);
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();

    console.debug('[NodeConfigModal] render() called');

    const nodeDef = this.nodeRegistry.get(this.node.type);
    if (!nodeDef) return;

    // Create scrollable content area (no need to duplicate header)
    const scrollArea = contentEl.createDiv('modal-content-scroll-area');

    // Node info
    const info = scrollArea.createDiv('modal-node-info');
    info.createDiv('modal-info-label').setText('Type');
    info.createDiv('modal-info-value').setText(nodeDef.name);
    info.createDiv('modal-info-label').setText('Description');
    info.createDiv('modal-info-value').setText(nodeDef.description);

    // Available variables section
    if (this.workflow) {
      this.renderAvailableVariables(scrollArea);
    }

    // Form container
    const form = scrollArea.createDiv('modal-config-form');

    // Render parameters sequentially to handle async select inputs
    for (const param of nodeDef.parameters) {
      await this.renderParameter(form, param);
    }

    // Action buttons
    const actions = contentEl.createDiv('modal-actions');
    
    const cancelButton = actions.createEl('button', {
      text: 'Cancel',
      cls: 'modal-button modal-button-secondary'
    });
    cancelButton.addEventListener('click', () => {
      // Restore original config if changed
      this.formConfig = { ...this.originalConfig };
      this.close();
    });

    const saveButton = actions.createEl('button', {
      text: 'Save',
      cls: 'modal-button modal-button-primary'
    });
    saveButton.addEventListener('click', () => {
      this.saveAndClose();
    });

    // Add Enter key support for saving
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.saveAndClose();
      }
    });
  }

  /**
   * Render available variables section
   */
  private renderAvailableVariables(container: HTMLElement): void {
    if (!this.workflow) return;

    // Get previous nodes
    const previousNodes = this.workflow.getPreviousNodes(this.node.id);
    if (previousNodes.length === 0) return;

    // Create variables section
    const variablesSection = container.createDiv('modal-variables-section');

    // Header
    const header = variablesSection.createDiv('modal-variables-header');
    header.createSpan({ text: '💡 ', cls: 'modal-variables-icon' });
    header.createSpan({ text: 'Available variables', cls: 'modal-variables-title' });

    // Description
    const desc = variablesSection.createDiv('modal-variables-desc');
    desc.setText('You can use these variables in your configuration using {{variablename}} syntax:');

    // Variables list
    const list = variablesSection.createDiv('modal-variables-list');

    // Common variables
    const commonVars = [
      { name: 'data', desc: 'All input data as JSON' },
      { name: 'input', desc: 'Alias for {{data}}' },
    ];

    const exampleFields: Array<{ name: string; source: string }> = [];

    for (const prevNode of previousNodes) {
      const prevNodeDef = this.nodeRegistry.get(prevNode.type);

      if (prevNodeDef?.type === 'llm') {
        // AI Chat node outputs: response, model, prompt, systemPrompt
        exampleFields.push(
          { name: 'response', source: prevNode.name },
          { name: 'model', source: prevNode.name },
          { name: 'prompt', source: prevNode.name },
          { name: 'systemPrompt', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'agent') {
        // Agent node outputs: response, agentId, agentName, model, conversationId
        exampleFields.push(
          { name: 'response', source: prevNode.name },
          { name: 'agentId', source: prevNode.name },
          { name: 'agentName', source: prevNode.name },
          { name: 'model', source: prevNode.name },
          { name: 'conversationId', source: prevNode.name },
          { name: 'messageLength', source: prevNode.name },
          { name: 'responseLength', source: prevNode.name },
          { name: 'timestamp', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'start') {
        // Check if Start node has parsed output fields from its JSON config
        const parsedFields = prevNode.config._parsedOutputFields;
        if (parsedFields && Array.isArray(parsedFields) && parsedFields.length > 0) {
          // Show actual parsed fields from the Start node's JSON input
          for (const fieldName of parsedFields) {
            const safeName = typeof fieldName === 'string' ? fieldName : String(fieldName ?? '');
            const sourceName = typeof prevNode.name === 'string' ? prevNode.name : String(prevNode.name ?? '');
            exampleFields.push({ name: safeName, source: sourceName });
          }
        } else {
          // Start node: outputs depend on user input, show note
          exampleFields.push({ name: '(depends on input - configure Start node first)', source: prevNode.name });
        }
      } else if (prevNodeDef?.type === 'transform') {
        // Check if Transform node has parsed output fields
        const parsedFields = prevNode.config._parsedOutputFields;
        if (parsedFields && Array.isArray(parsedFields) && parsedFields.length > 0) {
          // Show parsed fields from the Transform node's return statement
          for (const fieldName of parsedFields) {
            const safeName = typeof fieldName === 'string' ? fieldName : String(fieldName ?? '');
            const sourceName = typeof prevNode.name === 'string' ? prevNode.name : String(prevNode.name ?? '');
            exampleFields.push({ name: safeName, source: sourceName });
          }
        } else {
          // Transform node: outputs depend on code
          exampleFields.push({ name: '(depends on transform code)', source: prevNode.name });
        }
      } else if (prevNodeDef?.type === 'httpRequest') {
        exampleFields.push(
          { name: 'status', source: prevNode.name },
          { name: 'data', source: prevNode.name },
          { name: 'url', source: prevNode.name },
          { name: 'method', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'createNote') {
        exampleFields.push(
          { name: 'path', source: prevNode.name },
          { name: 'created', source: prevNode.name },
          { name: 'timestamp', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'readNote') {
        exampleFields.push(
          { name: 'content', source: prevNode.name },
          { name: 'fullContent', source: prevNode.name },
          { name: 'frontmatter', source: prevNode.name },
          { name: 'path', source: prevNode.name },
          { name: 'name', source: prevNode.name },
          { name: 'basename', source: prevNode.name },
          { name: 'tags', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'updateNote') {
        exampleFields.push(
          { name: 'path', source: prevNode.name },
          { name: 'updated', source: prevNode.name },
          { name: 'mode', source: prevNode.name },
          { name: 'timestamp', source: prevNode.name },
          { name: 'previousLength', source: prevNode.name },
          { name: 'newLength', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'searchNotes') {
        exampleFields.push(
          { name: 'results', source: prevNode.name },
          { name: 'count', source: prevNode.name },
          { name: 'totalMatches', source: prevNode.name },
          { name: 'query', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'dailyNote') {
        exampleFields.push(
          { name: 'path', source: prevNode.name },
          { name: 'date', source: prevNode.name },
          { name: 'fullDate', source: prevNode.name },
          { name: 'content', source: prevNode.name },
          { name: 'isNew', source: prevNode.name },
          { name: 'timestamp', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'loop') {
        exampleFields.push(
          { name: 'item', source: prevNode.name },
          { name: 'index', source: prevNode.name },
          { name: 'total', source: prevNode.name },
          { name: 'isFirst', source: prevNode.name },
          { name: 'isLast', source: prevNode.name },
          { name: 'iteration', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'switch') {
        exampleFields.push(
          { name: '_route', source: prevNode.name },
          { name: '_matched', source: prevNode.name },
          { name: '_fieldValue', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'split') {
        exampleFields.push(
          { name: 'item', source: prevNode.name },
          { name: 'text', source: prevNode.name },
          { name: 'index', source: prevNode.name },
          { name: 'total', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'aggregate') {
        exampleFields.push(
          { name: 'result', source: prevNode.name },
          { name: 'operation', source: prevNode.name },
          { name: 'count', source: prevNode.name },
          { name: 'fieldName', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'setVariables') {
        exampleFields.push(
          { name: '(depends on configured variables)', source: prevNode.name }
        );
      } else if (prevNodeDef?.type === 'delay') {
        exampleFields.push(
          { name: 'delayedMs', source: prevNode.name },
          { name: 'delayedAt', source: prevNode.name }
        );
      }
    }

    // Remove duplicates by name
    const uniqueFields = Array.from(
      new Map(exampleFields.map(f => [f.name, f])).values()
    );

    // Render common variables
    for (const variable of commonVars) {
      const varItem = list.createDiv('modal-variable-item');
      const varCode = varItem.createEl('code', {
        text: `{{${variable.name}}}`,
        cls: 'modal-variable-code'
      });
      varItem.createSpan({ text: ` - ${variable.desc}`, cls: 'modal-variable-desc' });

      // Make it copyable
      varCode.addClass('ia-clickable');
      varCode.title = 'Click to copy';
      varCode.addEventListener('click', () => {
        void navigator.clipboard
          .writeText(`{{${variable.name}}}`)
          .catch(error => console.error('Failed to copy variable', error));
        varCode.setCssProps({ 'background-color': '#10b981' });
        setTimeout(() => {
          varCode.setCssProps({ 'background-color': '' });
        }, 200);
      });
    }

    // Render example field variables if any
    if (uniqueFields.length > 0) {
      const exampleHeader = list.createDiv('modal-variable-subheader');
      exampleHeader.setText('Fields from previous nodes:');

      for (const field of uniqueFields) {
        // Skip placeholder entries for dynamic nodes
        if (field.name.startsWith('(')) {
          const noteItem = list.createDiv('modal-variable-item');
          noteItem.createSpan({
            text: `${field.source}: ${field.name}`,
            cls: 'modal-variable-desc',
            attr: { style: 'font-style: italic; color: var(--text-muted);' }
          });
          continue;
        }

        const varItem = list.createDiv('modal-variable-item');
        const varCode = varItem.createEl('code', {
          text: `{{${field.name}}}`,
          cls: 'modal-variable-code'
        });
        varItem.createSpan({
          text: ` - ${field.name} from ${field.source}`,
          cls: 'modal-variable-desc'
        });

        // Make it copyable
        varCode.addClass('ia-clickable');
        varCode.title = 'Click to copy';
        varCode.addEventListener('click', () => {
          void navigator.clipboard
            .writeText(`{{${field.name}}}`)
            .catch(error => console.error('Failed to copy variable', error));
          varCode.setCssProps({ 'background-color': '#10b981' });
          setTimeout(() => {
            varCode.setCssProps({ 'background-color': '' });
          }, 200);
        });
      }
    }

    // Show connected nodes
    if (previousNodes.length > 0) {
      const connectedHeader = list.createDiv('modal-variable-subheader');
      connectedHeader.setText('Connected nodes:');

      for (const prevNode of previousNodes) {
        const prevNodeDef = this.nodeRegistry.get(prevNode.type);
        if (!prevNodeDef) continue;

        const nodeItem = list.createDiv('modal-variable-node-item');
        nodeItem.createSpan({ text: prevNodeDef.icon, cls: 'modal-variable-node-icon' });
        nodeItem.createSpan({ text: prevNode.name, cls: 'modal-variable-node-name' });
      }
    }
  }

  private async renderParameter(container: HTMLElement, param: NodeParameter): Promise<void> {
    console.debug('[NodeConfigModal] renderParameter for:', param.name, 'type:', param.type);

    const field = container.createDiv('modal-config-field');

    // Label with required indicator
    const labelContainer = field.createDiv('modal-field-label-container');
    const label = labelContainer.createEl('label', {
      text: param.label,
      cls: 'modal-field-label'
    });

    if (param.required) {
      label.createSpan({ text: ' *', cls: 'field-required' });
    }

    // Description
    if (param.description) {
      field.createDiv('modal-field-desc').setText(param.description);
    }

    // Input field based on type
    // Initialize formConfig with default value if not present
    if (!(param.name in this.formConfig)) {
      this.formConfig[param.name] = param.default;
    }
    const value = this.formConfig[param.name];

    console.debug('[NodeConfigModal] Rendering param type:', param.type, 'for', param.name);

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
        await this.renderSelectInput(field, param, value);
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

  private renderStringInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const input = container.createEl('input', {
      type: 'text',
      cls: 'modal-input',
      value: this.toInputString(value),
    });

    if (param.placeholder) {
      input.placeholder = param.placeholder;
    }

    input.addEventListener('input', () => {
      this.updateFormConfig(param.name, input.value);
    });
  }

  private renderNumberInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const numericValue = typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number(value ?? 0);
    const input = container.createEl('input', {
      type: 'number',
      cls: 'modal-input',
      value: Number.isFinite(numericValue) ? String(numericValue) : '0',
    });

    if (param.placeholder) {
      input.placeholder = param.placeholder;
    }

    input.addEventListener('input', () => {
      this.updateFormConfig(param.name, parseFloat(input.value) || 0);
    });
  }

  private renderBooleanInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const wrapper = container.createDiv('modal-checkbox-wrapper');

    const input = wrapper.createEl('input', {
      type: 'checkbox',
      cls: 'modal-checkbox',
    });
    input.checked = Boolean(value);

    const label = wrapper.createEl('label', {
      text: value ? 'Yes' : 'No',
      cls: 'modal-checkbox-label',
    });

    input.addEventListener('change', () => {
      label.setText(input.checked ? 'Yes' : 'No');
      this.updateFormConfig(param.name, input.checked);
    });
  }

  private async renderSelectInput(container: HTMLElement, param: NodeParameter, value: unknown): Promise<void> {
    console.debug('[NodeConfigModal] renderSelectInput called for param:', param.name, param);

    const select = container.createEl('select', {
      cls: 'modal-select',
    });

    // Get options - prefer getOptions() if available, otherwise use param.options
    let options: Array<{ label: string; value: string }> =
      Array.isArray(param.options)
        ? param.options.map((opt: unknown) => {
            if (isRecord(opt)) {
              const label = typeof opt.label === 'string' ? opt.label : this.toInputString(opt.label);
              const value = typeof opt.value === 'string' ? opt.value : this.toInputString(opt.value);
              return { label, value };
            }
            const str = this.toInputString(opt);
            return { label: str, value: str };
          })
        : [];
    console.debug('[NodeConfigModal] Initial options for', param.name, ':', options);

    // If param has getOptions method, use it (for dynamic options like model list)
    if (param.getOptions && typeof param.getOptions === 'function') {
      try {
        const dynamicOptions = await param.getOptions();
        options = Array.isArray(dynamicOptions)
          ? dynamicOptions.map((opt: unknown) => {
              if (isRecord(opt)) {
                const label = typeof opt.label === 'string' ? opt.label : this.toInputString(opt.label);
                const value = typeof opt.value === 'string' ? opt.value : this.toInputString(opt.value);
                return { label, value };
              }
              const str = this.toInputString(opt);
              return { label: str, value: str };
            })
          : options;
      } catch (error) {
        console.error('[NodeConfigModal] Failed to get dynamic options:', error);
        // Fall back to static options
        options = Array.isArray(param.options)
          ? param.options.map((opt: unknown) => {
              if (isRecord(opt)) {
                const label = typeof opt.label === 'string' ? opt.label : this.toInputString(opt.label);
                const value = typeof opt.value === 'string' ? opt.value : this.toInputString(opt.value);
                return { label, value };
              }
              const str = this.toInputString(opt);
              return { label: str, value: str };
            })
          : [];
      }
    }
    // Fallback: use dynamic models from settings if param.name is 'model' and no options
    else if (param.name === 'model' && options.length === 0 && this.services?.settings?.llmConfigs) {
      // Build options from all LLM configurations' cached models
      options = [];
      for (const config of this.services.settings.llmConfigs) {
        if (config.cachedModels) {
          // Filter out disabled models
          const enabledModels = config.cachedModels.filter((model: unknown) => {
            return isRecord(model) && model.enabled !== false;
          });
          for (const model of enabledModels) {
            if (!isRecord(model)) continue;
            // Build value with provider prefix
            const modelId = typeof model.id === 'string' ? model.id : String(model.id);
            const modelValue = modelId.includes(':') ? modelId : `${config.provider ?? ''}:${modelId}`;
            // Avoid duplicates by checking if model is already added
            const existingOption = options.find((opt: unknown) => {
              return isRecord(opt) && opt.value === modelValue;
            });
            if (!existingOption) {
              const modelName = typeof model.name === 'string' ? model.name : modelId;
              options.push({
                label: modelName,
                value: modelValue
              });
            }
          }
        }
      }
    }
    // Fallback: use dynamic agents from settings if param.name is 'agentId' and no options
    else if (param.name === 'agentId' && options.length === 0) {
      console.debug('[NodeConfigModal] Loading agents from settings...');
      console.debug('[NodeConfigModal] Services:', !!this.services);
      console.debug('[NodeConfigModal] Settings:', !!this.services?.settings);
      console.debug('[NodeConfigModal] Agents:', this.services?.settings?.agents);

      if (this.services?.settings?.agents && this.services.settings.agents.length > 0) {
        // Build options from agents in settings
        options = this.services.settings.agents.map((agent: unknown) => {
          if (!isRecord(agent)) {
            return { label: 'Invalid agent', value: '' };
          }
          const agentIcon = typeof agent.icon === 'string' ? agent.icon : '🤖';
          const agentName = typeof agent.name === 'string' ? agent.name : 'Unknown';
          const agentId = typeof agent.id === 'string' ? agent.id : '';
          return {
            label: `${agentIcon} ${agentName}`,
            value: agentId
          };
        });
        console.debug('[NodeConfigModal] Loaded agents:', options);
      } else {
        // No agents available - show helpful message
        options = [{
          label: '⚠️ No agents configured - Please create an agent in settings first',
          value: ''
        }];
        console.warn('[NodeConfigModal] No agents found in settings');
      }
    }

    const currentValue = this.toInputString(value);
    let valueFound = false;
    for (const option of options) {
      const optionValue = this.toInputString(option.value);
      const optionEl = select.createEl('option', {
        value: optionValue,
        text: typeof option.label === 'string' ? option.label : this.toInputString(option.label),
      });

      if (optionValue === currentValue) {
        optionEl.selected = true;
        valueFound = true;
      }
    }

    // If value not found in options but value exists, add it as an option
    if (!valueFound && currentValue) {
      const customOptionEl = select.createEl('option', {
        value: currentValue,
        text: `${currentValue} (custom)`,
      });
      customOptionEl.selected = true;
    }

    select.addEventListener('change', () => {
      this.updateFormConfig(param.name, select.value);
    });
  }

  private renderTextareaInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea',
    });

    // Set value after creation (Obsidian's createEl doesn't handle value in options for textarea)
    textarea.value = this.toInputString(value);

    if (param.placeholder) {
      textarea.placeholder = param.placeholder;
    }

    textarea.rows = 5;

    textarea.addEventListener('input', () => {
      this.updateFormConfig(param.name, textarea.value);
    });
  }

  private renderCodeInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea modal-code',
    });

    // Set value after creation (Obsidian's createEl doesn't handle value in options for textarea)
    textarea.value = this.toInputString(value);

    if (param.placeholder) {
      textarea.placeholder = param.placeholder;
    }

    textarea.rows = 8;
    textarea.setCssProps({ 'font-family': 'monospace' });
    textarea.setCssProps({ 'font-size': '12px' });

    textarea.addEventListener('input', () => {
      this.updateFormConfig(param.name, textarea.value);
    });
  }

  private renderJsonInput(container: HTMLElement, param: NodeParameter, value: unknown): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea modal-code',
    });

    // Pretty print JSON
    try {
      const jsonValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      textarea.value = jsonValue;
    } catch (error) {
      void error;
      textarea.value = this.toInputString(value, '{}');
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
          const parsed = JSON.parse(textarea.value) as unknown;
          textarea.setCssProps({ 'border-color': '' });
          this.updateFormConfig(param.name, parsed);
        } catch (error) {
          void error;
          textarea.setCssProps({ 'border-color': '#ef4444' });
        }
      }, 500);
    });
  }

  private updateFormConfig(key: string, value: unknown): void {
    this.formConfig[key] = value;
  }

  private saveAndClose(): void {
    // Create a clean copy of the config to emit
    const updatedConfig = { ...this.formConfig };

    // For Start node, parse the input JSON and extract field names
    const nodeDef = this.nodeRegistry.get(this.node.type);
    if (nodeDef?.type === 'start' && updatedConfig.input) {
      try {
        const rawInput = updatedConfig.input;
        const inputData = typeof rawInput === 'string' ? (JSON.parse(rawInput) as unknown) : rawInput;
        const fieldNames = isRecord(inputData) ? Object.keys(inputData) : [];
        updatedConfig._parsedOutputFields = fieldNames;
      } catch (error) {
        void error;
        // If JSON parsing fails, clear the metadata
        updatedConfig._parsedOutputFields = [];
      }
    }

    // For Transform node, try to extract return statement fields
    if (nodeDef?.type === 'transform' && typeof updatedConfig.code === 'string') {
      try {
        const code = String(updatedConfig.code);
        // Try to extract field names from return statements like: return { field1, field2, ... }
        const returnMatch = code.match(/return\s*\{([^}]+)\}/);
        if (returnMatch) {
          const fieldStr = returnMatch[1];
          const fields = fieldStr.split(',').map((f: string) => {
            // Handle both "key: value" and "key" shorthand
            const match = f.trim().match(/^(\w+)\s*:/);
            return match ? match[1] ?? '' : f.trim().split(/\s+/)[0] ?? '';
          }).filter((f: string) => f && !f.includes('(') && !f.includes('.')); // Filter out function calls

          if (fields.length > 0) {
            updatedConfig._parsedOutputFields = fields;
          }
        }
      } catch (error: unknown) {
        // Ignore errors in code parsing
        console.debug('Error parsing transform code:', error);
        // Ignore errors in code parsing
      }
    }

    // Emit update event with the new config
    this.events.emit('update', {
      nodeId: this.node.id,
      config: updatedConfig,
    });

    // Close modal
    this.close();
  }

  on<K extends keyof ModalEvents>(event: K, handler: (_data: ModalEvents[K]) => void): void {
    this.events.on(event, handler);
  }

  private toInputString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}
