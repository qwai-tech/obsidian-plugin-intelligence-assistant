import { App, TFile, loadPdfJs } from 'obsidian';
import { Tool, ToolDefinition, ToolResult } from './types';
import { createToolDefinition } from '@/application/tools/tool-schema';
import { z } from 'zod';

/** Hard cap on extracted characters so we never blow up the model context. */
const MAX_TEXT_CHARS = 50_000;

/** Minimal subset of the pdf.js shape we rely on (loadPdfJs() is typed `any`). */
interface PdfTextItem {
	str?: string;
}
interface PdfTextContent {
	items: PdfTextItem[];
}
interface PdfPage {
	getTextContent(): Promise<PdfTextContent>;
}
interface PdfDocument {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfPage>;
}
interface PdfDocumentLoadingTask {
	promise: Promise<PdfDocument>;
}
interface PdfJsModule {
	getDocument(src: { data: ArrayBuffer }): PdfDocumentLoadingTask;
}

/**
 * ReadPdfTool — extract plain text from a PDF stored in the vault using
 * Obsidian's bundled pdf.js (via `loadPdfJs()`), so the agent can read PDFs,
 * not just markdown.
 */
export class ReadPdfTool implements Tool {
	constructor(private _app: App) {}

	definition: ToolDefinition = createToolDefinition({
		name: 'read_pdf',
		description: 'Extract the text content of a PDF file stored in the vault.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				description: 'Path to the .pdf file in the vault',
				required: true,
			},
			{
				name: 'maxPages',
				type: 'number',
				description: 'Maximum number of pages to read (default: all pages)',
				required: false,
			},
		],
		inputSchema: z.object({
			path: z.string().min(1),
			maxPages: z.number().int().positive().optional(),
		}),
	});

	async execute(args: Record<string, unknown>): Promise<ToolResult> {
		try {
			const path = args.path as string;
			const maxPages = args.maxPages as number | undefined;

			const file = this._app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) {
				return { success: false, error: `File not found: ${path}` };
			}
			if (file.extension !== 'pdf') {
				return { success: false, error: `Not a PDF file: ${path}` };
			}

			const data = await this._app.vault.readBinary(file);

			// loadPdfJs() returns the pdf.js module bundled with Obsidian (typed `any`).
			const pdfjs = (await loadPdfJs()) as PdfJsModule;
			const doc = await pdfjs.getDocument({ data }).promise;

			const total: number = doc.numPages;
			const pageCount = maxPages ? Math.min(maxPages, total) : total;

			const pageTexts: string[] = [];
			let charCount = 0;
			for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
				const page = await doc.getPage(pageNum);
				const content = await page.getTextContent();
				const items: PdfTextItem[] = content.items ?? [];
				const pageText = items.map((item) => item.str ?? '').join(' ').trim();
				pageTexts.push(pageText);
				charCount += pageText.length;
				if (charCount >= MAX_TEXT_CHARS) break;
			}

			let result = pageTexts.join('\n\n');
			let truncated = false;
			if (result.length > MAX_TEXT_CHARS) {
				result = result.slice(0, MAX_TEXT_CHARS);
				truncated = true;
			}
			if (pageCount < total || truncated) {
				result += `\n\n[Truncated: read ${pageCount} of ${total} page(s)${truncated ? ', text capped' : ''}]`;
			}

			return { success: true, result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
