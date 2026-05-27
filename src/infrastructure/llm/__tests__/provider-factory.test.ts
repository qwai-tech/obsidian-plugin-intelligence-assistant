import { ProviderFactory } from '../provider-factory';

describe('ProviderFactory', () => {
	it('rejects removed CLI providers', () => {
		expect(() => ProviderFactory.createProvider({ provider: 'claude-code' })).toThrow('Unknown provider');
		expect(() => ProviderFactory.createProvider({ provider: 'codex' })).toThrow('Unknown provider');
		expect(() => ProviderFactory.createProvider({ provider: 'qwen-code' })).toThrow('Unknown provider');
	});
});
