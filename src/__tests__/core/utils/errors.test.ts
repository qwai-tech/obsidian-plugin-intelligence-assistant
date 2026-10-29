import { errorMessage } from '@/core/utils/errors';

describe('errorMessage', () => {
	it('returns the message of an Error', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('returns a string error unchanged', () => {
		expect(errorMessage('plain')).toBe('plain');
	});

	it('stringifies anything else', () => {
		expect(errorMessage(42)).toBe('42');
	});
});
