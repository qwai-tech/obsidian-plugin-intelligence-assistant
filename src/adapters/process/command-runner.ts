import { spawn } from 'child_process';
import type { CommandRunner } from '@/features/tools';

export const runCommand: CommandRunner = ({ command, args, env, cwd, shell, timeoutMs }) =>
	new Promise((resolve, reject) => {
		const proc = spawn(command, args, { shell, cwd: cwd || process.cwd(), env, timeout: timeoutMs });
		let stdout = '';
		let stderr = '';
		proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
		proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
		proc.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
		proc.on('error', (error) => reject(new Error(`Failed to execute command: ${error.message}`)));
	});
