/**
 * SDK Installer
 * Manages on-demand installation of CLI agent SDK packages.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { CLIAgentProvider } from '@/types';
import { getEnvWithFullPath } from './shell-env';

export interface SDKPackageInfo {
	packageName: string;
	version: string;
	estimatedSizeMB: number;
	/** Relative path inside the package to verify installation */
	entryCheck: string;
}

export const SDK_PACKAGES: Record<CLIAgentProvider, SDKPackageInfo> = {
	'claude-code': {
		packageName: '@anthropic-ai/claude-agent-sdk',
		version: '0.2.39',
		estimatedSizeMB: 69,
		entryCheck: 'cli.js'
	},
	'codex': {
		packageName: '@openai/codex-sdk',
		version: '0.99.0',
		estimatedSizeMB: 449,
		entryCheck: 'dist/index.js'
	},
	'qwen-code': {
		packageName: '@qwen-code/sdk',
		version: '0.1.4',
		estimatedSizeMB: 46,
		entryCheck: 'dist/cli/cli.js'
	}
};

export type SDKInstallStatus = 'not-installed' | 'installed' | 'outdated';

export interface InstallProgress {
	stage: 'starting' | 'downloading' | 'installing' | 'verifying' | 'done' | 'error';
	message: string;
}

/** Check if an SDK is installed in the given plugin directory */
export function isSdkInstalled(pluginDir: string, provider: CLIAgentProvider): boolean {
	const info = SDK_PACKAGES[provider];
	const pkgPath = join(pluginDir, 'node_modules', info.packageName, info.entryCheck);
	return existsSync(pkgPath);
}

/** Get the installed version of an SDK, or null if not installed */
export function getInstalledVersion(pluginDir: string, provider: CLIAgentProvider): string | null {
	const info = SDK_PACKAGES[provider];
	const pkgJsonPath = join(pluginDir, 'node_modules', info.packageName, 'package.json');
	try {
		if (!existsSync(pkgJsonPath)) return null;
		const raw = readFileSync(pkgJsonPath, 'utf8');
		const parsed = JSON.parse(raw) as { version?: string };
		return parsed.version ?? null;
	} catch {
		return null;
	}
}

/** Get the install status of an SDK */
export function getSdkStatus(pluginDir: string, provider: CLIAgentProvider): SDKInstallStatus {
	if (!isSdkInstalled(pluginDir, provider)) return 'not-installed';
	const installed = getInstalledVersion(pluginDir, provider);
	const expected = SDK_PACKAGES[provider].version;
	if (installed && installed !== expected) return 'outdated';
	return 'installed';
}

/**
 * Install an SDK package using npm.
 * Returns a promise that resolves on success or rejects on failure.
 */
export function installSdk(
	pluginDir: string,
	provider: CLIAgentProvider,
	onProgress: (progress: InstallProgress) => void,
	signal?: AbortSignal
): Promise<void> {
	const info = SDK_PACKAGES[provider];
	const pkg = `${info.packageName}@${info.version}`;

	return new Promise((resolve, reject) => {
		onProgress({ stage: 'starting', message: `Installing ${pkg}...` });

		// npm --prefix requires a package.json in the target directory
		const pkgJsonPath = join(pluginDir, 'package.json');
		if (!existsSync(pkgJsonPath)) {
			writeFileSync(pkgJsonPath, JSON.stringify({ private: true, name: 'intelligence-assistant-sdks', version: '0.0.0' }), 'utf8');
		}

		const npmArgs = ['install', '--no-save', '--prefix', pluginDir, pkg];
		const env = getEnvWithFullPath();

		const proc = spawn('npm', npmArgs, {
			env,
			cwd: pluginDir,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		const abortHandler = () => {
			proc.kill('SIGTERM');
			reject(new Error('Installation cancelled'));
		};
		if (signal) {
			signal.addEventListener('abort', abortHandler, { once: true });
		}

		let output = '';

		proc.stdout?.on('data', (data: Buffer) => {
			const text = data.toString();
			output += text;
			onProgress({ stage: 'downloading', message: text.trim() });
		});

		proc.stderr?.on('data', (data: Buffer) => {
			const text = data.toString();
			output += text;
			// npm outputs progress info to stderr
			if (text.includes('added') || text.includes('npm warn')) {
				onProgress({ stage: 'installing', message: text.trim() });
			}
		});

		proc.on('close', (code) => {
			if (signal) signal.removeEventListener('abort', abortHandler);

			if (code === 0) {
				// Verify installation
				if (isSdkInstalled(pluginDir, provider)) {
					onProgress({ stage: 'done', message: 'Installation complete' });
					resolve();
				} else {
					onProgress({ stage: 'error', message: 'Installation completed but package not found' });
					reject(new Error('Installation completed but package verification failed'));
				}
			} else {
				onProgress({ stage: 'error', message: `npm exited with code ${String(code)}` });
				reject(new Error(`npm install failed (exit code ${String(code)}):\n${output}`));
			}
		});

		proc.on('error', (err) => {
			if (signal) signal.removeEventListener('abort', abortHandler);
			const message = err.message.includes('ENOENT')
				? 'npm not found. Please install Node.js and npm.'
				: err.message;
			onProgress({ stage: 'error', message });
			reject(new Error(message));
		});
	});
}

/** Uninstall an SDK package */
export function uninstallSdk(pluginDir: string, provider: CLIAgentProvider): void {
	const info = SDK_PACKAGES[provider];
	const pkgDir = join(pluginDir, 'node_modules', info.packageName);
	if (existsSync(pkgDir)) {
		rmSync(pkgDir, { recursive: true, force: true });
	}
}
