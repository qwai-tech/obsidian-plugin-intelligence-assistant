import { LLM_PROVIDER_OPTIONS } from '../provider-config-modal';

describe('ProviderConfigModal provider options', () => {
	it('excludes CLI providers from the LLM provider picker', () => {
		const values = LLM_PROVIDER_OPTIONS.map(option => option.value);

		expect(values).not.toContain('claude-code');
		expect(values).not.toContain('codex');
		expect(values).not.toContain('qwen-code');
	});
});
