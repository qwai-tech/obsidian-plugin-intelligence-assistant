// Chat state as specified in architecture
import { ConversationModel } from '@/domain/chat/entities/conversation.model';
import type { Message } from '@/types';

type ChatStateSnapshot = {
  currentConversation: ConversationModel | null;
  isLoading: boolean;
  messages: Message[];
};

type StateListener = (state: ChatStateSnapshot) => void;

export class ChatState {
  private currentConversation: ConversationModel | null = null;
  private isLoading = false;
  private listeners: StateListener[] = [];

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notify(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  getState(): ChatStateSnapshot {
    return {
      currentConversation: this.currentConversation,
      isLoading: this.isLoading,
      messages: this.currentConversation ? this.currentConversation.getMessages() : []
    };
  }

  setCurrentConversation(conversation: ConversationModel | null): void {
    this.currentConversation = conversation;
    this.notify();
  }

  setIsLoading(loading: boolean): void {
    this.isLoading = loading;
    this.notify();
  }

  addMessage(message: Message): void {
    if (this.currentConversation) {
      this.currentConversation.addMessage(message);
      this.notify();
    }
  }
}
