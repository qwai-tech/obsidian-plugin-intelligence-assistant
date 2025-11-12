// Message repository
import { Vault } from 'obsidian';
import { Message } from '../../../domain/chat/entities/message.entity';
import { BaseObsidianRepository } from './base-obsidian-repository';

class MessageSerializer {
  serialize(message: Message): string {
    return JSON.stringify({
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp.toISOString(),
      metadata: message.metadata
    });
  }

  deserialize(content: string): Message {
    const data = JSON.parse(content);
    return new Message(
      data.id,
      data.content,
      data.role,
      new Date(data.timestamp),
      data.metadata
    );
  }
}

export class MessageRepository extends BaseObsidianRepository<Message> {
  constructor(vault: Vault) {
    super(vault, 'chats/messages', new MessageSerializer());
  }

  protected getEntityId(entity: Message): string {
    return entity.id;
  }
}