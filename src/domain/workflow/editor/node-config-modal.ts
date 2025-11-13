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

/**
 * Modal events
 */
interface ModalEvents {
  'update': { nodeId: string; config: Record<string, any> };
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
  private formConfig: Record<string, any> = {};
  private originalConfig: Record<string, any> = {};

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
    this.setTitle(`${nodeDef.icon} ${this.node.name}`);

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
    header.createSpan({ text: 'Available Variables', cls: 'modal-variables-title' });

    // Description
    const desc = variablesSection.createDiv('modal-variables-desc');
    desc.setText('You can use these variables in your configuration using {{variableName}} syntax:');

    // Variables list
    const list = variablesSection.createDiv('modal-variables-list');

    // Common variables
    const commonVars = [
      { name: 'data', desc: 'All input data as JSON' },
      { name: 'input', desc: 'Alias for {{data}}' },
    ];

    // Get actual fields from execution context if available
    const exampleFields: Array<{ name: string; source: string }> = [];

    // Check if we have execution context from the workflow services
    // This would give us real field names from actual execution
    const executionContext = (this.services as any)?.executionContext;
    const actualFields: string[] = [];

    // Try to get actual output fields from previous nodes if execution data exists
    if (executionContext?.outputs) {
      for (const prevNode of previousNodes) {
        const outputs = executionContext.outputs.get(prevNode.id);
        if (outputs && outputs.length > 0 && outputs[0].json) {
          const fields = Object.keys(outputs[0].json);
          for (const field of fields) {
            if (!actualFields.includes(field)) {
              actualFields.push(field);
              exampleFields.push({ name: field, source: prevNode.name });
            }
          }
        }
      }
    }

    // If no execution data, provide accurate examples based on node type
    if (actualFields.length === 0) {
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
              exampleFields.push({ name: fieldName, source: prevNode.name });
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
              exampleFields.push({ name: fieldName, source: prevNode.name });
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
        navigator.clipboard.writeText(`{{${variable.name}}}`);
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
          navigator.clipboard.writeText(`{{${field.name}}}`);
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

  private renderStringInput(container: HTMLElement, param: NodeParameter, value: any): void {
    const input = container.createEl('input', {
      type: 'text',
      cls: 'modal-input',
      value: String(value || ''),
    });

    if (param.placeholder) {
      input.placeholder = param.placeholder;
    }

    input.addEventListener('input', () => {
      this.updateFormConfig(param.name, input.value);
    });
  }

  private renderNumberInput(container: HTMLElement, param: NodeParameter, value: any): void {
    const input = container.createEl('input', {
      type: 'number',
      cls: 'modal-input',
      value: String(value || 0),
    });

    if (param.placeholder) {
      input.placeholder = param.placeholder;
    }

    input.addEventListener('input', () => {
      this.updateFormConfig(param.name, parseFloat(input.value) || 0);
    });
  }

  private renderBooleanInput(container: HTMLElement, param: NodeParameter, value: any): void {
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

  private async renderSelectInput(container: HTMLElement, param: NodeParameter, value: any): Promise<void> {
    console.debug('[NodeConfigModal] renderSelectInput called for param:', param.name, param);

    const select = container.createEl('select', {
      cls: 'modal-select',
    });

    // Get options - prefer getOptions() if available, otherwise use param.options
    let options = param.options || [];
    console.debug('[NodeConfigModal] Initial options for', param.name, ':', options);

    // If param has getOptions method, use it (for dynamic options like model list)
    if (param.getOptions && typeof param.getOptions === 'function') {
      try {
        options = await param.getOptions();
      } catch (error) {
        console.error('[NodeConfigModal] Failed to get dynamic options:', error);
        // Fall back to static options
        options = param.options || [];
      }
    }
    // Fallback: use dynamic models from settings if param.name is 'model' and no options
    else if (param.name === 'model' && options.length === 0 && this.services?.settings?.llmConfigs) {
      // Build options from all LLM configurations' cached models
      options = [];
      for (const config of this.services.settings.llmConfigs) {
        if (config.cachedModels) {
          // Filter out disabled models
          const enabledModels = config.cachedModels.filter((model: any) => model.enabled !== false);
          for (const model of enabledModels) {
            // Build value with provider prefix
            const modelValue = model.id.includes(':') ? model.id : `${config.provider}:${model.id}`;
            // Avoid duplicates by checking if model is already added
            const existingOption = options.find((opt: any) => opt.value === modelValue);
            if (!existingOption) {
              options.push({
                label: model.name || model.id,
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
        options = this.services.settings.agents.map((agent: any) => ({
          label: `${agent.icon || '🤖'} ${agent.name}`,
          value: agent.id
        }));
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

    let valueFound = false;
    for (const option of options) {
      const optionEl = select.createEl('option', {
        value: option.value,
        text: option.label,
      });

      if (option.value === value) {
        optionEl.selected = true;
        valueFound = true;
      }
    }

    // If value not found in options but value exists, add it as an option
    if (!valueFound && value) {
      const customOptionEl = select.createEl('option', {
        value: value,
        text: `${value} (custom)`,
      });
      customOptionEl.selected = true;
    }

    select.addEventListener('change', () => {
      this.updateFormConfig(param.name, select.value);
    });
  }

  private renderTextareaInput(container: HTMLElement, param: NodeParameter, value: any): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea',
    });

    // Set value after creation (Obsidian's createEl doesn't handle value in options for textarea)
    textarea.value = String(value || '');

    if (param.placeholder) {
      textarea.placeholder = param.placeholder;
    }

    textarea.rows = 5;

    textarea.addEventListener('input', () => {
      this.updateFormConfig(param.name, textarea.value);
    });
  }

  private renderCodeInput(container: HTMLElement, param: NodeParameter, value: any): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea modal-code',
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
      this.updateFormConfig(param.name, textarea.value);
    });
  }

  private renderJsonInput(container: HTMLElement, param: NodeParameter, value: any): void {
    const textarea = container.createEl('textarea', {
      cls: 'modal-textarea modal-code',
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
          this.updateFormConfig(param.name, parsed);
        } catch (error) {
          textarea.setCssProps({ 'border-color': '#ef4444' });
        }
      }, 500);
    });
  }

  private updateFormConfig(key: string, value: any): void {
    this.formConfig[key] = value;
  }

  private saveAndClose(): void {
    // Create a clean copy of the config to emit
    const updatedConfig = { ...this.formConfig };

    // For Start node, parse the input JSON and extract field names
    const nodeDef = this.nodeRegistry.get(this.node.type);
    if (nodeDef?.type === 'start' && updatedConfig.input) {
      try {
        const inputData = typeof updatedConfig.input === 'string'
          ? JSON.parse(updatedConfig.input)
          : updatedConfig.input;

        // Extract field names from the parsed JSON
        const fieldNames = Object.keys(inputData);

        // Store the parsed fields in a metadata field
        updatedConfig._parsedOutputFields = fieldNames;
      } catch (error) {
        // If JSON parsing fails, clear the metadata
        updatedConfig._parsedOutputFields = [];
      }
    }

    // For Transform node, try to extract return statement fields
    if (nodeDef?.type === 'transform' && updatedConfig.code) {
      try {
        const code = updatedConfig.code;
        // Try to extract field names from return statements like: return { field1, field2, ... }
        const returnMatch = code.match(/return\s*\{([^}]+)\}/);
        if (returnMatch) {
          const fieldStr = returnMatch[1];
          const fields = fieldStr.split(',').map((f: string) => {
            // Handle both "key: value" and "key" shorthand
            const match = f.trim().match(/^(\w+)\s*:/);
            return match ? match[1] : f.trim().split(/\s+/)[0];
          }).filter((f: string) => f && !f.includes('(') && !f.includes('.')); // Filter out function calls

          if (fields.length > 0) {
            updatedConfig._parsedOutputFields = fields;
          }
        }
      } catch (error) {
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

  on<K extends keyof ModalEvents>(event: K, handler: (data: ModalEvents[K]) => void): void {
    this.events.on(event, handler);
  }
}
