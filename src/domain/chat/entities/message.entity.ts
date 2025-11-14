// Message entity as defined in the architecture
export class Message {
  public readonly id: string;
  public readonly content: string;
  public readonly role: 'user' | 'assistant' | 'system';
  public readonly timestamp: Date;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    id: string,
    content: string,
    role: 'user' | 'assistant' | 'system',
    timestamp: Date,
    metadata?: Record<string, unknown>
  ) {
    this.id = id;
    this.content = content;
    this.role = role;
    this.timestamp = timestamp;
    this.metadata = metadata;
  }

  static create(content: string, role: string, metadata?: Record<string, unknown>): Message {
    // Validate role
    if (!['user', 'assistant', 'system'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    return new Message(
      `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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
