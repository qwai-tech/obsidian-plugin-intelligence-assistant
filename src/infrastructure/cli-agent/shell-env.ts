/**
 * Shell Environment Utilities
 * Resolves PATH and locates binaries in Obsidian's restricted process environment.
 */

import { execSync } from 'child_process';

let cachedFullPath: string | null = null;

/**
 * Get a user-like PATH by sourcing the login shell profile.
 * Obsidian's GUI process often lacks nvm/homebrew/user paths.
 * Results are cached for the session.
 */
export function getFullPath(): string {
	if (cachedFullPath) return cachedFullPath;

	const basePath = process.env['PATH'] ?? '';
	if (process.platform === 'win32') {
		cachedFullPath = basePath;
		return basePath;
	}

	try {
		const shell = process.env['SHELL'] || '/bin/zsh';
		const result = execSync(`${shell} -l -i -c 'echo $PATH'`, {
			timeout: 5000,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		});
		const shellPath = result.trim();
		if (shellPath) {
			cachedFullPath = shellPath;
			return shellPath;
		}
	} catch {
		// Fall back to manually constructed PATH
	}

	const home = process.env['HOME'] ?? '';
	const extra = [
		'/usr/local/bin',
		'/opt/homebrew/bin',
		`${home}/.local/bin`,
		`${home}/.npm-global/bin`,
	];
	cachedFullPath = `${basePath}:${extra.join(':')}`;
	return cachedFullPath;
}

/** Get a process env with the full PATH set */
export function getEnvWithFullPath(): NodeJS.ProcessEnv {
	return { ...process.env, PATH: getFullPath() };
}
