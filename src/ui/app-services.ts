import type { RAGManager } from '@/adapters/rag/rag-manager';
import type { ToolSourceManager } from '@/features/tools/tool-source-manager';
import type { ChatService } from '@/features/chat/chat.service';
import type { VaultExportService } from '@/features/chat/vault-export-service';
import type { ConversationStorageService } from '@/adapters/persistence/conversation-storage-service';
import type { TokenUsageRepository } from '@/adapters/persistence/data/token-usage-repository';
import type { RunActivity } from '@/features/agent/run-activity';
import type { OllamaAdmin } from '@/features/llm/ollama-admin';
import type { ConversationNamer } from '@/features/chat/conversation-namer';

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
