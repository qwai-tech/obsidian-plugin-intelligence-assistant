// Message repository
import { Vault } from 'obsidian';
import { MessageEntity } from '../../../domain/chat/entities/message.entity';
import { BaseObsidianRepository } from './base-obsidian-repository';

class MessageSerializer {
  serialize(message: MessageEntity): string {
    return JSON.stringify({
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp.toISOString(),
      metadata: message.metadata
    });
  }

  deserialize(content: string): MessageEntity {
    const data = JSON.parse(content) as {
      id: string;
      content: string;
      role: 'user' | 'assistant' | 'system';
      timestamp: string | number | Date;
      metadata?: Record<string, unknown>;
    };
    return new MessageEntity(
      data.id,
      data.content,
      data.role,
      new Date(data.timestamp),
      data.metadata
    );
  }
}

export class MessageRepository extends BaseObsidianRepository<MessageEntity> {
  constructor(vault: Vault) {
    super(vault, 'chats/messages', new MessageSerializer());
  }

  protected getEntityId(entity: MessageEntity): string {
    return entity.id;
  }
}