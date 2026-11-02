import { normalizePath, type DataAdapter } from 'obsidian';
import type { OpenApiSpecCache } from '@/features/tools';
import { ensureFolderExists } from '@/core/utils/file-system';

export class AdapterOpenApiSpecCache implements OpenApiSpecCache {
	constructor(private readonly adapter: DataAdapter, private readonly folder: string) {}

	async read(configId: string): Promise<string | null> {
		const path = this.pathOf(configId);
		return (await this.adapter.exists(path)) ? await this.adapter.read(path) : null;
	}

	async write(configId: string, spec: string): Promise<void> {
		await ensureFolderExists(this.adapter, normalizePath(this.folder));
		await this.adapter.write(this.pathOf(configId), spec);
	}

	private pathOf(configId: string): string {
		return normalizePath(`${this.folder}/${configId}.json`);
	}
}
