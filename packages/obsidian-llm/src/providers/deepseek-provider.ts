import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class DeepSeekProvider extends OpenAICompatibleProvider {
	protected readonly defaultBaseUrl = 'https://api.deepseek.com/v1';
	protected readonly supportsEmbeddings = false;

	get name(): string {
		return 'DeepSeek';
	}
}
