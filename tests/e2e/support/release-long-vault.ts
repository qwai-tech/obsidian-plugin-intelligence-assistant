interface VaultDump { path: string; content: string }

export async function dumpVaultMarkdown(): Promise<VaultDump[]> {
	return browser.execute(async () => {
		const app = (window as unknown as { app: { vault: { getMarkdownFiles(): Array<{ path: string }>; read(f: unknown): Promise<string> } } }).app;
		const out: VaultDump[] = [];
		for (const f of app.vault.getMarkdownFiles()) out.push({ path: f.path, content: await app.vault.read(f) });
		return out;
	});
}

export async function deleteByPaths(paths: string[]): Promise<void> {
	await browser.execute(async (ps) => {
		const app = (window as unknown as { app: { vault: { adapter: { exists(p: string): Promise<boolean>; remove(p: string): Promise<void> } } } }).app;
		for (const p of ps) if (await app.vault.adapter.exists(p)) await app.vault.adapter.remove(p);
	}, paths);
}

export async function assertReleaseChecker(): Promise<void> {
	const tools = await browser.execute(() => {
		const app = (window as unknown as { app: { plugins: { plugins: Record<string, { services: { tools: { registry: { getTools(): Array<{ llmName: string; toolId: string }> } } } }> } } }).app;
		return app.plugins.plugins['intelligence-assistant'].services.tools.registry.getTools().map(t => ({ name: t.llmName, id: t.toolId }));
	});
	if (!tools.some(t => t.id === 'cli:release-word-check:check_note' && t.name === 'check_note')) throw new Error('Real release word checker was not registered');
}
