import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { VaultFixture } from '../../tests/e2e/support/vault-fixture';

describe('VaultFixture.findConversationFile', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ia-vault-fixture-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('returns a plugin-relative conversation path that readDataFile can load', async () => {
		const pluginDir = path.join(tmpDir, '.obsidian/plugins/intelligence-assistant');
		const conversationsDir = path.join(pluginDir, 'data/conversations');
		const fileName = '2026-05-29-001-conv-123.json';
		await fs.mkdir(conversationsDir, { recursive: true });
		await fs.writeFile(
			path.join(conversationsDir, 'conversation-index.json'),
			JSON.stringify({
				version: 1,
				conversations: [
					{
						id: 'conv:123',
						file: `.obsidian/plugins/intelligence-assistant/data/conversations/${fileName}`,
					},
				],
			}),
			'utf-8'
		);
		await fs.writeFile(
			path.join(conversationsDir, fileName),
			JSON.stringify({ id: 'conv:123', messages: [] }),
			'utf-8'
		);

		const vault = new VaultFixture(pluginDir);
		const relativePath = await vault.findConversationFile('conv:123');

		expect(relativePath).toBe(`data/conversations/${fileName}`);
		await expect(vault.readDataFile(relativePath)).resolves.toMatchObject({ id: 'conv:123' });
	});
});
