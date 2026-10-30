export interface SubTabOptions<T extends string> {
	tabs: Array<{ id: T; label: string }>;
	active: T;
	testId?: string;
	onSelect?: (id: T) => void;
	render: (content: HTMLElement, id: T) => void;
}

export function renderSubTabs<T extends string>(container: HTMLElement, options: SubTabOptions<T>): void {
	const bar = container.createDiv('settings-tabs');
	const content = container.createDiv('settings-tab-content');
	const buttons = options.tabs.map(({ id, label }) => {
		const button = bar.createEl('button', { text: label, cls: 'settings-tab' });
		button.dataset.subtabId = id;
		if (options.testId) button.setAttribute('data-testid', options.testId);
		button.addEventListener('click', () => select(id));
		return button;
	});
	const select = (id: T) => {
		buttons.forEach(button => button.toggleClass('is-active', button.dataset.subtabId === id));
		options.onSelect?.(id);
		content.empty();
		options.render(content, id);
	};
	buttons.forEach(button => button.toggleClass('is-active', button.dataset.subtabId === options.active));
	options.render(content, options.active);
}
