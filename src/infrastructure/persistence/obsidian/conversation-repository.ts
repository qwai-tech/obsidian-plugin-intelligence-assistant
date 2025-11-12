// Conversation repository
import { Vault } from 'obsidian';
import { ConversationModel } from '../../../domain/chat/entities/conversation.model';
import { BaseObsidianRepository } from './base-obsidian-repository';

class ConversationSerializer {
  serialize(conversation: ConversationModel): string {
    const data = conversation.toJSON();
    return JSON.stringify({
      ...data,
      createdAt: new Date(data.createdAt).toISOString(),
      updatedAt: new Date(data.updatedAt).toISOString()
    });
  }

  deserialize(content: string): ConversationModel {
    const data = JSON.parse(content);
    data.createdAt = new Date(data.createdAt).getTime();
    data.updatedAt = new Date(data.updatedAt).getTime();
    return ConversationModel.fromJSON(data);
  }
}

export class ConversationRepository extends BaseObsidianRepository<ConversationModel> {
  constructor(vault: Vault) {
    super(vault, 'chats/conversations', new ConversationSerializer());
  }

  protected getEntityId(entity: ConversationModel): string {
    return entity.getData().id;
  }
}