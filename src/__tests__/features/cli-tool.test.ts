import { CLITool } from '@/features/tools/cli-tool';
import type { CommandRunner } from '@/features/tools';
import type { CLIToolConfig } from '@/features/tools';

const config = (overrides: Partial<CLIToolConfig> = {}): CLIToolConfig => ({
	id: 'grep',
	name: 'grep_notes',
	description: 'Search notes',
	command: 'grep',
	args: ['-r', '{{pattern}}'],
	parameters: [
		{ name: 'pattern', type: 'string', description: 'Pattern', required: true, insertAs: 'template' },
		{ name: 'path', type: 'string', description: 'Path', insertAs: 'arg' },
		{ name: 'token', type: 'string', description: 'Token', insertAs: 'env', envName: 'API_TOKEN' },
	],
	enabled: true,
	...overrides,
} as CLIToolConfig);

describe('CLITool', () => {
	it('fills templates, appends arguments, passes env parameters, and returns stdout', async () => {
		const runner = jest.fn<ReturnType<CommandRunner>, Parameters<CommandRunner>>(async () => ({ exitCode: 0, stdout: 'match\n', stderr: '' }));

		const result = await new CLITool(config({ timeout: 5000, shell: false }), runner).execute({ pattern: 'todo', path: 'Notes', token: 'secret' });

		expect(result).toEqual({ success: true, result: 'match' });
		const [run] = runner.mock.calls[0];
		expect(run).toEqual(expect.objectContaining({ command: 'grep', args: ['-r', 'todo', 'Notes'], shell: false, timeoutMs: 5000 }));
		expect(run.env.API_TOKEN).toBe('secret');
	});

	it('reports a failed command with its error output', async () => {
		const runner: CommandRunner = async () => ({ exitCode: 2, stdout: '', stderr: 'no such file\n' });

		expect(await new CLITool(config(), runner).execute({ pattern: 'x' })).toEqual({ success: false, error: 'no such file' });
	});

	it('reports a command that could not start', async () => {
		const runner: CommandRunner = async () => { throw new Error('Failed to execute command: spawn grep ENOENT'); };

		expect(await new CLITool(config(), runner).execute({ pattern: 'x' })).toEqual({ success: false, error: 'Failed to execute command: spawn grep ENOENT' });
	});
});
