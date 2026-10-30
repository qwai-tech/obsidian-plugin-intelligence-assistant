import { App, Modal, Setting } from 'obsidian';
import type { AgentCapabilitySummary, CapabilityPermissionRow } from '@/features/agent';
import { t } from '@/i18n';

export class AgentCapabilityModal extends Modal {
	constructor(
		app: App,
		private readonly summary: AgentCapabilitySummary,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-agent-capability-modal');

		this.setTitle(t('capability.title'));
		contentEl.createEl('p', {
			cls: 'ia-agent-capability-modal__subtitle',
			text: t('capability.subtitle', { agent: this.summary.agentName, count: this.summary.toolCount }),
		});

		this.renderPermissions(contentEl);
		this.renderReferences(contentEl);
		this.renderTools(contentEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderPermissions(container: HTMLElement): void {
		const section = container.createDiv('ia-agent-capability-modal__section');
		new Setting(section).setName(t('capability.permissions')).setHeading();

		const grid = section.createDiv('ia-agent-capability-grid');
		for (const row of this.summary.permissions) {
			this.renderPermissionRow(grid, row);
		}
	}

	private renderPermissionRow(container: HTMLElement, row: CapabilityPermissionRow): void {
		const item = container.createDiv(`ia-agent-capability-row is-${row.tone}`);
		item.createDiv({ cls: 'ia-agent-capability-row__label', text: row.label });
		item.createDiv({ cls: 'ia-agent-capability-row__value', text: row.value });
	}

	private renderReferences(container: HTMLElement): void {
		if (this.summary.references.length === 0) return;

		const section = container.createDiv('ia-agent-capability-modal__section');
		new Setting(section).setName(t('capability.reads')).setHeading();
		const list = section.createEl('ul', { cls: 'ia-agent-capability-list' });
		for (const reference of this.summary.references) {
			list.createEl('li', { text: `${reference.type}: ${reference.path}` });
		}
	}

	private renderTools(container: HTMLElement): void {
		const section = container.createDiv('ia-agent-capability-modal__section');
		new Setting(section).setName(t('capability.tools')).setHeading();

		if (this.summary.toolGroups.length === 0) {
			section.createEl('p', {
				cls: 'ia-agent-capability-modal__empty',
				text: t('capability.noTools'),
			});
			return;
		}

		for (const group of this.summary.toolGroups) {
			const groupEl = section.createDiv('ia-agent-capability-tool-group');
			new Setting(groupEl).setName(group.label).setHeading();
			for (const tool of group.tools) {
				const toolEl = groupEl.createDiv('ia-agent-capability-tool');
				const title = toolEl.createDiv('ia-agent-capability-tool__title');
				title.createSpan({ cls: 'ia-agent-capability-tool__name', text: tool.name });
				if (tool.sideEffect === 'vault-write-proposal') {
					title.createSpan({ cls: 'ia-agent-capability-tool__tag is-warn', text: t('capability.tags.applyRequired') });
				} else if (tool.sideEffect === 'external-write') {
					title.createSpan({ cls: 'ia-agent-capability-tool__tag is-danger', text: t('capability.tags.externalWrite') });
				} else if (tool.sideEffect === 'local-process') {
					title.createSpan({ cls: 'ia-agent-capability-tool__tag is-danger', text: t('capability.tags.localProcess') });
				}
				toolEl.createDiv({ cls: 'ia-agent-capability-tool__description', text: tool.description });
			}
		}
	}
}
