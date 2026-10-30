import { SettingPage } from 'obsidian';

export type SectionRenderer = (containerEl: HTMLElement, rerender: () => void) => void;

export class SectionPage extends SettingPage {
	constructor(title: string, private readonly render: SectionRenderer) {
		super();
		this.title = title;
	}

	display(): void {
		this.containerEl.empty();
		this.render(this.containerEl, () => this.display());
	}
}
