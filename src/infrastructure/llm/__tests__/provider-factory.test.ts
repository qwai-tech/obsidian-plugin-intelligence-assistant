import { ProviderFactory } from '../provider-factory';

describe('ProviderFactory', () => {
	it('creates CLI providers', () => {
		expect(() => ProviderFactory.createProvider({ provider: 'claude-code' })).not.toThrow();
		expect(() => ProviderFactory.createProvider({ provider: 'codex' })).not.toThrow();
		expect(() => ProviderFactory.createProvider({ provider: 'qwen-code' })).not.toThrow();
	});
});
