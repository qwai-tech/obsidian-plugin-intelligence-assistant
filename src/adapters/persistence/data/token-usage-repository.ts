import type { App } from 'obsidian';
import type { UsageRecord } from '@/features/usage';
import { JsonFile } from '@/adapters/persistence/json-file';

interface TokenUsageFile {
	version: number;
	updatedAt: number;
	records: UsageRecord[];
	archivedByProvider?: Record<string, UsageSummary>;
	archivedByModel?: Record<string, UsageSummary>;
}

export interface UsageSummary {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	callCount: number;
}

const MAX_RECORDS = 1000;

export class TokenUsageRepository {
	private readonly file: JsonFile<TokenUsageFile>;

	constructor(app: App, filePath: string) {
		this.file = new JsonFile(app.vault.adapter, filePath, () => ({ version: 1, updatedAt: 0, records: [] }));
	}

	async recordUsage(record: UsageRecord): Promise<void> {
		await this.mutate((file) => {
			file.records.push(record);
			if (file.records.length > MAX_RECORDS) {
				const retired = file.records.splice(0, file.records.length - MAX_RECORDS);
				file.archivedByProvider ??= {};
				file.archivedByModel ??= {};
				for (const item of retired) {
					accumulate(file.archivedByProvider, item.provider, item);
					accumulate(file.archivedByModel, item.model, item);
				}
			}
		});
	}

	async getAllRecords(): Promise<UsageRecord[]> {
		const file = await this.records();
		return [...file.records];
	}

	async getTotalByProvider(): Promise<Map<string, UsageSummary>> {
		const file = await this.records();
		const map = new Map<string, UsageSummary>(Object.entries(file.archivedByProvider ?? {}).map(([key, value]) => [key, { ...value }]));

		for (const r of file.records) {
			const s = map.get(r.provider) || { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
			s.promptTokens += r.promptTokens;
			s.completionTokens += r.completionTokens;
			s.totalTokens += r.totalTokens;
			s.callCount += 1;
			map.set(r.provider, s);
		}
		return map;
	}

	async getTotalByModel(): Promise<Map<string, UsageSummary>> {
		const file = await this.records();
		const map = new Map<string, UsageSummary>(Object.entries(file.archivedByModel ?? {}).map(([key, value]) => [key, { ...value }]));

		for (const r of file.records) {
			const s = map.get(r.model) || { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
			s.promptTokens += r.promptTokens;
			s.completionTokens += r.completionTokens;
			s.totalTokens += r.totalTokens;
			s.callCount += 1;
			map.set(r.model, s);
		}
		return map;
	}

	async getGrandTotal(): Promise<UsageSummary> {
		const file = await this.records();
		const s: UsageSummary = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
		for (const r of file.records) {
			s.promptTokens += r.promptTokens;
			s.completionTokens += r.completionTokens;
			s.totalTokens += r.totalTokens;
		}
		s.callCount = file.records.length;
		for (const archived of Object.values(file.archivedByProvider ?? {})) {
			s.promptTokens += archived.promptTokens; s.completionTokens += archived.completionTokens; s.totalTokens += archived.totalTokens; s.callCount += archived.callCount;
		}
		return s;
	}

	async getRecentRecords(limit = 10): Promise<UsageRecord[]> {
		const file = await this.records();
		return file.records.slice(-limit).reverse();
	}

	async getRecordsByDateRange(start: number, end: number): Promise<UsageRecord[]> {
		const file = await this.records();
		return file.records.filter(r => r.timestamp >= start && r.timestamp <= end);
	}

	async clearAll(): Promise<void> {
		await this.mutate((file) => {
			file.records = [];
			file.archivedByProvider = {};
			file.archivedByModel = {};
		});
	}

	private async mutate(change: (file: TokenUsageFile) => void): Promise<void> {
		await this.file.update((file) => {
			file.records = Array.isArray(file.records) ? file.records : [];
			change(file);
			file.updatedAt = Date.now();
		});
	}

	private async records(): Promise<TokenUsageFile> {
		const file = await this.file.read();
		return { ...file, records: Array.isArray(file.records) ? file.records : [] };
	}
}

function accumulate(map: Record<string, UsageSummary>, key: string, item: UsageRecord): void {
	const old = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
	Object.defineProperty(map, key, { configurable: true, enumerable: true, writable: true, value: { promptTokens: old.promptTokens + item.promptTokens, completionTokens: old.completionTokens + item.completionTokens, totalTokens: old.totalTokens + item.totalTokens, callCount: old.callCount + 1 } });
}
