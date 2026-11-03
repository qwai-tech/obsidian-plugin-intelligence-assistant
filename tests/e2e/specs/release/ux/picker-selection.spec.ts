import { ChatViewPage } from '../../../pages/chat/chat-view.page';
import { PickerPage } from '../../../pages/chat/picker.page';
import { UxProbePage } from '../../../pages/ux-probe.page';
import { waitForPluginReady } from '../../../support/plugin-helpers';
import { VaultFixture } from '../../../support/vault-fixture';

describe('UX review: picker selection state', () => {
	const chat = new ChatViewPage();
	const picker = new PickerPage();
	const probe = new UxProbePage();
	const vault = new VaultFixture();

	before(async () => {
		await vault.reset();
		await waitForPluginReady();
		await chat.open();
		await chat.newChat();
	});

	it('#8 shows which results are selected and how many will be added', async () => {
		await picker.openReferencePicker();
		await picker.clickRow(0);
		await picker.clickRow(1);
		await probe.capture('08-picker-selected');

		const rows = await picker.rowStates();
		expect(rows[0].background).not.toBe(rows[2].background);
		expect(rows[0].marked).toBe(true);
		expect(rows[2].marked).toBe(false);
		expect(await picker.addButtonText()).toMatch(/2/);

		await picker.addSelected();
		expect(await picker.attachedReferencePaths()).toHaveLength(2);
	});
});
