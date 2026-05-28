const PLUGIN_ID = 'intelligence-assistant';

export class EditorPage {
	async runQuickActionOnSelection(actionName: string, selectedText: string, filePath = 'E2E Quick Action.md'): Promise<string> {
		return browser.execute(async (pluginId, name, text, path) => {
			type MenuRecord = {
				title: string;
				icon: string;
				run: () => Promise<void> | void;
			};
			type ChainableMenuItem = {
				setTitle(title: string): ChainableMenuItem;
				setIcon(icon: string): ChainableMenuItem;
				onClick(callback: () => Promise<void> | void): ChainableMenuItem;
			};
			const app = (window as unknown as {
				app: {
					vault: {
						adapter: {
							exists(path: string): Promise<boolean>;
							remove(path: string): Promise<void>;
						};
						create(path: string, data: string): Promise<unknown>;
						getAbstractFileByPath(path: string): unknown;
					};
					workspace: {
						trigger(event: string, ...args: unknown[]): void;
						getLeaf(split?: boolean): {
							openFile(file: unknown): Promise<void>;
							view: {
								editor?: {
									getValue(): string;
									setValue(value: string): void;
									setSelection(anchor: { line: number; ch: number }, head: { line: number; ch: number }): void;
								};
							};
						};
					};
					plugins: {
						plugins: Record<string, {
							editorQuickActions?: {
								addMenuItems(menu: unknown, editor: unknown, view: unknown): void;
							};
						}>;
					};
				};
			}).app;

			if (await app.vault.adapter.exists(path)) {
				await app.vault.adapter.remove(path);
			}
			await app.vault.create(path, text);
			const file = app.vault.getAbstractFileByPath(path);
			if (!file) {
				throw new Error(`Editor fixture file not found: ${path}`);
			}

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file);
			const view = leaf.view;
			const editor = view.editor;
			if (!editor) {
				throw new Error('Active Markdown editor not available');
			}

			editor.setValue(text);
			editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: text.length });

			const records: MenuRecord[] = [];
			const menu = {
				addSeparator() {
					return menu;
				},
				addItem(callback: (item: ChainableMenuItem) => void) {
					const record: MenuRecord = { title: '', icon: '', run: () => undefined };
					const item: ChainableMenuItem = {
						setTitle(title: string) {
							record.title = title;
							return item;
						},
						setIcon(icon: string) {
							record.icon = icon;
							return item;
						},
						onClick(run: () => Promise<void> | void) {
							record.run = run;
							return item;
						},
					};
					callback(item);
					records.push(record);
					return menu;
				},
			};

			app.workspace.trigger('editor-menu', menu, editor, view);

			if (records.length === 0) {
				const plugin = app.plugins.plugins[pluginId];
				if (!plugin?.editorQuickActions?.addMenuItems) {
					throw new Error('Editor quick actions are not registered');
				}
				plugin.editorQuickActions.addMenuItems(menu, editor, view);
			}

			const item = records.find(record => record.title === name || record.title.endsWith(` ${name}`));
			if (!item) {
				throw new Error(`Quick action menu item not found: ${name}`);
			}
			await item.run();
			return editor.getValue();
		}, PLUGIN_ID, actionName, selectedText, filePath);
	}

	async removeFile(filePath: string): Promise<void> {
		await browser.execute(async (path) => {
			const adapter = (window as unknown as {
				app: { vault: { adapter: { exists(path: string): Promise<boolean>; remove(path: string): Promise<void> } } };
			}).app.vault.adapter;
			if (await adapter.exists(path)) {
				await adapter.remove(path);
			}
		}, filePath);
	}
}
