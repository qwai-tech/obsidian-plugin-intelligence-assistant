import { CliToolSource } from '../cli-tool-source';
import type { CLIToolConfig } from '@/types/features/cli-tools';

describe('CliToolSource', () => {
	function makeConfig(overrides: Partial<CLIToolConfig> = {}): CLIToolConfig {
		return {
			id: 'cli-1',
			name: 'echo_tool',
			description: 'Echoes input',
			command: 'echo',
			args: ['{{text}}'],
			enabled: true,
			parameters: [
				{ name: 'text', type: 'string', description: 'Text to echo', required: true },
			],
			...overrides,
		};
	}

	it('exposes cli kind with id and label from the config', () => {
		const source = new CliToolSource(makeConfig());
		expect(source.kind).toBe('cli');
		expect(source.id).toBe('cli-1');
		expect(source.label).toBe('echo_tool');
	});

	it('loads exactly one CLITool whose definition matches the config', async () => {
		const tools = await new CliToolSource(makeConfig()).load();
		expect(tools).toHaveLength(1);
		expect(tools[0].definition.name).toBe('echo_tool');
		expect(tools[0].definition.description).toBe('Echoes input');
		expect(tools[0].definition.parameters).toEqual([
			{ name: 'text', type: 'string', description: 'Text to echo', required: true },
		]);
	});

	it('uses distinct ids for distinct configs', () => {
		const a = new CliToolSource(makeConfig({ id: 'a', name: 'tool_a' }));
		const b = new CliToolSource(makeConfig({ id: 'b', name: 'tool_b' }));
		expect(a.id).toBe('a');
		expect(b.id).toBe('b');
	});

	it('returns a tool with an execute function', async () => {
		const tools = await new CliToolSource(makeConfig()).load();
		expect(typeof tools[0].execute).toBe('function');
	});

	it('dispose is a no-op that resolves', async () => {
		await expect(new CliToolSource(makeConfig()).dispose()).resolves.toBeUndefined();
	});
});
