import { App } from 'obsidian';
import { DATA_FOLDER, TOKEN_USAGE_PATH } from '@/constants';
import { ensureFolderExists } from '@/utils/file-system';

export interface UsageRecord {
	model: string;
	provider: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	timestamp: number;
	conversationId?: string;
}

interface TokenUsageFile {
	version: number;
	updatedAt: number;
	records: UsageRecord[];
}

export interface UsageSummary {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	callCount: number;
}

export class TokenUsageRepository {
	private initialized = false;

	constructor(private readonly _app: App, private readonly filePath = TOKEN_USAGE_PATH) {}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		await ensureFolderExists(this._app.vault.adapter, DATA_FOLDER);
		if (!(await this._app.vault.adapter.exists(this.filePath))) {
			await this._app.vault.adapter.write(
				this.filePath,
				JSON.stringify({ version: 1, records: [] }, null, 2)
			);
		}
		this.initialized = true;
	}

	async recordUsage(record: UsageRecord): Promise<void> {
		await this.initialize();
		const file = await this.readFile();
		file.records.push(record);
		// Keep last 1000 records to bound file size
		if (file.records.length > 1000) {
			file.records = file.records.slice(-1000);
		}
		await this.writeFile(file);
	}

	async getAllRecords(): Promise<UsageRecord[]> {
		await this.initialize();
		const file = await this.readFile();
		return [...file.records];
	}

	async getTotalByProvider(): Promise<Map<string, UsageSummary>> {
		await this.initialize();
		const file = await this.readFile();
		const map = new Map<string, UsageSummary>();

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
		await this.initialize();
		const file = await this.readFile();
		const map = new Map<string, UsageSummary>();

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
		await this.initialize();
		const file = await this.readFile();
		const s: UsageSummary = { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
		for (const r of file.records) {
			s.promptTokens += r.promptTokens;
			s.completionTokens += r.completionTokens;
			s.totalTokens += r.totalTokens;
		}
		s.callCount = file.records.length;
		return s;
	}

	async getRecentRecords(limit = 10): Promise<UsageRecord[]> {
		await this.initialize();
		const file = await this.readFile();
		return file.records.slice(-limit).reverse();
	}

	async getRecordsByDateRange(start: number, end: number): Promise<UsageRecord[]> {
		await this.initialize();
		const file = await this.readFile();
		return file.records.filter(r => r.timestamp >= start && r.timestamp <= end);
	}

	async clearAll(): Promise<void> {
		await this.initialize();
		await this.writeFile({ version: 1, updatedAt: Date.now(), records: [] });
	}

	private async readFile(): Promise<TokenUsageFile> {
		try {
			const raw = await this._app.vault.adapter.read(this.filePath);
			const parsed = JSON.parse(raw) as TokenUsageFile;
			return {
				version: parsed.version ?? 1,
				updatedAt: parsed.updatedAt ?? 0,
				records: Array.isArray(parsed.records) ? parsed.records : []
			};
		} catch {
			return { version: 1, updatedAt: 0, records: [] };
		}
	}

	private async writeFile(file: TokenUsageFile): Promise<void> {
		file.updatedAt = Date.now();
		await this._app.vault.adapter.write(this.filePath, JSON.stringify(file, null, 2));
	}
}
