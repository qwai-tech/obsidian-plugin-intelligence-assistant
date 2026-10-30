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

	it.each(fs.readdirSync(LOCALES).filter(file => file !== 'en.json'))('%s has exactly the English keys', (file) => {
		const keys = new Set(keysOf(readLocale(file)));
		expect([...english].filter(key => !keys.has(key))).toEqual([]);
		expect([...keys].filter(key => !english.has(key))).toEqual([]);
	});

	it('defines every literal key the source translates', () => {
		const used = sourceFiles(SRC).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\('([\w.-]+)'/g)].map(match => match[1]));
		const plural = (key: string) => english.has(`${key}_one`) && english.has(`${key}_other`);
		expect([...new Set(used)].filter(key => !english.has(key) && !plural(key))).toEqual([]);
	});
});
