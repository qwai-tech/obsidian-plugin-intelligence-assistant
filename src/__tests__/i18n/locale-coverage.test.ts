import * as fs from 'fs';
import * as path from 'path';

const LOCALES = path.join(__dirname, '../../i18n/locales');
const SRC = path.join(__dirname, '../..');

type Tree = { [key: string]: string | Tree };

function keysOf(tree: Tree, prefix = ''): string[] {
	return Object.entries(tree).flatMap(([key, value]) => {
		const full = prefix ? `${prefix}.${key}` : key;
		return typeof value === 'string' ? [full] : keysOf(value, full);
	});
}

function readLocale(file: string): Tree {
	return JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8')) as Tree;
}

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'locales' ? [] : sourceFiles(full);
		return entry.name.endsWith('.ts') ? [full] : [];
	});
}

describe('locale coverage', () => {
	const english = new Set(keysOf(readLocale('en.json')));

	const pluralBases = [...english].filter(key => key.endsWith('_one')).map(key => key.slice(0, -'_one'.length));
	const pluralForms = (file: string) => new Intl.PluralRules(file.replace('.json', '')).resolvedOptions().pluralCategories;

	const isPluralForm = (key: string) => /_(zero|one|two|few|many|other)$/.test(key) && pluralBases.includes(key.replace(/_[a-z]+$/, ''));

	it.each(fs.readdirSync(LOCALES).filter(file => file !== 'en.json'))('%s has the English keys and no others but its plural forms', (file) => {
		const keys = new Set(keysOf(readLocale(file)));
		const ownPluralKeys = new Set(pluralBases.flatMap(base => pluralForms(file).map(form => `${base}_${form}`)));
		expect([...english].filter(key => !isPluralForm(key) && !keys.has(key))).toEqual([]);
		expect([...keys].filter(key => isPluralForm(key) ? !ownPluralKeys.has(key) : !english.has(key))).toEqual([]);
	});

	it.each(fs.readdirSync(LOCALES))('%s has every plural form its language uses', (file) => {
		const keys = new Set(keysOf(readLocale(file)));

		const missing = pluralBases.flatMap(base => pluralForms(file).map(form => `${base}_${form}`)).filter(key => !keys.has(key));

		expect(missing).toEqual([]);
	});

	it('defines every literal key the source translates', () => {
		const used = sourceFiles(SRC).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\('([\w.-]+)'/g)].map(match => match[1]));
		const plural = (key: string) => english.has(`${key}_one`) && english.has(`${key}_other`);
		expect([...new Set(used)].filter(key => !english.has(key) && !plural(key))).toEqual([]);
	});
});
