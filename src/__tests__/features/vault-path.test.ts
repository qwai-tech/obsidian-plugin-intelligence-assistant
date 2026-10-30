import { vaultPath } from '@/features/tools/vault-path';

describe('vaultPath', () => {
	it.each([
		['Notes/a.md', 'Notes/a.md'],
		['/Notes/a.md', 'Notes/a.md'],
		['./Notes/a.md', 'Notes/a.md'],
		['Notes//a.md', 'Notes/a.md'],
		['Notes\\a.md', 'Notes/a.md'],
		['  Notes/ ', 'Notes'],
		['/', ''],
		['', ''],
		[undefined, ''],
	])('turns %p into %p', (raw, expected) => {
		expect(vaultPath(raw)).toBe(expected);
	});
});
