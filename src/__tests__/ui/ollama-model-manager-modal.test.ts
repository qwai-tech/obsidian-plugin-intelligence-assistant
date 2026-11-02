import { App } from 'obsidian';
import { OllamaModelManagerModal } from '@/ui/modals/ollama-model-manager-modal';
import { initI18n } from '@/i18n';

describe('OllamaModelManagerModal', () => {
	beforeAll(() => initI18n('en'));

	it('deletes a model by its Ollama name, without the ollama: prefix the list shows', async () => {
		const admin = { status: jest.fn(async () => ({ online: true })), remove: jest.fn(async () => undefined), pull: jest.fn() };
		const modal = new OllamaModelManagerModal(new App() as never, admin as never, {
			provider: 'ollama',
			baseUrl: 'http://localhost:11434',
			cachedModels: [{ id: 'ollama:qa-delete-probe:latest', name: 'qa-delete-probe:latest', provider: 'ollama', capabilities: ['chat'], enabled: true }],
		}, jest.fn());
		jest.spyOn(modal as unknown as { confirmDelete(message: string): Promise<boolean> }, 'confirmDelete').mockResolvedValue(true);
		jest.spyOn(modal as unknown as { refreshModelList(): Promise<void> }, 'refreshModelList').mockResolvedValue();
		modal.onOpen();

		modal.contentEl.querySelector<HTMLButtonElement>('.ia-button--danger')!.click();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(admin.remove).toHaveBeenCalledWith('http://localhost:11434', 'qa-delete-probe:latest');
	});
});
