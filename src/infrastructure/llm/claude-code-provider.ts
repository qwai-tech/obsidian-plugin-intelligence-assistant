import { BaseCLIProvider } from './base-cli-provider';
import type { ChatRequest } from './types';

/**
 * Claude Code Provider
 * Runs the local Claude Code CLI (no API keys required).
 */
export class ClaudeCodeProvider extends BaseCLIProvider {
	get name(): string {
		return 'Claude Code';
	}

	protected buildCommand(request: ChatRequest, mode: 'stream' | 'full') {
		const prompt = this.buildPrompt(request.messages);
		const command = this.config.commandPath || 'claude';
		const args = [
			'-p', // print mode (non-interactive)
			'--output-format',
			mode === 'stream' ? 'stream-json' : 'json',
			'--model',
			this.extractModelName(request.model) || 'sonnet',
			prompt
		];

		if (mode === 'stream') {
			args.push('--include-partial-messages');
		}

		return { command, args };
	}
}
