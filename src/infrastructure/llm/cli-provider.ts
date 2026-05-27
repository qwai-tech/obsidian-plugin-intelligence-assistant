import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { BaseLLMProvider } from './base-provider';
import type { ChatRequest, ChatResponse, StreamChunk } from './types';

type CliProviderName = 'claude-code' | 'codex' | 'qwen-code';

export class CliProvider extends BaseLLMProvider {
	constructor(config: ConstructorParameters<typeof BaseLLMProvider>[0], private readonly providerName: CliProviderName) {
		super(config);
	}

	get name(): string {
		switch (this.providerName) {
			case 'claude-code':
				return 'Claude Code';
			case 'codex':
				return 'Codex';
			case 'qwen-code':
				return 'Qwen Code';
		}
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const prompt = this.buildPrompt(request);
		const { command, args } = this.buildCommand(prompt, request.model);
		const content = await this.runCommand(command, args);
		return { content };
	}

	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const response = await this.chat(request);
		if (response.content.length > 0) {
			onChunk({ content: response.content, done: false });
		}
		onChunk({ content: '', done: true });
	}

	private buildCommand(prompt: string, modelId: string): { command: string; args: string[] } {
		const model = this.extractModelName(modelId);
		const command = this.resolveCommand();

		switch (this.providerName) {
			case 'claude-code':
				return {
					command,
					args: model === 'default' ? ['-p', prompt] : ['--model', model, '-p', prompt],
				};
			case 'codex':
				return {
					command,
					args: ['exec', '--model', model, prompt],
				};
			case 'qwen-code':
				return {
					command,
					args: ['--model', model, '--prompt', prompt, '--output-format', 'text'],
				};
		}
	}

	private defaultCommand(): string {
		switch (this.providerName) {
			case 'claude-code':
				return 'claude';
			case 'codex':
				return 'codex';
			case 'qwen-code':
				return 'qwen';
		}
	}

	private resolveCommand(): string {
		const configured = this.config.commandPath?.trim();
		if (configured) {
			return configured;
		}

		const command = this.defaultCommand();
		const home = os.homedir();
		const candidates = [
			path.join(home, '.nvm', 'versions', 'node'),
			'/opt/homebrew/bin',
			'/usr/local/bin',
			'/usr/bin',
			'/bin',
		];

		for (const candidate of candidates) {
			if (candidate.endsWith('node')) {
				const resolved = this.findNvmCommand(candidate, command);
				if (resolved) {
					return resolved;
				}
				continue;
			}

			const fullPath = path.join(candidate, command);
			if (existsSync(fullPath)) {
				return fullPath;
			}
		}

		return command;
	}

	private findNvmCommand(nodeVersionsDir: string, command: string): string | null {
		try {
			if (!existsSync(nodeVersionsDir)) {
				return null;
			}

			const versions = readdirSync(nodeVersionsDir)
				.filter(entry => entry.startsWith('v'))
				.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
			for (const version of versions) {
				const fullPath = path.join(nodeVersionsDir, version, 'bin', command);
				if (existsSync(fullPath)) {
					return fullPath;
				}
			}
		} catch {
			return null;
		}
		return null;
	}

	private buildPrompt(request: ChatRequest): string {
		return request.messages
			.map(message => {
				const content = typeof message.content === 'string'
					? message.content
					: JSON.stringify(message.content);
				return `${message.role.toUpperCase()}: ${content}`;
			})
			.join('\n\n');
	}

	private extractModelName(modelId: string): string {
		return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
	}

	private async runCommand(command: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			const proc = spawn(command, args, {
				shell: false,
				cwd: process.cwd(),
				env: process.env,
				timeout: 120000,
			});
			let stdout = '';
			let stderr = '';

			proc.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString();
			});
			proc.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString();
			});
			proc.on('close', (code) => {
				if (code === 0) {
					resolve(stdout.trim());
				} else {
					reject(new Error(stderr.trim() || stdout.trim() || `${this.name} exited with code ${String(code ?? 'unknown')}`));
				}
			});
			proc.on('error', error => {
				if ('code' in error && error.code === 'ENOENT') {
					reject(new Error(`Failed to execute ${this.name}: command not found. Set the provider Command path to the full CLI path, for example ${this.exampleCommandPath()}.`));
					return;
				}
				reject(new Error(`Failed to execute ${this.name}: ${error.message}`));
			});
		});
	}

	private exampleCommandPath(): string {
		switch (this.providerName) {
			case 'claude-code':
				return '/opt/homebrew/bin/claude';
			case 'codex':
				return '/Users/you/.nvm/versions/node/v22/bin/codex';
			case 'qwen-code':
				return '/opt/homebrew/bin/qwen';
		}
	}
}
