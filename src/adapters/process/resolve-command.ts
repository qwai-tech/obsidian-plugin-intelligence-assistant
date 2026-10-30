import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs, constants as fsConstants } from 'fs';

const RESOLVED_COMMANDS = new Set(['npx', 'npm', 'node', 'uvx', 'python', 'python3']);

export async function resolveCommand(command: string): Promise<string> {
	return RESOLVED_COMMANDS.has(command) ? resolveCommandPath(command) : command;
}

export async function resolveCommandPath(command: string): Promise<string> {
	const homeDir = process.env.HOME ?? '';
	const commonPaths = [
		`/usr/local/bin/${command}`,
		`/opt/homebrew/bin/${command}`,
		`${homeDir}/.nvm/current/bin/${command}`,
		`${homeDir}/.local/bin/${command}`,
		`${homeDir}/.cargo/bin/${command}`,
		`/usr/bin/${command}`,
	];

	try {
		const { stdout } = await promisify(execFile)('which', [command]);
		const path = stdout.trim();
		if (path) {
			return path;
		}
	} catch {
		// Not on PATH; fall back to the usual install locations.
	}

	for (const path of commonPaths) {
		try {
			await fs.access(path, fsConstants.X_OK);
			return path;
		} catch {
			// Missing or not executable.
		}
	}

	console.warn(`[MCP] Could not resolve path for ${command}, using original`);
	return command;
}
