import { providerAvatar, providerColor } from '@/ui/provider-meta';

describe('provider visuals', () => {
	it('gives known providers their avatar and colour', () => {
		expect(providerAvatar('anthropic')).toBe('🧠');
		expect(providerColor('openai')).toBe('#10a37f');
	});

	it('falls back for unknown or missing providers', () => {
		expect(providerAvatar(null)).toBe('🤖');
		expect(providerAvatar('unknown-vendor')).toBe('🤖');
		expect(providerColor(undefined)).toBe('#666666');
	});
});
