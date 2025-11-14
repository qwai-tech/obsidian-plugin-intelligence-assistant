// Chat view component
import { WorkspaceLeaf } from 'obsidian';
import { MessageListComponent } from './message-list.component';
import { ChatState, type ChatStateSnapshot } from '../../state/chat.state';
import type IntelligenceAssistantPlugin from '@plugin';

export class ChatViewComponent {
  private container: HTMLElement;
  private messageList: MessageListComponent;
  private chatState: ChatState;
  private inputElement: HTMLInputElement;

  constructor(
    private leaf: WorkspaceLeaf,
    private _plugin: IntelligenceAssistantPlugin
  ) {
    this.chatState = new ChatState();
    this.container = leaf.view.containerEl;
  }

  onload(): Promise<void> {
    this.container.empty();
    
    // Create chat interface
    const chatContainer = this.container.createDiv({ cls: 'ia-chat-container' });
    
    // Create message list
    const messageListEl = chatContainer.createDiv({ cls: 'ia-message-list' });
    this.messageList = new MessageListComponent(messageListEl);
    
    // Create input area
    const inputContainer = chatContainer.createDiv({ cls: 'ia-input-container' });
    this.inputElement = inputContainer.createEl('input', { 
      type: 'text', 
      cls: 'ia-chat-input',
      placeholder: 'Type your message...'
    });
    
    // Setup event listeners
    this.inputElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        void this.handleSendMessage();
      }
    });
    
    // Subscribe to state changes
    this.chatState.subscribe((state) => {
      this.updateView(state);
    });
    return Promise.resolve();
  }

  private updateView(state: ChatStateSnapshot): void {
    // Update message list
    if (state.currentConversation) {
      this.messageList.render(state.currentConversation.getMessages());
    }
  }

  private handleSendMessage(): Promise<void> {
    const content = this.inputElement.value.trim();
    if (!content) return;

    // Clear input
    this.inputElement.value = '';

    // Set loading state
    this.chatState.setIsLoading(true);

    try {
      // Use the plugin's chat service to send message
      // This would be injected based on the architecture
      // For now, we'll add a simple message as an example
      console.debug('Sending message:', content);
    } finally {
      this.chatState.setIsLoading(false);
    }
  }

  onunload(): void {
    // Cleanup if needed
  }
}
