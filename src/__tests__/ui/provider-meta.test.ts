import { providerColor } from '@/ui/provider-meta';

describe('provider visuals', () => {
	it('gives known providers their colour', () => {
		expect(providerColor('openai')).toBe('#10a37f');
	});

	it('falls back for unknown or missing providers', () => {
		expect(providerColor(undefined)).toBe('#666666');
		expect(providerColor('unknown-vendor')).toBe('#666666');
	});
});
