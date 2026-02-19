/**
 * Conversation Storage Service
 * Stores each conversation as an individual JSON file with a metadata index
 */

import { App, Vault } from 'obsidian';
import type { Conversation, ConversationConfig } from '@/types/core/conversation';
import { CONVERSATIONS_DATA_FOLDER, DATA_FOLDER, PLUGIN_BASE_FOLDER } from '@/constants';

const CONVERSATION_FOLDER = CONVERSATIONS_DATA_FOLDER;
const INDEX_FILE_NAME = 'conversation-index.json';
const INDEX_FILE_VERSION = '2.0';
const LEGACY_ROOT_FOLDER = '.conversations';
const LEGACY_ROOT_INDEX_PATH = `${LEGACY_ROOT_FOLDER}/index.json`;
const LEGACY_PLUGIN_CONVERSATION_FOLDER = `${PLUGIN_BASE_FOLDER}/.conversation`;
const LEGACY_PLUGIN_INDEX_PATH = `${LEGACY_PLUGIN_CONVERSATION_FOLDER}/${INDEX_FILE_NAME}`;

export type ConversationMode = 'chat' | 'agent';

interface ConversationMetadata {
  id: string;
  title: string;
  file: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  model?: string;
  mode: ConversationMode;
  icon?: string;
  agentId?: string;
  cliAgentId?: string;
}

interface ConversationIndex {
  version: string;
  conversations: ConversationMetadata[];
}

interface LegacyConversationMetadata {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  icon?: string;
}

interface LegacyConversationIndex {
  version?: string;
  conversations: LegacyConversationMetadata[];
}

export class ConversationStorageService {
  private vault: Vault;
  private initialized = false;
  private conversationsFolder: string = CONVERSATION_FOLDER;
  private indexFilePath: string = `${CONVERSATION_FOLDER}/${INDEX_FILE_NAME}`;

  constructor(private app: App) {
    this.vault = app.vault;
  }

  /**
   * Public initialization hook (idempotent)
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Create a new conversation and persist it with metadata
   */
  async createConversation(conversation: Conversation): Promise<void> {
    await this.ensureInitialized();
    const index = await this.loadIndex();

    const normalizedConversation = this.normalizeConversation(conversation);
    const filePath = this.generateConversationFilePath(normalizedConversation, index);

    await this.writeConversationFile(filePath, normalizedConversation);

    const metadata = this.buildMetadata(normalizedConversation, filePath);
    const updatedIndex: ConversationIndex = {
      version: INDEX_FILE_VERSION,
      conversations: [...index.conversations, metadata].sort((a, b) => b.updatedAt - a.updatedAt)
    };

    await this.saveIndex(updatedIndex);
  }

  /**
   * Load a conversation (updating metadata if newer data exists)
   */
  async loadConversation(convId: string): Promise<Conversation | null> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    const metadata = index.conversations.find(conv => conv.id === convId);

    if (!metadata) {
      return null;
    }

    try {
      const conversationFile = await this.vault.adapter.read(metadata.file);
      const conversation = this.normalizeConversation(JSON.parse(conversationFile) as Conversation);

      const refreshedMetadata = this.buildMetadata(conversation, metadata.file);
      const metadataChanged = this.hasMetadataChanged(metadata, refreshedMetadata);

      if (metadataChanged) {
        const updatedIndex = {
          version: INDEX_FILE_VERSION,
          conversations: index.conversations
            .map(conv => (conv.id === refreshedMetadata.id ? refreshedMetadata : conv))
            .sort((a, b) => b.updatedAt - a.updatedAt)
        };
        await this.saveIndex(updatedIndex);
      }

      return conversation;
    } catch (error) {
      console.error(`Error loading conversation ${convId}:`, error);
      return null;
    }
  }

  /**
   * Update an existing conversation
   */
  async updateConversation(conversation: Conversation): Promise<void> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    const metadata = index.conversations.find(conv => conv.id === conversation.id);

    if (!metadata) {
      throw new Error(`Conversation ${conversation.id} not found in index`);
    }

    const normalizedConversation = this.normalizeConversation(conversation);
    await this.writeConversationFile(metadata.file, normalizedConversation);

    const refreshedMetadata = this.buildMetadata(normalizedConversation, metadata.file);
    const updatedIndex = {
      version: INDEX_FILE_VERSION,
      conversations: index.conversations
        .map(conv => (conv.id === refreshedMetadata.id ? refreshedMetadata : conv))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    };

    await this.saveIndex(updatedIndex);
  }

  /**
   * Delete a conversation and remove metadata
   */
  async deleteConversation(convId: string): Promise<boolean> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    const entryIndex = index.conversations.findIndex(conv => conv.id === convId);

    if (entryIndex === -1) {
      return false;
    }

    const metadata = index.conversations[entryIndex];

    try {
      if (await this.vault.adapter.exists(metadata.file)) {
        await this.vault.adapter.remove(metadata.file);
      }
    } catch (error) {
      console.warn(`Failed to delete conversation file ${metadata.file}:`, error);
    }

    const updatedIndex = {
      version: INDEX_FILE_VERSION,
      conversations: index.conversations
        .filter(conv => conv.id !== convId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    };

    await this.saveIndex(updatedIndex);
    return true;
  }

  /**
   * Rename a conversation and update metadata
   */
  async renameConversation(convId: string, newTitle: string): Promise<boolean> {
    await this.ensureInitialized();
    const metadata = await this.getConversationMetadata(convId);

    if (!metadata) {
      return false;
    }

    const conversation = await this.loadConversation(convId);
    if (!conversation) {
      return false;
    }

    conversation.title = newTitle;
    conversation.updatedAt = Date.now();

    await this.updateConversation(conversation);
    return true;
  }

  /**
   * Fetch metadata for all conversations
   */
  async getAllConversationsMetadata(): Promise<ConversationMetadata[]> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    return index.conversations.map(meta => ({ ...meta }));
  }

  /**
   * Fetch metadata for a specific conversation
   */
  async getConversationMetadata(convId: string): Promise<ConversationMetadata | null> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    const metadata = index.conversations.find(conv => conv.id === convId);
    return metadata ? { ...metadata } : null;
  }

  /**
   * Count stored conversations
   */
  async getConversationCount(): Promise<number> {
    await this.ensureInitialized();
    const index = await this.loadIndex();
    return index.conversations.length;
  }

  /**
   * Helper used by settings tab
   */
  isInitialized(): Promise<boolean> {
    return Promise.resolve(this.initialized);
  }

  // ------------------------------
  // Internal helpers
  // ------------------------------

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const adapter = this.vault.adapter;

    await this.ensureFolderExists(PLUGIN_BASE_FOLDER);
    await this.ensureFolderExists(DATA_FOLDER);
    await this.ensureFolderExists(this.conversationsFolder);

    const indexExists = await adapter.exists(this.indexFilePath);
    if (!indexExists) {
      const migrated = await this.tryMigrations();
      if (!migrated) {
        await this.saveIndex({ version: INDEX_FILE_VERSION, conversations: [] });
      }
    }

    this.initialized = true;
  }

  private async loadIndex(): Promise<ConversationIndex> {
    try {
      const content = await this.vault.adapter.read(this.indexFilePath);
      const parsed = JSON.parse(content) as ConversationIndex;
      if (!parsed.version) {
        parsed.version = INDEX_FILE_VERSION;
      }
      return parsed;
    } catch (error) {
      console.error('Failed to load conversation index:', error);
      return { version: INDEX_FILE_VERSION, conversations: [] };
    }
  }

  private async saveIndex(index: ConversationIndex): Promise<void> {
    const payload = JSON.stringify(index, null, 2);
    await this.vault.adapter.write(this.indexFilePath, payload);
  }

  private normalizeConversation(conv: Conversation): Conversation {
    return {
      id: conv.id,
      title: conv.title || 'Untitled Conversation',
      messages: conv.messages ?? [],
      createdAt: conv.createdAt ?? Date.now(),
      updatedAt: conv.updatedAt ?? Date.now(),
      icon: conv.icon,
      mode: conv.mode ?? 'chat',
      config: this.normalizeConversationConfig(conv.config)
    };
  }

  private normalizeConversationConfig(config?: ConversationConfig): ConversationConfig | undefined {
    if (!config) return undefined;
    const normalizeId = (value?: string | null) => {
      if (value === null) return null;
      if (!value) return undefined;
      return value;
    };

    return {
      modelId: config.modelId || undefined,
      promptId: normalizeId(config.promptId),
      agentId: normalizeId(config.agentId),
      temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
      maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : undefined,
      ragEnabled: typeof config.ragEnabled === 'boolean' ? config.ragEnabled : undefined,
      webSearchEnabled: typeof config.webSearchEnabled === 'boolean' ? config.webSearchEnabled : undefined
    };
  }

  private buildMetadata(conversation: Conversation, file: string): ConversationMetadata {
    return {
      id: conversation.id,
      title: conversation.title,
      file,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
      model: conversation.config?.modelId || this.extractPrimaryModel(conversation) || undefined,
      mode: conversation.mode ?? 'chat',
      icon: conversation.icon,
      agentId: conversation.config?.agentId ?? undefined,
      cliAgentId: conversation.config?.cliAgentId ?? undefined
    };
  }

  private hasMetadataChanged(a: ConversationMetadata, b: ConversationMetadata): boolean {
    return (
      a.title !== b.title ||
      a.file !== b.file ||
      a.updatedAt !== b.updatedAt ||
      a.messageCount !== b.messageCount ||
      a.model !== b.model ||
      a.icon !== b.icon ||
      a.mode !== b.mode ||
      a.agentId !== b.agentId ||
      a.cliAgentId !== b.cliAgentId
    );
  }

  private async writeConversationFile(filePath: string, conversation: Conversation): Promise<void> {
    const payload = JSON.stringify(conversation, null, 2);
    await this.vault.adapter.write(filePath, payload);
  }

  private generateConversationFilePath(conversation: Conversation, index: ConversationIndex): string {
    const date = new Date(conversation.createdAt ?? Date.now());
    const datePrefix = this.formatDate(date);
    const sequence = this.getNextSequenceForDate(index, datePrefix);
    const sanitizedId = this.sanitizeId(conversation.id);
    const fileName = `${datePrefix}-${sequence.toString().padStart(3, '0')}-${sanitizedId}.json`;
    return `${this.conversationsFolder}/${fileName}`;
  }

  private getNextSequenceForDate(index: ConversationIndex, datePrefix: string): number {
    let maxSequence = 0;
    const regex = new RegExp(`${datePrefix}-(\\d+)-`);

    for (const meta of index.conversations) {
      const match = meta.file.match(regex);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (!Number.isNaN(seq)) {
          maxSequence = Math.max(maxSequence, seq);
        }
      }
    }

    return maxSequence + 1;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private sanitizeId(value: string): string {
    if (!value) return 'conversation';
    return value.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  private extractPrimaryModel(conversation: Conversation): string | null {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const message = conversation.messages[i];
      if (message.role === 'assistant' && message.model) {
        return message.model;
      }
    }
    return null;
  }

  private async tryMigrations(): Promise<boolean> {
    if (await this.migrateFromPluginLegacyStorage()) {
      return true;
    }
    if (await this.migrateFromRootLegacyStorage()) {
      return true;
    }
    return false;
  }

  private async migrateFromPluginLegacyStorage(): Promise<boolean> {
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(LEGACY_PLUGIN_INDEX_PATH))) {
      return false;
    }

    try {
      const legacyRaw = await adapter.read(LEGACY_PLUGIN_INDEX_PATH);
      const legacyIndex = JSON.parse(legacyRaw) as ConversationIndex;
      const migratedIndex: ConversationIndex = { version: INDEX_FILE_VERSION, conversations: [] };

      for (const entry of legacyIndex.conversations || []) {
        try {
          if (!(await adapter.exists(entry.file))) continue;
          const fileContent = await adapter.read(entry.file);
          const conversation = this.normalizeConversation(JSON.parse(fileContent) as Conversation);
          const filePath = this.generateConversationFilePath(conversation, migratedIndex);
          await this.writeConversationFile(filePath, conversation);
          migratedIndex.conversations.push(this.buildMetadata(conversation, filePath));
        } catch (error) {
          console.error(`Failed to migrate conversation ${entry.id}:`, error);
        }
      }

      migratedIndex.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      await this.saveIndex(migratedIndex);
      return true;
    } catch (error) {
      console.error('Failed to migrate legacy plugin conversations:', error);
      return false;
    }
  }

  private async migrateFromRootLegacyStorage(): Promise<boolean> {
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(LEGACY_ROOT_INDEX_PATH))) {
      return false;
    }

    try {
      const legacyRaw = await adapter.read(LEGACY_ROOT_INDEX_PATH);
      const legacyIndex = JSON.parse(legacyRaw) as LegacyConversationIndex;
      const migratedIndex: ConversationIndex = { version: INDEX_FILE_VERSION, conversations: [] };

      for (const entry of legacyIndex.conversations || []) {
        try {
          const fileContent = await adapter.read(entry.path);
          const conversation = this.normalizeConversation(JSON.parse(fileContent) as Conversation);
          const filePath = this.generateConversationFilePath(conversation, migratedIndex);
          await this.writeConversationFile(filePath, conversation);
          migratedIndex.conversations.push(this.buildMetadata(conversation, filePath));
        } catch (error) {
          console.error(`Failed to migrate conversation ${entry.id}:`, error);
        }
      }

      migratedIndex.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      await this.saveIndex(migratedIndex);
      return true;
    } catch (error) {
      console.warn('No legacy root conversation index found; starting fresh.', error);
      return false;
    }
  }

  private async ensureFolderExists(folder: string): Promise<void> {
    if (await this.vault.adapter.exists(folder)) {
      return;
    }

    const segments = folder.split('/');
    let current = '';
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!(await this.vault.adapter.exists(current))) {
        await this.vault.createFolder(current);
      }
    }
  }
}
