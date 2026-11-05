export interface UsageRecord {
	model: string;
	provider: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	timestamp: number;
	conversationId?: string;
	requestId?: string;
	connectionId?: string;
	operation?: string;
	purpose?: string;
	status?: 'completed' | 'aborted' | 'failed';
	durationMs?: number;
	usageKnown?: boolean;
}
