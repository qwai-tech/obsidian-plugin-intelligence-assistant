import { execFile, exec } from 'child_process';
import { resolveCommand, resolveCommandPath } from '@/adapters/process/resolve-command';

jest.mock('child_process', () => ({
	exec: jest.fn(),
	execFile: jest.fn((_file: string, _args: string[], callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
		callback(null, { stdout: '/usr/local/bin/npx\n', stderr: '' });
	}),
}));

describe('resolveCommand', () => {
	it('looks the command up with execFile so the name never reaches a shell', async () => {
		const resolved = await resolveCommandPath('npx; touch pwned');

		expect(execFile).toHaveBeenCalledWith('which', ['npx; touch pwned'], expect.any(Function));
		expect(exec).not.toHaveBeenCalled();
		expect(resolved).toBe('/usr/local/bin/npx');
	});

	it('resolves only well-known launchers and leaves other commands as given', async () => {
		(execFile as unknown as jest.Mock).mockClear();

		expect(await resolveCommand('/opt/my-server')).toBe('/opt/my-server');
		expect(execFile).not.toHaveBeenCalled();
		expect(await resolveCommand('npx')).toBe('/usr/local/bin/npx');
	});
});
