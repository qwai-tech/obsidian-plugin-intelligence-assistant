import { LLM_PROVIDER_OPTIONS } from '../provider-config-modal';

describe('ProviderConfigModal provider options', () => {
	it('includes CLI providers in the LLM provider picker', () => {
		const values = LLM_PROVIDER_OPTIONS.map(option => option.value);

		expect(values).toContain('claude-code');
		expect(values).toContain('codex');
		expect(values).toContain('qwen-code');
	});
});
