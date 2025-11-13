/**
 * Conversation Migration Service
 * Handles migration from old array-based storage to new file-based storage
 */

import { Conversation } from '@/types/core/conversation';
import { ConversationStorageService } from './conversation-storage-service';

export class ConversationMigrationService {
  constructor(private storageService: ConversationStorageService) {}

  /**
   * Migrate conversations from old array format to new file-based format
   */
  async migrateFromOldFormat(oldConversations: Conversation[]): Promise<boolean> {
    if (!oldConversations || !Array.isArray(oldConversations)) {
      console.debug('No old conversations to migrate');
      return true;
    }

    console.debug(`Starting migration of ${oldConversations.length} conversations`);
    
    // Process each conversation
    for (const conv of oldConversations) {
      try {
        // Ensure conversation has all required properties
        const normalizedConv = this.normalizeConversation(conv);
        
        // Create the conversation file
        await this.storageService.createConversation(normalizedConv);
        console.debug(`Migrated conversation: ${conv.id} - ${conv.title}`);
      } catch (error) {
        console.error(`Error migrating conversation ${conv.id}:`, error);
        return false;
      }
    }

    console.debug(`Successfully migrated ${oldConversations.length} conversations`);
    return true;
  }

  /**
   * Normalize conversation to ensure it has all required properties
   */
  private normalizeConversation(conv: Conversation): Conversation {
    // Ensure all required fields are present
    const normalized: Conversation = {
      id: conv.id || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: conv.title || 'Untitled Conversation',
      messages: conv.messages || [],
      createdAt: conv.createdAt || Date.now(),
      updatedAt: conv.updatedAt || Date.now(),
      icon: conv.icon,
      mode: conv.mode || 'chat'
    };

    return normalized;
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    const count = await this.storageService.getConversationCount();
    return count === 0; // If no conversations in new format, migration is likely needed
  }
}
