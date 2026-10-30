import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { unpackLocale } from '@/adapters/i18n/packed-locales';
import { localeKeys } from '@/i18n';

const LOCALES_DIR = join(__dirname, '../../i18n/locales');

describe('unpackLocale', () => {
	it.each(readdirSync(LOCALES_DIR).filter(file => file.endsWith('.json') && file !== 'en.json'))('restores %s exactly from the bundled pack', (file) => {
		const expected = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')) as Record<string, unknown>;

		expect(unpackLocale(file.replace('.json', ''), localeKeys())).toEqual(expected);
	});

	it('has nothing for a language the plugin does not ship', () => {
		expect(unpackLocale('xx', localeKeys())).toBeUndefined();
	});
});
