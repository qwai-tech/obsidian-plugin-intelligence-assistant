import { Notice } from 'obsidian';
import { renderMcpToolTester } from '@/ui/modals/mcp-tool-tester';

const tool = {
	llmName: 'mcp_files_search',
	origin: { kind: 'mcp', sourceId: 'files' },
	definition: {
		name: 'search',
		parameters: [
			{ name: 'query', type: 'string', required: true, description: 'Text' },
			{ name: 'limit', type: 'number', required: false },
		],
	},
};

const makeRegistry = (execute = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({ success: true, result: { hits: 2 } }))) => ({
	getTools: () => [tool],
	getToolByLlmName: (name: string) => (name === tool.llmName ? tool : undefined),
	executeTool: execute,
});

const choose = (select: HTMLSelectElement, value: string) => {
	select.value = value;
	select.dispatchEvent(new Event('change'));
};

const setup = (registry = makeRegistry()) => {
	const container = document.createElement('div');
	renderMcpToolTester(container, registry as never);
	const [serverSelect, toolSelect] = Array.from(container.querySelectorAll('select'));
	const [runButton] = Array.from(container.querySelectorAll('button'));
	choose(serverSelect, 'files');
	choose(toolSelect, tool.llmName);
	const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('.ia-mcpi-param-input'));
	return { container, registry, runButton, inputs };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('renderMcpToolTester', () => {
	beforeEach(() => (Notice as unknown as jest.Mock).mockClear());

	it('lists the selected server tools and renders their parameters', () => {
		const { inputs, runButton } = setup();

		expect(inputs.map(input => input.type)).toEqual(['text', 'number']);
		expect(runButton.disabled).toBe(false);
	});

	it('runs the tool with parsed arguments and shows the result', async () => {
		const { container, registry, runButton, inputs } = setup();
		inputs[0].value = 'notes';
		inputs[1].value = '3';

		runButton.click();
		await flush();

		expect(registry.executeTool).toHaveBeenCalledWith(tool.llmName, { query: 'notes', limit: 3 });
		expect(container.querySelector('.ia-mcpi-result-pre')?.textContent).toContain('"hits": 2');
	});

	it('does not run when a required argument is missing', () => {
		const { registry, runButton } = setup();

		runButton.click();

		expect(registry.executeTool).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalled();
	});
});
