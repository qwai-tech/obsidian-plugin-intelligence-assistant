import { App, Modal, Setting } from 'obsidian';
import { t } from '@/i18n';

export interface AgentTaskLaunchResult {
	taskInput: string;
	newConversation: boolean;
}

export class AgentTaskLaunchModal extends Modal {
	private readonly defaultTaskInput: string;
	private taskInput: string;
	private newConversation: boolean;
	private taskInputEl: HTMLTextAreaElement | null = null;
	private resolved = false;

	constructor(
		app: App,
		private readonly title: string,
		defaultTaskInput: string,
		defaultNewConversation: boolean,
		private readonly onSubmit: (result: AgentTaskLaunchResult | null) => void,
	) {
		super(app);
		this.defaultTaskInput = defaultTaskInput;
		this.taskInput = defaultTaskInput;
		this.newConversation = defaultNewConversation;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ia-agent-task-modal');
		contentEl.createEl('h2', { text: this.title });

		const fieldEl = contentEl.createDiv('ia-agent-task-modal__field');
		fieldEl.createEl('label', {
			text: t('chat.modals.agentTask.fieldLabel'),
			cls: 'ia-agent-task-modal__label',
		});

		this.taskInputEl = fieldEl.createEl('textarea', {
			cls: 'ia-agent-task-modal__textarea',
		});
		this.taskInputEl.value = this.taskInput;
		this.taskInputEl.rows = 7;
		this.taskInputEl.placeholder = t('chat.modals.agentTask.placeholder');
		this.taskInputEl.addEventListener('input', () => {
			this.taskInput = this.taskInputEl?.value ?? '';
		});
		this.taskInputEl.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				this.submit();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				this.cancel();
			}
		});

		// Use Setting for more native look
		new Setting(contentEl)
			.setName(t('chat.modals.agentTask.newConversation'))
			.setDesc(t('chat.modals.agentTask.newConversationDesc'))
			.addToggle(cb => {
				cb.setValue(this.newConversation)
					.onChange(value => {
						this.newConversation = value;
					});
			});

		const buttonContainer = contentEl.createDiv('ia-modal-footer ia-agent-task-modal__footer');
		
		const cancelBtn = buttonContainer.createEl('button', { text: t('chat.modals.agentTask.cancel') });
		cancelBtn.addEventListener('click', () => this.cancel());

		const startBtn = buttonContainer.createEl('button', { 
			text: t('chat.modals.agentTask.start'),
			cls: 'mod-cta'
		});
		startBtn.addEventListener('click', () => this.submit());

		activeWindow.setTimeout(() => {
			this.taskInputEl?.focus();
			this.taskInputEl?.select();
		}, 10);
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.onSubmit(null);
		}
		this.contentEl.empty();
	}

	private submit(): void {
		const taskInput = (this.taskInput.trim() || this.defaultTaskInput.trim());
		if (!taskInput) {
			return;
		}
		this.resolve({
			taskInput,
			newConversation: this.newConversation,
		});
	}

	private cancel(): void {
		this.resolve(null);
	}

	private resolve(result: AgentTaskLaunchResult | null): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.close();
		this.onSubmit(result);
	}
}

export function showAgentTaskLaunchModal(
	app: App,
	title: string,
	defaultTaskInput: string,
	defaultNewConversation = true,
): Promise<AgentTaskLaunchResult | null> {
	return new Promise(resolve => {
		new AgentTaskLaunchModal(app, title, defaultTaskInput, defaultNewConversation, resolve).open();
	});
}
