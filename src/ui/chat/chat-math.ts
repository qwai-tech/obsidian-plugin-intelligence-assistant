import { finishRenderMath, loadMathJax, renderMath } from 'obsidian';

export interface Formula {
	source: string;
	display: boolean;
}

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const MATH = /\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;
const TOKEN = /IAMATHTOKEN(\d+)END/g;

export function protectMath(markdown: string): { markdown: string; formulas: Formula[] } {
	const formulas: Formula[] = [];
	const protectedText = markdown.split(CODE).map((part, index) => index % 2 === 1 ? part : part.replace(MATH, (_whole, display: string | undefined, inline: string | undefined) => {
		formulas.push({ source: (display ?? inline ?? '').trim(), display: display !== undefined });
		return `IAMATHTOKEN${formulas.length - 1}END`;
	})).join('');
	return { markdown: protectedText, formulas };
}

export async function typesetMath(root: HTMLElement, formulas: Formula[]): Promise<void> {
	if (formulas.length === 0) return;
	const typeset = await loadMathJax().then(() => true, (error: unknown) => {
		console.error('[ChatMath] loadMathJax failed', error);
		return false;
	});
	for (const node of textNodesWithTokens(root)) {
		node.replaceWith(...splitTokens(node.data, formulas, typeset));
	}
	if (typeset) await finishRenderMath();
}

function textNodesWithTokens(root: HTMLElement): Text[] {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.instanceOf(Text) && node.data.includes('IAMATHTOKEN')) nodes.push(node);
	}
	return nodes;
}

function splitTokens(text: string, formulas: Formula[], typeset: boolean): Array<Node | string> {
	const parts: Array<Node | string> = [];
	let last = 0;
	for (const match of text.matchAll(TOKEN)) {
		const formula = formulas[Number(match[1])];
		parts.push(text.slice(last, match.index));
		if (!formula) {
			parts.push(match[0]);
		} else if (typeset) {
			parts.push(renderMath(formula.source, formula.display));
		} else {
			parts.push(formula.display ? `$$${formula.source}$$` : `$${formula.source}$`);
		}
		last = (match.index ?? 0) + match[0].length;
	}
	parts.push(text.slice(last));
	return parts.filter(part => part !== '');
}
