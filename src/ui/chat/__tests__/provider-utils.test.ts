import { getModelDisplayName, resolveMessageProviderId } from '@/ui/chat/utils/provider-utils';

const plugin = (llmConfigs: unknown[] = []) => ({ settings: { llmConfigs } }) as never;

describe('resolveMessageProviderId', () => {
	it('prefers the provider recorded on the message', () => {
		expect(resolveMessageProviderId({ role: 'assistant', content: '', provider: ' OpenAI ', model: 'claude-3' }, plugin())).toBe('openai');
	});

	it('falls back to the configured provider of the model, then to a provider prefix', () => {
		const configs = [{ provider: 'ollama', cachedModels: [{ id: 'llama3', name: 'llama3', provider: 'ollama' }] }];

		expect(resolveMessageProviderId({ role: 'assistant', content: '', model: 'llama3' }, plugin(configs))).toBe('ollama');
		expect(resolveMessageProviderId({ role: 'assistant', content: '', model: 'Custom:thing' }, plugin())).toBe('custom');
	});

	it('returns null when nothing identifies a provider', () => {
		expect(resolveMessageProviderId({ role: 'user', content: '' }, plugin())).toBeNull();
		expect(resolveMessageProviderId({ role: 'assistant', content: '', model: '  ' }, plugin())).toBeNull();
	});
});

describe('getModelDisplayName', () => {
	it('drops the provider prefix', () => {
		expect(getModelDisplayName('openai:gpt-4o')).toBe('gpt-4o');
		expect(getModelDisplayName('gpt-4o')).toBe('gpt-4o');
		expect(getModelDisplayName('')).toBeNull();
	});
});
