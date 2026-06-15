import { App, TFile } from 'obsidian';
import { MentionSuggest, findMentionToken, filterFilesByQuery } from '@/presentation/suggest/mention-suggest';

function file(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.name = path.split('/').pop() ?? path;
	f.basename = f.name.replace(/\.\w+$/, '');
	f.extension = 'md';
	return f;
}

describe('findMentionToken', () => {
	it('detects an @ mention at the caret', () => {
		const token = findMentionToken('hello @foo', 10);
		expect(token).toEqual({ query: 'foo', start: 6, end: 10, kind: '@' });
	});

	it('detects a [[ wikilink fragment', () => {
		const token = findMentionToken('see [[bar', 9);
		expect(token).toEqual({ query: 'bar', start: 4, end: 9, kind: '[[' });
	});

	it('does not trigger @ inside an email-like token', () => {
		expect(findMentionToken('mail a@b', 8)).toBeNull();
	});

	it('returns null once the wikilink is closed', () => {
		expect(findMentionToken('[[done]]', 8)).toBeNull();
	});
});

describe('filterFilesByQuery', () => {
	const files = [file('Alpha.md'), file('beta/Alphabet.md'), file('Gamma.md')];

	it('matches by basename substring, prefix first', () => {
		const out = filterFilesByQuery(files, 'alph');
		expect(out.map((f) => f.basename)).toEqual(['Alpha', 'Alphabet']);
	});

	it('returns all files for an empty query', () => {
		expect(filterFilesByQuery(files, '')).toHaveLength(3);
	});
});

describe('MentionSuggest', () => {
	function setup(textValue: string, caret: number, files: TFile[]) {
		const app = new App() as unknown as App;
		(app.vault.getMarkdownFiles as jest.Mock).mockReturnValue(files);
		const textarea = document.createElement('textarea');
		textarea.value = textValue;
		textarea.setSelectionRange(caret, caret);
		const suggest = new MentionSuggest(app, textarea);
		return { app, textarea, suggest };
	}

	it('getSuggestions returns files matching the active @ token', async () => {
		const files = [file('Foobar.md'), file('Other.md')];
		const { suggest } = setup('@foo', 4, files);
		const out = await (suggest as unknown as { _getSuggestionsForTest(q: string): Promise<TFile[]> })._getSuggestionsForTest('');
		expect(out.map((f) => f.basename)).toEqual(['Foobar']);
	});

	it('returns nothing when there is no active token', async () => {
		const { suggest } = setup('plain text', 10, [file('Foobar.md')]);
		const out = await (suggest as unknown as { _getSuggestionsForTest(q: string): Promise<TFile[]> })._getSuggestionsForTest('');
		expect(out).toEqual([]);
	});

	it('selectSuggestion inserts a wikilink replacing the @ token', () => {
		const target = file('Foobar.md');
		const { textarea, suggest } = setup('hello @foo', 10, [target]);
		suggest.selectSuggestion(target, new MouseEvent('click'));
		expect(textarea.value).toBe('hello [[Foobar]] ');
	});

	it('selectSuggestion replaces a [[ fragment', () => {
		const target = file('Notes/Foobar.md');
		const { textarea, suggest } = setup('see [[foo', 9, [target]);
		suggest.selectSuggestion(target, new MouseEvent('click'));
		expect(textarea.value).toBe('see [[Foobar]] ');
	});
});
