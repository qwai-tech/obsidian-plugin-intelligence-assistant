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

describe('user-visible text', () => {
	it('goes through t() so every language gets it', () => {
		const untranslated = ROOTS.flatMap(root => sourceFiles(root)).flatMap(file =>
			[...readFileSync(file, 'utf8').matchAll(UI_TEXT)]
				.map(match => match[3])
				.filter(text => WORDS.test(text) && !NOT_PROSE.test(text))
				.map(text => `${relative(process.cwd(), file)}: ${text}`));

		expect(untranslated).toEqual([]);
	});
});
