import { Notice } from 'obsidian';
import { t } from '@/i18n';
import type { ToolRegistry, ToolParameter } from '@/features/tools';
import { errorMessage } from '@/core/utils/errors';
import { getConnectedMcpServers, getToolsByProviderKey } from './mcp-inspector-data';
import { parseToolArguments, type ArgumentField } from './mcp-tool-arguments';

type ParamInput = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function renderMcpToolTester(container: HTMLElement, registry: ToolRegistry): void {
	const section = container.createDiv('ia-mcpi-test-section');
	section.createEl('h4', { text: t('modals.mcpInspector.logs.testTitle') });

	const selectionRow = section.createDiv('ia-mcpi-selection-row');
	const serverSelect = selectionRow.createEl('select', { cls: 'ia-mcpi-select--flex' });
	serverSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectServer'), value: '' });
	for (const serverName of getConnectedMcpServers(registry)) {
		serverSelect.createEl('option', { text: serverName, value: serverName });
	}
	const toolSelect = selectionRow.createEl('select', { cls: 'ia-mcpi-select--flex' });
	toolSelect.disabled = true;
	toolSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectTool'), value: '' });

	const paramsContainer = section.createDiv('ia-hidden ia-mcpi-params-box');
	let inputs: Array<{ param: ToolParameter; input: ParamInput }> = [];

	const buttonsRow = section.createDiv('ia-mcpi-buttons-row');
	const runButton = buttonsRow.createEl('button', { text: t('modals.mcpInspector.logs.performBtn'), cls: 'ia-button ia-button--primary' });
	runButton.disabled = true;
	const clearButton = buttonsRow.createEl('button', { text: t('modals.mcpInspector.logs.clearBtn'), cls: 'ia-button ia-button--ghost' });
	const resultContainer = section.createDiv('ia-hidden ia-mcpi-result-container');

	serverSelect.addEventListener('change', () => {
		toolSelect.empty();
		toolSelect.disabled = !serverSelect.value;
		runButton.disabled = true;
		paramsContainer.addClass('ia-hidden');
		paramsContainer.empty();
		inputs = [];
		if (!serverSelect.value) return;

		toolSelect.createEl('option', { text: t('modals.mcpInspector.logs.selectTool'), value: '' });
		for (const tool of getToolsByProviderKey(registry).get(`mcp:${serverSelect.value}`) ?? []) {
			toolSelect.createEl('option', { text: tool.definition.name, value: tool.llmName });
		}
	});

	toolSelect.addEventListener('change', () => {
		runButton.disabled = !toolSelect.value;
		paramsContainer.empty();
		paramsContainer.addClass('ia-hidden');
		inputs = [];
		const parameters = toolSelect.value ? registry.getToolByLlmName(toolSelect.value)?.definition.parameters ?? [] : [];
		if (parameters.length === 0) return;

		paramsContainer.removeClass('ia-hidden');
		paramsContainer.createEl('h5', { text: t('modals.mcpInspector.logs.parametersTitle') });
		inputs = parameters.map(param => ({ param, input: renderParameterInput(paramsContainer, param) }));
	});

	runButton.addEventListener('click', () => {
		if (!toolSelect.value) return;
		const parsed = parseToolArguments(inputs.map(({ param, input }) => toField(param, input)));
		if (!parsed.ok) {
			new Notice(t(`modals.mcpInspector.logs.notices.${parsed.problem}`, { name: parsed.name }));
			return;
		}
		runButton.disabled = true;
		runButton.textContent = t('modals.mcpInspector.logs.executing');
		resultContainer.addClass('ia-hidden');
		void registry.executeTool(toolSelect.value, parsed.args)
			.then(result => {
				showResult(resultContainer, result);
				new Notice(result.success ? t('modals.mcpInspector.logs.notices.success') : t('modals.mcpInspector.logs.notices.failed'));
			}, (error: unknown) => {
				showError(resultContainer, errorMessage(error));
				new Notice(t('modals.mcpInspector.logs.notices.error', { message: errorMessage(error) }));
			})
			.finally(() => {
				runButton.disabled = false;
				runButton.textContent = t('modals.mcpInspector.logs.performBtn');
			});
	});

	clearButton.addEventListener('click', () => {
		resultContainer.empty();
		resultContainer.addClass('ia-hidden');
	});
}

function renderParameterInput(container: HTMLElement, param: ToolParameter): ParamInput {
	const row = container.createDiv('ia-mcpi-param-row');
	row.createEl('label', { cls: 'ia-mcpi-param-label', text: `${param.name}${param.required ? ' *' : ''}` });
	if (param.description) {
		row.createDiv({ cls: 'ia-mcpi-param-desc', text: param.description });
	}

	let input: ParamInput;
	if (param.enum) {
		input = row.createEl('select');
		input.createEl('option', { text: t('modals.mcpInspector.logs.selectEnum'), value: '' });
		for (const option of param.enum) {
			input.createEl('option', { text: option, value: option });
		}
	} else if (param.type === 'boolean') {
		input = row.createEl('input', { type: 'checkbox' });
	} else if (param.type === 'number') {
		input = row.createEl('input', { type: 'number' });
	} else if (param.type === 'object' || param.type === 'array') {
		input = row.createEl('textarea');
		input.rows = 3;
		input.placeholder = param.type === 'array' ? '["item1", "item2"]' : '{"key": "value"}';
	} else {
		input = row.createEl('input', { type: 'text' });
	}
	input.addClass('ia-mcpi-param-input');
	return input;
}

function toField(param: ToolParameter, input: ParamInput): ArgumentField {
	const value = input.instanceOf(HTMLInputElement) && input.type === 'checkbox' ? input.checked : input.value;
	return { name: param.name, type: param.type, required: Boolean(param.required), value };
}

function showResult(container: HTMLElement, result: { success: boolean; error?: string; result?: unknown }): void {
	container.empty();
	container.removeClass('ia-hidden');
	container.createDiv({
		cls: `ia-mcpi-result-header ${result.success ? 'ia-mcpi-result-header--success' : 'ia-mcpi-result-header--error'}`,
		text: t(result.success ? 'modals.mcpInspector.logs.success' : 'modals.mcpInspector.logs.failed'),
	});
	if (result.error) {
		container.createDiv({ cls: 'ia-mcpi-result-error', text: t('modals.mcpInspector.logs.errorLabel', { message: result.error }) });
	}
	if (result.result !== undefined) {
		container.createEl('pre', {
			cls: 'ia-mcpi-result-pre',
			text: typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2),
		});
	}
}

function showError(container: HTMLElement, message: string): void {
	container.empty();
	container.removeClass('ia-hidden');
	container.createDiv({ cls: 'ia-mcpi-error-header', text: t('modals.mcpInspector.logs.errorTitle') });
	container.createDiv({ text: message });
}
