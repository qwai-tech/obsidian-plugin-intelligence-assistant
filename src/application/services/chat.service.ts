// Chat Service as defined in the architecture
import { Message } from '../../domain/chat/entities/message.entity';
import { ConversationModel } from '../../domain/chat/entities/conversation.model';
import { IRepository } from '../../core/interfaces/repository.interface';
import { ILLMProvider } from '../../infrastructure/llm/base-provider.interface';
import { EventBus } from '../../core/event-bus';
import { IService } from '../../core/interfaces/service.interface';

// Alias Conversation to ConversationModel for compatibility
type Conversation = ConversationModel;

export class ChatService implements IService {
  public name = 'ChatService';
  public version = '0.0.1';

  constructor(
    private readonly messageRepo: IRepository<Message>,
    private readonly conversationRepo: IRepository<Conversation>,
    private readonly llmProvider: ILLMProvider,
    private readonly eventBus: EventBus
  ) {}

  async initialize(_config?: any): Promise<void> {
    console.debug('ChatService initialized');
  }

  async cleanup(): Promise<void> {
    console.debug('ChatService cleaned up');
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    // Create user message
    const userMessage = Message.create(content, 'user');
    await this.messageRepo.save(userMessage);

    // Get conversation to send to LLM
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation with id ${conversationId} not found`);
    }

    // Send to LLM
    const messagesForLLM = conversation.getMessages().map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await this.llmProvider.chatCompletion(
      messagesForLLM,
      { model: 'gpt-4', temperature: 0.7 }
    );

    // Create assistant message
    const assistantMessage = Message.create(response.content?.text || 'No response', 'assistant');
    await this.messageRepo.save(assistantMessage);

    // Add messages to conversation
    conversation.addMessage(userMessage);
    conversation.addMessage(assistantMessage);
    await this.conversationRepo.update(conversationId, conversation);

    // Emit event
    this.eventBus.emit('message:sent', {
      conversationId,
      userMessage,
      assistantMessage
    });

    return assistantMessage;
  }
}
