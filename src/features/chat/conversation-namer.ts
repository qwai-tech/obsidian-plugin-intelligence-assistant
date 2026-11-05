import { ModelManager, ProviderFactory } from '@qwai/obsidian-llm';
import type { LLMConfig, ILLMProvider } from '@/features/llm';
import type { Message } from '@/features/conversations';
import type { UsageRecord } from '@/features/usage';

const DEFAULT_TITLE_PROMPT = 'Generate a short, descriptive title (max 6 words) for this conversation:\n\n{conversation}\n\nTitle:';
const FIRST_MESSAGE_TITLE_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;

export interface NamingSettings {
	conversationTitleMode: string;
	titleSummaryModel?: string;
	titleSummaryPrompt: string;
	llmConfigs: LLMConfig[];
}

export interface NamerDependencies {
	createProvider?: (config: LLMConfig) => ILLMProvider;
	recordUsage?: (record: UsageRecord) => void;
}

export class ConversationNamer {
	private readonly createProvider: (config: LLMConfig) => ILLMProvider;

	constructor(
		private readonly settings: () => NamingSettings,
		private readonly deps: NamerDependencies = {},
	) {
		this.createProvider = deps.createProvider ?? ((config) => ProviderFactory.createProvider(config));
	}

	async title(messages: Message[], fallbackModel: string): Promise<string | null> {
		const mode = this.settings().conversationTitleMode;
		if (mode === 'manual') {
			return null;
		}
		if (mode === 'auto-summary') {
			const summary = await this.summarize(messages, fallbackModel);
			if (summary) {
				return summary;
			}
		}
		return firstMessageTitle(messages);
	}

	async icon(title: string, fallbackModel: string): Promise<string | null> {
		const reply = await this.ask(
			`Suggest a single emoji icon that represents this conversation: "${title}". Reply with only the emoji, no text.`,
			fallbackModel,
			0.5,
		);
		return reply?.match(/\p{Extended_Pictographic}/u)?.[0] ?? null;
	}

	private async summarize(messages: Message[], fallbackModel: string): Promise<string | null> {
		const context = messages.length <= 4 ? messages.slice(0, 4) : [...messages.slice(0, 2), ...messages.slice(-2)];
		const conversation = context.map((m) => `${m.role}: ${m.content.substring(0, 200)}`).join('\n\n');
		const template = this.settings().titleSummaryPrompt || DEFAULT_TITLE_PROMPT;
		const reply = await this.ask(template.replace('{conversation}', conversation), fallbackModel, 0.3);
		const title = reply?.trim().replace(/^Title:\s*/i, '').replace(/^["']|["']$/g, '') ?? '';
		return title.length > 0 && title.length <= MAX_TITLE_LENGTH ? title : null;
	}

	private async ask(prompt: string, fallbackModel: string, temperature: number): Promise<string | null> {
		const { titleSummaryModel, llmConfigs } = this.settings();
		const model = titleSummaryModel || fallbackModel;
		const config = model ? ModelManager.findConfigForModelByProvider(model, llmConfigs) : null;
		if (!config) {
			return null;
		}
		try {
			const response = await this.createProvider(config).chat({ messages: [{ role: 'user', content: prompt }], model, temperature, purpose: 'conversation-name' });
			return response.content;
		} catch (error) {
			console.error('[ConversationNamer] Model request failed:', error);
			return null;
		}
	}
}

function firstMessageTitle(messages: Message[]): string {
	const first = messages.find((m) => m.role === 'user')?.content;
	if (!first) {
		return 'New conversation';
	}
	return first.length > FIRST_MESSAGE_TITLE_LENGTH ? `${first.substring(0, FIRST_MESSAGE_TITLE_LENGTH)}...` : first;
}
