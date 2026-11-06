import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOTS = ['src/ui', 'src/bootstrap', 'src/adapters', 'main.ts'];
const UI_TEXT = /(new Notice\(|\.setText\(|textContent = |\btext: |\.setName\(|\.setDesc\(|\.setPlaceholder\(|\.setTooltip\(|\.setButtonText\(|\.setTitle\(|'aria-label', )\s*(['`])([^'`]*)\2/g;
const WORDS = /[A-Za-z]{2,}\s+[A-Za-z]{2,}|^[A-Z][a-z]{2,}/;
const NOT_PROSE = /:\/\/|[/@=]|^[a-z0-9_.-]+$/;

function sourceFiles(path: string): string[] {
	if (statSync(path).isFile()) return [path];
	return readdirSync(path).flatMap(name => {
		const child = join(path, name);
		if (name === '__tests__') return [];
		return statSync(child).isDirectory() ? sourceFiles(child) : child.endsWith('.ts') ? [child] : [];
	});
}

function untranslatedProse(source: string): string[] {
	return [...source.matchAll(UI_TEXT)]
		// Inspect literal prose, not identifiers inside template expressions
		// such as Date.toLocaleString() or an interpolated notification count.
		.map(match => match[3].replace(/\$\{[^}]*\}?/g, ''))
		.filter(text => WORDS.test(text) && !NOT_PROSE.test(text));
}

describe('user-visible text', () => {
	it.each([
		['textContent = `${new Date(timestamp).toLocaleString()}`', false],
		['textContent = `${count}`', false],
		['textContent = `${format(\'timestamp\')}`', false],
		['textContent = `Models refreshed ${count}`', true],
		['textContent = `${count} models loaded`', true],
		[".setText('Connection successful')", true],
	])('distinguishes literal prose from interpolated code: %s', (source, hasProse) => {
		expect(untranslatedProse(source).length > 0).toBe(hasProse);
	});

	it('goes through t() so every language gets it', () => {
		const untranslated = ROOTS.flatMap(root => sourceFiles(root)).flatMap(file =>
			untranslatedProse(readFileSync(file, 'utf8'))
				.map(text => `${relative(process.cwd(), file)}: ${text}`));

		expect(untranslated).toEqual([]);
	});
});
