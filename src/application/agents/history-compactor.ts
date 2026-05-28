import type { AgentWorkingMessage } from './types';

interface HistoryCompactorOptions {
	maxEstimatedTokens?: number;
	keepLastMessages?: number;
}

interface CompactionResult {
	messages: AgentWorkingMessage[];
	compacted: boolean;
	summary: string;
}

const DEFAULT_MAX_ESTIMATED_TOKENS = 10000;
const DEFAULT_KEEP_LAST_MESSAGES = 8;

export class HistoryCompactor {
	constructor(private readonly options: HistoryCompactorOptions = {}) {}

	compact(messages: AgentWorkingMessage[]): CompactionResult {
		const maxEstimatedTokens = this.options.maxEstimatedTokens ?? DEFAULT_MAX_ESTIMATED_TOKENS;
		const estimated = this.estimateMessages(messages);
		if (estimated <= maxEstimatedTokens) {
			return { messages, compacted: false, summary: '' };
		}

		const keepLast = this.options.keepLastMessages ?? DEFAULT_KEEP_LAST_MESSAGES;
		const systemMessages = messages.filter(message => message.role === 'system');
		const tail = messages.slice(-keepLast);
		const middleStart = systemMessages.length;
		const middleEnd = Math.max(middleStart, messages.length - keepLast);
		const middle = messages.slice(middleStart, middleEnd);
		const summary = this.buildResearchLog(middle);

		return {
			messages: [
				...systemMessages,
				{ role: 'system', content: `Research Log:\n${summary}` },
				...tail,
			],
			compacted: true,
			summary,
		};
	}

	estimateMessages(messages: AgentWorkingMessage[]): number {
		return messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0);
	}

	private buildResearchLog(messages: AgentWorkingMessage[]): string {
		return messages
			.map((message, index) => {
				const compactContent = message.content.replace(/\s+/g, ' ').trim().slice(0, 240);
				return `${index + 1}. ${message.role}: ${compactContent}`;
			})
			.filter(line => line.trim().length > 0)
			.join('\n');
	}
}
