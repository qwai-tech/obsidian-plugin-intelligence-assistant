import { FuzzySuggestModal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ModelInfo } from '@/types';
import { getModelDisplayName } from '@/presentation/components/chat/utils';

/**
 * Dependencies the model switcher needs, kept as a narrow interface so the modal
 * is unit-testable without a full Plugin instance.
 */
export interface ModelSwitcherDeps {
	/** The list of selectable models (the same list the chat model selector uses). */
	getModels(): ModelInfo[] | Promise<ModelInfo[]>;
	/** The currently-active model id (defaultModel), used to mark the active item. */
	getCurrentModelId(): string;
	/**
	 * Apply the chosen model: persist it as the default and refresh dependent UI.
	 * Returns once the selection has been persisted.
	 */
	applyModel(modelId: string): Promise<void>;
}

/**
 * Fuzzy command-palette-style switcher for the active model. Lists every model the
 * chat selector exposes; choosing one sets it as the default model, persists it,
 * and refreshes any open chat views. This is a real `FuzzySuggestModal<ModelInfo>`
 * — getItems/getItemText/onChooseItem all do real work.
 */
export class ModelSwitcherModal extends FuzzySuggestModal<ModelInfo> {
	private items: ModelInfo[] = [];

	constructor(app: App, private readonly deps: ModelSwitcherDeps) {
		super(app);
		this.setPlaceholder('Switch model…');
	}

	/** Pre-load the (possibly async) model list before opening so getItems is sync. */
	async load(): Promise<void> {
		this.items = await this.deps.getModels();
	}

	getItems(): ModelInfo[] {
		return this.items;
	}

	getItemText(item: ModelInfo): string {
		const name = item.name || getModelDisplayName(item.id) || item.id;
		const active = item.id === this.deps.getCurrentModelId() ? ' ✓' : '';
		return `${name} — ${item.provider}${active}`;
	}

	onChooseItem(item: ModelInfo): void {
		void this.deps
			.applyModel(item.id)
			.then(() => {
				new Notice(`Model switched to ${item.name || item.id}`);
			})
			.catch((error) => {
				console.error('[ModelSwitcher] Failed to apply model', error);
				new Notice('Failed to switch model.');
			});
	}
}

/**
 * Build, pre-load, and open a {@link ModelSwitcherModal}. Returns the modal so
 * callers/tests can inspect it.
 */
export async function openModelSwitcher(app: App, deps: ModelSwitcherDeps): Promise<ModelSwitcherModal> {
	const modal = new ModelSwitcherModal(app, deps);
	await modal.load();
	modal.open();
	return modal;
}
