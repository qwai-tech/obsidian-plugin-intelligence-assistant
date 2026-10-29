/**
 * Fine-grained incremental RAG indexing.
 *
 * Historically the plugin had a single coarse vault listener (RAGManager's
 * internal `modify` handler) that re-indexed a whole file on change and nothing
 * else. This wires the full set of Vault + MetadataCache events
 * (create / modify / delete / rename + metadataCache `changed`) to incremental
 * operations so a single file change touches only that file's chunks instead of
 * triggering a full vault reindex.
 *
 * The handler factory (`createIncrementalIndexHandlers`) is deliberately
 * decoupled from the Obsidian `Plugin` base so it can be unit-tested with a fake
 * index target and plain event emitters.
 */

/** Opaque timer handle — number (browser) or Node Timeout, kept abstract. */
export type TimerHandle = unknown;

/** The slice of RAGManager the incremental indexer needs. Keeps it testable. */
export interface IncrementalIndexTarget {
	/** (Re)index a single file's chunks. */
	indexFile(file: { path: string; extension?: string; basename?: string }): Promise<void>;
	/** Drop a single file's chunks from the index. */
	removeFile(path: string): Promise<number>;
	/** Re-key a renamed/moved file's chunks. */
	renameFile(oldPath: string, newPath: string): Promise<number>;
}

/** Minimal shape of the RAG config gate (enabled + per-change indexing flag). */
export interface IncrementalIndexConfig {
	enabled: boolean;
	embedChangedFiles: boolean;
}

interface AbstractFileLike {
	path: string;
	extension?: string;
	basename?: string;
}

export interface IncrementalIndexHandlers {
	onCreate(file: AbstractFileLike): void;
	onModify(file: AbstractFileLike): void;
	onDelete(file: AbstractFileLike): void;
	onRename(file: AbstractFileLike, oldPath: string): void;
	/** metadataCache `changed` — frontmatter/heading/link graph for one file settled. */
	onMetadataChanged(file: AbstractFileLike): void;
	/** Flush any pending debounced work (mainly for tests / teardown). */
	flush(): void;
}

function isMarkdown(file: AbstractFileLike): boolean {
	// `extension` is unset on folders; only markdown files participate in RAG.
	return (file.extension ?? (file.path.split('.').pop() ?? '')) === 'md';
}

/**
 * Build the incremental event handlers. `getConfig` is read on every event so a
 * settings change (enable/disable RAG, toggle embedChangedFiles) takes effect
 * without re-registering. Rapid `modify`/`changed` bursts for the same file are
 * debounced into a single `indexFile` call.
 */
export function createIncrementalIndexHandlers(
	target: IncrementalIndexTarget,
	getConfig: () => IncrementalIndexConfig,
	options: {
		debounceMs?: number;
		setTimeoutFn?: (fn: () => void, ms: number) => TimerHandle;
		clearTimeoutFn?: (handle: TimerHandle) => void;
		onError?: (err: unknown, context: string) => void;
	} = {},
): IncrementalIndexHandlers {
	const debounceMs = options.debounceMs ?? 750;
	const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => window.setTimeout(fn, ms));
	const clearTimeoutFn = options.clearTimeoutFn ?? ((h) => window.clearTimeout(h as number));
	const onError = options.onError ?? ((err, ctx) => console.error(`[RAG incremental] ${ctx}`, err));

	const pending = new Map<string, TimerHandle>();

	const indexActive = (): boolean => {
		const cfg = getConfig();
		return cfg.enabled && cfg.embedChangedFiles;
	};

	const runIndex = (file: AbstractFileLike): void => {
		void target.indexFile(file).catch((err) => onError(err, `indexFile ${file.path}`));
	};

	const scheduleIndex = (file: AbstractFileLike): void => {
		const existing = pending.get(file.path);
		if (existing) clearTimeoutFn(existing);
		const handle = setTimeoutFn(() => {
			pending.delete(file.path);
			runIndex(file);
		}, debounceMs);
		pending.set(file.path, handle);
	};

	const cancelPending = (path: string): void => {
		const existing = pending.get(path);
		if (existing) {
			clearTimeoutFn(existing);
			pending.delete(path);
		}
	};

	return {
		onCreate(file) {
			if (!indexActive() || !isMarkdown(file)) return;
			// A freshly-created note: index immediately (no debounce needed).
			runIndex(file);
		},
		onModify(file) {
			if (!indexActive() || !isMarkdown(file)) return;
			scheduleIndex(file);
		},
		onMetadataChanged(file) {
			if (!indexActive() || !isMarkdown(file)) return;
			// Metadata (frontmatter/headings/links) settled — coalesce with any
			// in-flight modify for the same file.
			scheduleIndex(file);
		},
		onDelete(file) {
			if (!getConfig().enabled) return;
			cancelPending(file.path);
			void target.removeFile(file.path).catch((err) => onError(err, `removeFile ${file.path}`));
		},
		onRename(file, oldPath) {
			if (!getConfig().enabled) return;
			cancelPending(oldPath);
			cancelPending(file.path);
			if (!isMarkdown(file)) {
				// Renamed to a non-markdown extension — drop old chunks.
				void target.removeFile(oldPath).catch((err) => onError(err, `removeFile ${oldPath}`));
				return;
			}
			void target.renameFile(oldPath, file.path).catch((err) => onError(err, `renameFile ${oldPath} -> ${file.path}`));
		},
		flush() {
			for (const [path, handle] of pending) {
				clearTimeoutFn(handle);
				pending.delete(path);
			}
		},
	};
}
