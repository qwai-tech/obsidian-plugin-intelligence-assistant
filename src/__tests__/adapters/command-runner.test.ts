import { runCommand } from '@/adapters/process/command-runner';

describe('runCommand', () => {
	it('captures output and the exit code of a process', async () => {
		const outcome = await runCommand({
			command: process.execPath,
			args: ['-e', 'process.stdout.write(process.env.GREETING); process.stderr.write("warn"); process.exit(3)'],
			env: { GREETING: 'hello', PATH: process.env.PATH ?? '' },
			shell: false,
			timeoutMs: 10_000,
		});

		expect(outcome).toEqual({ exitCode: 3, stdout: 'hello', stderr: 'warn' });
	});

	it('rejects when the command cannot be started', async () => {
		await expect(runCommand({ command: '/no/such/binary', args: [], env: {}, shell: false, timeoutMs: 1000 })).rejects.toThrow('Failed to execute command');
	});
});
