import { execFile, exec } from 'child_process';
import { MCPClient } from '@/application/services/mcp-client';

jest.mock('child_process', () => ({
	exec: jest.fn(),
	execFile: jest.fn((_file: string, _args: string[], callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
		callback(null, { stdout: '/usr/local/bin/npx\n', stderr: '' });
	}),
}));

describe('MCPClient command resolution', () => {
	it('looks the command up with execFile so the name never reaches a shell', async () => {
		const client = new MCPClient({ name: 'test', command: 'npx', args: [] } as never);

		const resolved = await (client as unknown as { resolveCommandPath(command: string): Promise<string> })
			.resolveCommandPath('npx; touch pwned');

		expect(execFile).toHaveBeenCalledWith('which', ['npx; touch pwned'], expect.any(Function));
		expect(exec).not.toHaveBeenCalled();
		expect(resolved).toBe('/usr/local/bin/npx');
	});
});
