import { App, Vault } from 'obsidian';
import type { Conversation } from '@/features/conversations';
import { pluginPaths, type PluginPaths } from '@/core/plugin-paths';
import { ensureFolderExists } from '@/core/utils/file-system';
import { JsonFile } from './json-file';
import { buildMetadata, conversationFileName, hasMetadataChanged, normalizeConversation, type ConversationIndex, type ConversationMetadata } from './conversation-records';

const INDEX_FILE_NAME = 'conversation-index.json';
const INDEX_FILE_VERSION = '2.0';
const LEGACY_ROOT_FOLDER = '.conversations';
const LEGACY_ROOT_INDEX_PATH = `${LEGACY_ROOT_FOLDER}/index.json`;


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
  private readonly paths: PluginPaths;
  private readonly conversationsFolder: string;
  private readonly indexFilePath: string;
  private readonly indexFile: JsonFile<ConversationIndex>;
  private _writeLock: Promise<void> = Promise.resolve();
  private _indexCache: ConversationIndex | null = null;

  private get legacyPluginIndexPath(): string {
    return `${this.paths.legacyConversations}/${INDEX_FILE_NAME}`;
  }

  constructor(app: App) {
    this.vault = app.vault;
    this.paths = pluginPaths(app.vault.configDir);
    this.conversationsFolder = this.paths.conversations;
    this.indexFilePath = `${this.conversationsFolder}/${INDEX_FILE_NAME}`;
    this.indexFile = new JsonFile<ConversationIndex>(app.vault.adapter, this.indexFilePath, () => ({ version: INDEX_FILE_VERSION, conversations: [] }));
  }

  /**
   * Public initialization hook (idempotent)
   */
  private async _withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this._writeLock;
    let release: () => void;
    this._writeLock = new Promise<void>(resolve => { release = resolve; });
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Create a new conversation and persist it with metadata
   */
  async createConversation(conversation: Conversation): Promise<void> {
    await this.ensureInitialized();
    await this._withWriteLock(async () => {
      const index = await this.loadIndex();
      const normalizedConversation = normalizeConversation(conversation);
      const filePath = `${this.conversationsFolder}/${conversationFileName(normalizedConversation, index)}`;

      await this.writeConversationFile(filePath, normalizedConversation);

      const metadata = buildMetadata(normalizedConversation, filePath);
      const updatedIndex: ConversationIndex = {
        version: INDEX_FILE_VERSION,
        conversations: [...index.conversations, metadata].sort((a, b) => b.updatedAt - a.updatedAt)
      };

      await this.saveIndex(updatedIndex);
    });
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
      const conversation = normalizeConversation(JSON.parse(conversationFile) as Conversation);

      const refreshedMetadata = buildMetadata(conversation, metadata.file);
      const metadataChanged = hasMetadataChanged(metadata, refreshedMetadata);

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
    await this._withWriteLock(async () => {
      const index = await this.loadIndex();
      const metadata = index.conversations.find(conv => conv.id === conversation.id);

      if (!metadata) {
        throw new Error(`Conversation ${conversation.id} not found in index`);
      }

      const normalizedConversation = normalizeConversation(conversation);
      await this.writeConversationFile(metadata.file, normalizedConversation);

      const refreshedMetadata = buildMetadata(normalizedConversation, metadata.file);
      const updatedIndex = {
        version: INDEX_FILE_VERSION,
        conversations: index.conversations
          .map(conv => (conv.id === refreshedMetadata.id ? refreshedMetadata : conv))
          .sort((a, b) => b.updatedAt - a.updatedAt)
      };

      await this.saveIndex(updatedIndex);
    });
  }

  /**
   * Delete a conversation and remove metadata
   */
  async deleteConversation(convId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this._withWriteLock(async () => {
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
    });
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

    await ensureFolderExists(this.vault.adapter, this.paths.base);
    await ensureFolderExists(this.vault.adapter, this.paths.data);
    await ensureFolderExists(this.vault.adapter, this.conversationsFolder);

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
    if (this._indexCache) return this._indexCache;
    const index = await this.indexFile.read();
    index.version ||= INDEX_FILE_VERSION;
    index.conversations ??= [];
    this._indexCache = index;
    return index;
  }

  private async saveIndex(index: ConversationIndex): Promise<void> {
    this._indexCache = index;
    await this.indexFile.write(index);
  }

  private async writeConversationFile(filePath: string, conversation: Conversation): Promise<void> {
    await new JsonFile<Conversation>(this.vault.adapter, filePath, () => conversation).write(conversation);
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
    if (!(await adapter.exists(this.legacyPluginIndexPath))) {
      return false;
    }

    try {
      const legacyRaw = await adapter.read(this.legacyPluginIndexPath);
      const legacyIndex = JSON.parse(legacyRaw) as ConversationIndex;
      const migratedIndex: ConversationIndex = { version: INDEX_FILE_VERSION, conversations: [] };

      for (const entry of legacyIndex.conversations || []) {
        try {
          if (!(await adapter.exists(entry.file))) continue;
          const fileContent = await adapter.read(entry.file);
          const conversation = normalizeConversation(JSON.parse(fileContent) as Conversation);
          const filePath = `${this.conversationsFolder}/${conversationFileName(conversation, migratedIndex)}`;
          await this.writeConversationFile(filePath, conversation);
          migratedIndex.conversations.push(buildMetadata(conversation, filePath));
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
          const conversation = normalizeConversation(JSON.parse(fileContent) as Conversation);
          const filePath = `${this.conversationsFolder}/${conversationFileName(conversation, migratedIndex)}`;
          await this.writeConversationFile(filePath, conversation);
          migratedIndex.conversations.push(buildMetadata(conversation, filePath));
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
}
