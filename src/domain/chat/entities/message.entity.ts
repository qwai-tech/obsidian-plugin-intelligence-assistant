// Message entity as defined in the architecture
export class Message {
  constructor(
    public readonly id: string,
    public readonly content: string,
    public readonly role: 'user' | 'assistant' | 'system',
    public readonly timestamp: Date,
    public readonly metadata?: Record<string, any>
  ) {}

  static create(content: string, role: string, metadata?: Record<string, any>): Message {
    // Validate role
    if (!['user', 'assistant', 'system'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    return new Message(
      `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      role as 'user' | 'assistant' | 'system',
      new Date(),
      metadata
    );
  }

  updateContent(newContent: string): Message {
    return new Message(
      this.id,
      newContent,
      this.role,
      this.timestamp,
      this.metadata
    );
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      role: this.role,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}