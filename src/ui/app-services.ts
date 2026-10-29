import type { RAGManager } from '@/adapters/rag/rag-manager';
import type { ToolSourceManager } from '@/features/tools';
import type { ChatService, VaultExportService, ConversationNamer } from '@/features/chat';
import type { ConversationStorageService } from '@/adapters/persistence/conversation-storage-service';
import type { TokenUsageRepository } from '@/adapters/persistence/data/token-usage-repository';
import type { RunActivity } from '@/features/agent';
import type { OllamaAdmin } from '@/features/llm';

export interface AppServices {
	readonly rag: RAGManager;
	readonly tools: ToolSourceManager;
	readonly chat: ChatService;
	readonly vaultExport: VaultExportService;
	readonly conversations: ConversationStorageService;
	readonly usage: TokenUsageRepository;
	readonly activity: RunActivity;
	readonly ollama: OllamaAdmin;
	readonly namer: ConversationNamer;
}
