import type { RAGManager } from '@/infrastructure/rag-manager';
import type { ToolSourceManager } from '@/application/tools/tool-source-manager';
import type { ChatService } from '@/application/services/chat.service';
import type { VaultExportService } from '@/application/services/vault-export-service';
import type { ConversationStorageService } from '@/infrastructure/persistence/conversation-storage-service';
import type { TokenUsageRepository } from '@/infrastructure/persistence/data/token-usage-repository';
import type { RunActivity } from '@/application/services/run-activity';
import type { OllamaAdmin } from '@/application/services/ollama-admin';
import type { ConversationNamer } from '@/application/services/conversation-namer';

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
