import { BaseCLIProvider } from './base-cli-provider';
import type { ChatRequest } from './types';

/**
 * Qwen Code Provider
 * Runs the local Qwen Code CLI (no API keys required).
 */
export class QwenCodeProvider extends BaseCLIProvider {
	get name(): string {
		return 'Qwen Code';
	}

	protected buildCommand(request: ChatRequest, _mode: 'stream' | 'full') {
		const prompt = this.buildPrompt(request.messages);
		const command = this.config.commandPath || 'qwen';
		const args = [
			'-p',
			prompt,
			'--output-format',
			'json',
		];

		if (request.model) {
			args.push('--model', this.extractModelName(request.model));
		}

		return { command, args };
	}
}
