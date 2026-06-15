/**
 * Obsidian capability manifest.
 *
 * Turns "which Obsidian API capabilities do we use / could we use" from prose
 * into an enforced, auditable artifact. The meta-test (`capability-manifest.test.ts`)
 * asserts every `used` entry is actually referenced in `src/` and (if given) has a
 * real test; the drift audit (`scripts/obsidian-api-audit.js`) cross-checks this
 * against `obsidian.d.ts` so newly-available or newly-unused APIs surface.
 *
 * Statuses:
 *  - `used`    : in production use. `probe` MUST appear in src; `test` (if set) must exist.
 *  - `planned` : a high-value opportunity not yet built. MUST have `tier` + `reason`.
 *  - `na`      : intentionally not applicable. MUST have `reason`.
 *
 * `probe` is the token grepped in `src/` to confirm real usage.
 */
export type CapabilityStatus = 'used' | 'planned' | 'na';

export interface Capability {
	/** Human-facing API name. */
	api: string;
	/** Token grepped in src/ to confirm real usage (for `used`) or absence (sanity for `planned`/`na`). */
	probe: string;
	status: CapabilityStatus;
	/** Priority tier for `planned` opportunities (1 = highest ROI). */
	tier?: 1 | 2 | 3;
	/** A test/mission that exercises this capability (for `used`). */
	test?: string;
	/** Rationale (required for `planned` and `na`). */
	reason?: string;
}

export const CAPABILITY_MANIFEST: Capability[] = [
	// ---- Used (in production) ----
	{ api: 'Plugin lifecycle (onload/onunload)', probe: 'extends Plugin', status: 'used' },
	{ api: 'addCommand', probe: 'addCommand', status: 'used' },
	{ api: 'registerView (custom ItemView)', probe: 'registerView', status: 'used' },
	{ api: 'addRibbonIcon', probe: 'addRibbonIcon', status: 'used' },
	{ api: 'addSettingTab / PluginSettingTab', probe: 'addSettingTab', status: 'used' },
	{ api: 'registerEvent', probe: 'registerEvent', status: 'used' },
	{ api: 'Vault.getMarkdownFiles', probe: 'getMarkdownFiles', status: 'used' },
	{ api: 'Vault.cachedRead', probe: 'cachedRead', status: 'used' },
	{ api: 'Vault.create/modify/read', probe: 'vault.create', status: 'used' },
	{ api: 'fileManager.trashFile/renameFile', probe: 'fileManager', status: 'used' },
	{ api: 'metadataCache.getFileCache (frontmatter/headings)', probe: 'getFileCache', status: 'used' },
	{ api: 'metadataCache.resolvedLinks / backlinks (link graph)', probe: 'resolvedLinks', status: 'used' },
	{ api: 'stringifyYaml (safe frontmatter serialization)', probe: 'stringifyYaml', status: 'used', test: 'src/__tests__/application/update-properties-tool.test.ts' },
	{ api: 'MarkdownRenderer', probe: 'MarkdownRenderer', status: 'used' },
	{ api: 'Menu (context menus)', probe: 'new Menu', status: 'used' },
	{ api: 'Notice', probe: 'new Notice', status: 'used' },
	{ api: 'setIcon', probe: 'setIcon', status: 'used' },
	{ api: 'Modal', probe: 'extends Modal', status: 'used' },
	{ api: 'Setting (settings UI builder)', probe: 'new Setting', status: 'used' },
	{ api: 'Editor / MarkdownView (editor quick actions)', probe: 'MarkdownView', status: 'used' },
	{ api: 'requestUrl (non-streaming HTTP)', probe: 'requestUrl', status: 'used' },
	{ api: 'normalizePath', probe: 'normalizePath', status: 'used' },
	{ api: 'ButtonComponent / ToggleComponent (form UI)', probe: 'ButtonComponent', status: 'used' },
	{ api: 'fileManager.generateMarkdownLink (vault-correct links)', probe: 'generateMarkdownLink', status: 'used', test: 'src/__tests__/application/pdf-tag-link-tools.test.ts' },
	{ api: 'loadPdfJs (read_pdf agent tool)', probe: 'loadPdfJs', status: 'used', test: 'src/__tests__/application/pdf-tag-link-tools.test.ts' },
	{ api: 'getAllTags / parseFrontMatter* / resolveSubpath / parseLinktext', probe: 'getAllTags', status: 'used', test: 'src/__tests__/application/pdf-tag-link-tools.test.ts' },

	// ---- Planned (high-value opportunities) ----
	{ api: 'Vault/MetadataCache events -> incremental RAG indexing', probe: 'metadataCache.on(', status: 'used', test: 'src/__tests__/infrastructure/incremental-indexer.test.ts' },
	{ api: 'fileManager.processFrontMatter (safe frontmatter edits)', probe: 'processFrontMatter', status: 'na', reason: 'Writes directly, bypassing the proposal/approval + autonomousWrite model. Safe frontmatter serialization is instead achieved via stringifyYaml while keeping the proposal model.' },
	{ api: 'registerMarkdownCodeBlockProcessor (inline AI widgets)', probe: 'registerMarkdownCodeBlockProcessor', status: 'used', test: 'src/__tests__/presentation/ai-code-block.test.ts' },
	{ api: 'EditorSuggest / AbstractInputSuggest (@-mentions)', probe: 'AbstractInputSuggest', status: 'used', test: 'src/__tests__/presentation/mention-suggest.test.ts' },
	{ api: 'registerObsidianProtocolHandler (deep links)', probe: 'registerObsidianProtocolHandler', status: 'used' },
	{ api: 'addStatusBarItem (agent status / token usage)', probe: 'addStatusBarItem', status: 'used' },
	{ api: 'htmlToMarkdown (web content -> markdown)', probe: 'htmlToMarkdown', status: 'used', test: 'src/__tests__/application/web-search-service.test.ts' },
	{ api: 'registerHoverLinkSource / HoverPopover (hover previews)', probe: 'registerHoverLinkSource', status: 'planned', tier: 3, reason: 'Hover previews for note references in chat.' },
	{ api: 'registerEditorExtension (CodeMirror inline AI)', probe: 'registerEditorExtension', status: 'planned', tier: 3, reason: 'Inline completions/decorations in the editor.' },
	{ api: 'loadMermaid / loadMathJax / loadPrism (rich chat rendering)', probe: 'loadMermaid', status: 'planned', tier: 3, reason: 'Render diagrams/math/code natively in chat replies.' },
	{ api: 'SuggestModal / FuzzySuggestModal (quick pickers)', probe: 'FuzzySuggestModal', status: 'planned', tier: 3, reason: 'Fuzzy agent/model/prompt switcher.' },
	{ api: 'onExternalSettingsChange + onUserEnable (lifecycle hooks)', probe: 'onExternalSettingsChange', status: 'used', test: 'src/__tests__/lifecycle-hooks.test.ts' },

	// ---- N/A (intentionally not applicable) ----
	{ api: 'Bases* (BasesView/BasesEntry/Value classes)', probe: 'BasesView', status: 'na', reason: 'Bases plugin view/formula API — out of scope for an agent/chat plugin.' },
	{ api: 'CapacitorAdapter / mobile drawers', probe: 'CapacitorAdapter', status: 'na', reason: 'Plugin is isDesktopOnly.' },
	{ api: 'Obsidian Publish variables', probe: 'WorkspaceFloating', status: 'na', reason: 'No Publish integration.' },
];
