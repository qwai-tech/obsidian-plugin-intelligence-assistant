import { BaseCLIProvider } from './base-cli-provider';
import type { ChatRequest } from './types';

/**
 * Codex Provider
 * Runs the local Codex CLI (no API keys required).
 */
export class CodexProvider extends BaseCLIProvider {
	get name(): string {
		return 'Codex';
	}

	protected buildCommand(request: ChatRequest, mode: 'stream' | 'full') {
		const prompt = this.buildPrompt(request.messages);
		const command = this.config.commandPath || 'codex';

		// codex exec --json prints JSONL events to stdout
		const args = ['exec', '--json', prompt];

		if (request.model) {
			args.splice(1, 0, '--model', this.extractModelName(request.model));
		}

		return { command, args };
	}
}
