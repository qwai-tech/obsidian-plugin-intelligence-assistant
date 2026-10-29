import { loadMermaid, loadMathJax, loadPrism } from 'obsidian';

/**
 * Convert `[[wikilink]]` / `[[wikilink|alias]]` text inside a rendered markdown
 * element into real internal-link anchors (`a.internal-link[data-href]`). This is
 * what makes hover previews work in chat — the hover wiring keys off
 * `a.internal-link` + `data-href`. Only operates on text nodes so it never
 * corrupts already-rendered HTML (code blocks, existing anchors, etc.).
 */
export function linkifyWikilinks(root: HTMLElement): void {
	const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	const doc = root.ownerDocument;
	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	let node = walker.nextNode();
	while (node) {
		// Skip text inside code/pre — wikilink syntax there is literal.
		const parent = (node as Text).parentElement;
		if (parent && !parent.closest('pre, code, a')) {
			textNodes.push(node as Text);
		}
		node = walker.nextNode();
	}

	for (const textNode of textNodes) {
		const text = textNode.nodeValue ?? '';
		if (!text.includes('[[')) continue;
		WIKILINK.lastIndex = 0;
		if (!WIKILINK.test(text)) continue;

		WIKILINK.lastIndex = 0;
		const frag = doc.createDocumentFragment();
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = WIKILINK.exec(text)) !== null) {
			const [whole, target, alias] = match;
			if (match.index > lastIndex) {
				frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
			}
			const anchor = doc.createElement('a');
			anchor.className = 'internal-link';
			anchor.setAttribute('data-href', target.trim());
			anchor.setAttribute('href', target.trim());
			anchor.textContent = (alias ?? target).trim();
			frag.appendChild(anchor);
			lastIndex = match.index + whole.length;
		}
		if (lastIndex < text.length) {
			frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
		}
		textNode.parentNode?.replaceChild(frag, textNode);
	}
}

let mermaidIdCounter = 0;

/**
 * Find ```mermaid fenced blocks already rendered (as `pre > code.language-mermaid`)
 * inside `root` and replace each with the diagram SVG produced by Obsidian's
 * `loadMermaid()`. Real usage of the `loadMermaid` loader — this is the manifest
 * probe. Resolves once all diagrams in the element have been rendered (or failed
 * gracefully, leaving the original code block intact).
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<number> {
	const blocks = Array.from(root.querySelectorAll('code.language-mermaid'));
	if (blocks.length === 0) return 0;

	type MermaidModule = { render(id: string, code: string): Promise<{ svg: string }> };
	let mermaid: MermaidModule | null = null;
	try {
		mermaid = (await loadMermaid()) as MermaidModule;
	} catch (error) {
		console.error('[RichMarkdown] loadMermaid failed', error);
		return 0;
	}
	if (!mermaid) return 0;

	const doc = root.ownerDocument;
	let rendered = 0;
	for (const codeEl of blocks) {
		const code = codeEl.textContent ?? '';
		if (!code.trim()) continue;
		const pre = codeEl.closest('pre') ?? codeEl;
		try {
			const id = `ia-mermaid-${mermaidIdCounter++}`;
			const { svg } = await mermaid.render(id, code);
			const container = doc.createElement('div');
			container.className = 'ia-mermaid';
			// Parse the SVG string into a real node tree rather than assigning
			// innerHTML, so we never write untrusted markup to the DOM directly.
			const svgDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
			const svgEl = svgDoc.documentElement;
			if (svgEl && svgEl.nodeName.toLowerCase() === 'svg') {
				container.appendChild(doc.importNode(svgEl, true));
			}
			pre.replaceWith(container);
			rendered++;
		} catch (error) {
			console.error('[RichMarkdown] mermaid render failed', error);
			// Leave the original code block in place on failure.
		}
	}
	return rendered;
}

let mathJaxLoaded: Promise<void> | null = null;
let prismLoaded: Promise<unknown> | null = null;

/**
 * Pre-warm Obsidian's MathJax loader so `$…$` / `$$…$$` math in chat replies
 * typesets without a first-render delay. Memoized — loads at most once.
 */
export function preloadMathJax(): Promise<void> {
	if (!mathJaxLoaded) {
		mathJaxLoaded = loadMathJax().catch((error) => {
			console.error('[RichMarkdown] loadMathJax failed', error);
		});
	}
	return mathJaxLoaded;
}

/**
 * Pre-warm Obsidian's Prism loader and, if available, re-highlight any code in
 * `root` so fenced code blocks get syntax colors. Memoized loader.
 */
export async function highlightWithPrism(root: HTMLElement): Promise<void> {
	if (!prismLoaded) {
		prismLoaded = loadPrism().catch((error) => {
			console.error('[RichMarkdown] loadPrism failed', error);
			return null;
		});
	}
	const prism = (await prismLoaded) as
		| { highlightElement?(el: Element): void; highlightAllUnder?(el: Element): void }
		| null;
	if (!prism) return;
	if (typeof prism.highlightAllUnder === 'function') {
		prism.highlightAllUnder(root);
		return;
	}
	if (typeof prism.highlightElement === 'function') {
		root.querySelectorAll('pre > code').forEach((el) => prism.highlightElement?.(el));
	}
}

/**
 * Enhance a rendered-markdown element with Obsidian's native rich renderers:
 * linkify wikilinks (for hover previews), render mermaid diagrams, pre-warm
 * MathJax, and syntax-highlight code with Prism. Best-effort — failures in any one
 * step are logged and don't break the others. Returns once mermaid + prism have
 * settled (MathJax pre-warm is fire-and-forget).
 */
export async function enhanceRichMarkdown(root: HTMLElement): Promise<void> {
	linkifyWikilinks(root);
	void preloadMathJax();
	await Promise.all([
		renderMermaidBlocks(root).catch((error) =>
			console.error('[RichMarkdown] mermaid enhancement failed', error),
		),
		highlightWithPrism(root).catch((error) =>
			console.error('[RichMarkdown] prism enhancement failed', error),
		),
	]);
}
