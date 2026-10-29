export interface UsageRecord {
	model: string;
	provider: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	timestamp: number;
	conversationId?: string;
}
