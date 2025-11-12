// Message list component as specified in architecture
import type { Message } from '@/types';

export class MessageListComponent {
  private container: HTMLElement;
  private messages: Message[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(messages: Message[]): void {
    this.messages = messages;
    this.container.innerHTML = '';
    
    messages.forEach(message => {
      const messageEl = this.createMessageElement(message);
      this.container.appendChild(messageEl);
    });
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    const messageEl = this.createMessageElement(message);
    this.container.appendChild(messageEl);
    this.scrollToBottom();
  }

  private createMessageElement(message: Message): HTMLElement {
    const el = document.createElement('div');
    el.addClass('message');
    el.addClass(message.role);
    el.setText(message.content);
    return el;
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}
