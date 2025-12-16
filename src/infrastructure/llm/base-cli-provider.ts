/**
 * Base CLI Provider
 * Runs local CLI tools (Claude Code, Codex, Qwen Code) and adapts their
 * stdout to the plugin's ILLMProvider interface.
 */

import { spawn } from 'child_process';
import type { LLMConfig, Message } from '@/types';
import { ChatRequest, ChatResponse, ILLMProvider, StreamChunk } from './types';

type StreamMode = 'stream' | 'full';

interface CLICommand {
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
}

export abstract class BaseCLIProvider implements ILLMProvider {
	protected config: LLMConfig;

	constructor(config: LLMConfig) {
		this.config = config;
	}

	abstract get name(): string;

	/**
	 * Build the CLI command for the given request.
	 */
	protected abstract buildCommand(request: ChatRequest, mode: StreamMode): CLICommand;

	/**
	 * Parse a line of CLI output into a text chunk.
	 * Providers override for tool-specific JSON shapes.
	 */
	protected parseOutputLine(line: string): string | null {
		// Try JSON first
		try {
			const parsed = JSON.parse(line) as Record<string, unknown>;
			const text = this.extractTextFromJson(parsed);
			if (text) return text;
		} catch {
			// not JSON, fall back to raw text
		}
		const trimmed = line.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	protected extractTextFromJson(json: Record<string, unknown>): string | null {
		// Common shapes: { content: "text" } or { message: { content: [{ text: "..." }] } }
		if (typeof json.content === 'string') {
			return json.content;
		}

		const message = json.message;
		if (message && typeof message === 'object' && Array.isArray((message as { content?: unknown[] }).content)) {
			const parts = (message as { content: Array<{ text?: string }> }).content
				.map(part => part?.text)
				.filter(Boolean);
			if (parts.length > 0) {
				return parts.join('');
			}
		}

		const delta = json.delta;
		if (delta && typeof delta === 'object' && typeof (delta as { text?: string }).text === 'string') {
			return (delta as { text: string }).text;
		}

		return null;
	}

	/**
	 * Combine chat history into a single prompt string.
	 * CLI tools generally accept a single prompt argument.
	 */
	protected buildPrompt(messages: Message[]): string {
		const system = messages.find(m => m.role === 'system')?.content;
		const conversation = messages
			.filter(m => m.role !== 'system')
			.map(m => `${m.role.toUpperCase()}: ${m.content}`)
			.join('\n');

		return system ? `SYSTEM: ${system}\n${conversation}` : conversation;
	}

	/**
	 * Strip provider prefix from a model ID (e.g., "claude-code:sonnet" -> "sonnet").
	 */
	protected extractModelName(modelId: string | undefined): string {
		if (!modelId) return '';
		return modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const { command, args, env } = this.buildCommand(request, 'full');
		const output = await this.runProcess(command, args, env, /*stream*/ false);

		return {
			content: output,
		};
	}

	async streamChat(request: ChatRequest, onChunk: (_chunk: StreamChunk) => void): Promise<void> {
		const { command, args, env } = this.buildCommand(request, 'stream');
		let finalBuffer = '';

		await this.runProcess(
			command,
			args,
			env,
			true,
			(chunk) => {
				const text = this.parseOutputLine(chunk);
				if (!text) return;
				finalBuffer += text;
				onChunk({ content: text, done: false });
			},
			() => {
				onChunk({ content: '', done: true });
			},
			(errorText) => {
				// Fallback: emit accumulated text if any
				if (finalBuffer) {
					onChunk({ content: '', done: true });
					return;
				}
				throw new Error(errorText);
			}
		);
	}

	private runProcess(
		command: string,
		args: string[],
		env?: NodeJS.ProcessEnv,
		stream?: boolean,
		onData?: (data: string) => void,
		onClose?: () => void,
		onError?: (stderr: string) => void
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				env: { ...process.env, ...env },
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdoutBuffer = '';
			let stderrBuffer = '';

			child.stdout.on('data', (data: Buffer) => {
				const text = data.toString();
				if (stream && onData) {
					// Stream mode: forward line by line
					const lines = text.split('\n');
					lines.forEach(line => {
						if (line.trim().length > 0) {
							onData(line);
						}
					});
				} else {
					stdoutBuffer += text;
				}
			});

			child.stderr.on('data', (data: Buffer) => {
				stderrBuffer += data.toString();
			});

			child.on('error', (error) => {
				reject(error);
			});

			child.on('close', (code) => {
				if (onClose) {
					onClose();
				}

				if (code !== 0 && stderrBuffer) {
					if (onError) {
						onError(stderrBuffer);
						return;
					}
					reject(new Error(stderrBuffer));
					return;
				}

				const finalOutput = stdoutBuffer.trim();
				resolve(finalOutput);
			});
		});
	}
}
