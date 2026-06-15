import { loadMermaid } from 'obsidian';
import {
	linkifyWikilinks,
	renderMermaidBlocks,
	enhanceRichMarkdown,
} from '@/presentation/chat/rich-markdown';

function makeEl(html: string): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = html;
	return el;
}

describe('linkifyWikilinks', () => {
	it('converts [[wikilinks]] into internal-link anchors with data-href', () => {
		const el = makeEl('<p>See [[Some Note]] for details.</p>');
		linkifyWikilinks(el);
		const anchor = el.querySelector('a.internal-link');
		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute('data-href')).toBe('Some Note');
		expect(anchor?.textContent).toBe('Some Note');
	});

	it('honors aliases ([[target|alias]])', () => {
		const el = makeEl('<p>[[target/path|Alias Text]]</p>');
		linkifyWikilinks(el);
		const anchor = el.querySelector('a.internal-link');
		expect(anchor?.getAttribute('data-href')).toBe('target/path');
		expect(anchor?.textContent).toBe('Alias Text');
	});

	it('does not linkify inside code blocks', () => {
		const el = makeEl('<pre><code>[[not a link]]</code></pre>');
		linkifyWikilinks(el);
		expect(el.querySelector('a.internal-link')).toBeNull();
	});
});

describe('renderMermaidBlocks', () => {
	beforeEach(() => {
		(loadMermaid as jest.Mock).mockClear();
	});

	it('renders a ```mermaid code block into an SVG via loadMermaid', async () => {
		const el = makeEl(
			'<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>',
		);
		const count = await renderMermaidBlocks(el);
		expect(count).toBe(1);
		expect(loadMermaid).toHaveBeenCalled();
		const svg = el.querySelector('.ia-mermaid svg');
		expect(svg).not.toBeNull();
		// The mock embeds the source code inside the SVG.
		expect(el.querySelector('.ia-mermaid')?.innerHTML).toContain('graph TD');
		// The original <pre> is gone.
		expect(el.querySelector('pre')).toBeNull();
	});

	it('is a no-op when there are no mermaid blocks', async () => {
		const el = makeEl('<p>no diagrams</p>');
		const count = await renderMermaidBlocks(el);
		expect(count).toBe(0);
		expect(loadMermaid).not.toHaveBeenCalled();
	});
});

describe('enhanceRichMarkdown', () => {
	it('linkifies wikilinks and renders mermaid in one pass', async () => {
		const el = makeEl(
			'<p>[[Note A]]</p><pre><code class="language-mermaid">graph LR; X--&gt;Y;</code></pre>',
		);
		await enhanceRichMarkdown(el);
		expect(el.querySelector('a.internal-link')?.getAttribute('data-href')).toBe('Note A');
		expect(el.querySelector('.ia-mermaid svg')).not.toBeNull();
	});
});
