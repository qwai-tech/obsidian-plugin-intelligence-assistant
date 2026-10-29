import type { Conversation, ConversationConfig } from '@/features/conversations';

export type ConversationMode = 'chat' | 'agent';

export interface ConversationMetadata {
  id: string;
  title: string;
  file: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  model?: string;
  mode: ConversationMode;
  icon?: string;
  agentId?: string;
}

export interface ConversationIndex {
  version: string;
  conversations: ConversationMetadata[];
}

export function normalizeConversation(conv: Conversation): Conversation {
  return {
    id: conv.id,
    title: conv.title || 'Untitled Conversation',
    messages: conv.messages ?? [],
    createdAt: conv.createdAt ?? Date.now(),
    updatedAt: conv.updatedAt ?? Date.now(),
    icon: conv.icon,
    mode: conv.mode ?? 'chat',
    config: normalizeConversationConfig(conv.config)
  };
}

export function buildMetadata(conversation: Conversation, file: string): ConversationMetadata {
  return {
    id: conversation.id,
    title: conversation.title,
    file,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    model: conversation.config?.modelId || extractPrimaryModel(conversation) || undefined,
    mode: conversation.mode ?? 'chat',
    icon: conversation.icon,
    agentId: conversation.config?.agentId ?? undefined
  };
}

export function hasMetadataChanged(a: ConversationMetadata, b: ConversationMetadata): boolean {
  return (
    a.title !== b.title ||
    a.file !== b.file ||
    a.updatedAt !== b.updatedAt ||
    a.messageCount !== b.messageCount ||
    a.model !== b.model ||
    a.icon !== b.icon ||
    a.mode !== b.mode ||
    a.agentId !== b.agentId
  );
}

export function conversationFileName(conversation: Conversation, index: ConversationIndex): string {
  const date = new Date(conversation.createdAt ?? Date.now());
  const datePrefix = formatDate(date);
  const sequence = getNextSequenceForDate(index, datePrefix);
  const sanitizedId = sanitizeId(conversation.id);
  const fileName = `${datePrefix}-${sequence.toString().padStart(3, '0')}-${sanitizedId}.json`;
  return fileName;
}

function normalizeConversationConfig(config?: ConversationConfig): ConversationConfig | undefined {
  if (!config) return undefined;
  const normalizeId = (value?: string | null) => {
    if (value === null) return null;
    if (!value) return undefined;
    return value;
  };

  return {
    modelId: config.modelId || undefined,
    promptId: normalizeId(config.promptId),
    agentId: normalizeId(config.agentId),
    temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
    maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : undefined,
    ragEnabled: typeof config.ragEnabled === 'boolean' ? config.ragEnabled : undefined,
    webSearchEnabled: typeof config.webSearchEnabled === 'boolean' ? config.webSearchEnabled : undefined
  };
}

function getNextSequenceForDate(index: ConversationIndex, datePrefix: string): number {
  let maxSequence = 0;
  const regex = new RegExp(`${datePrefix}-(\\d+)-`);

  for (const meta of index.conversations) {
    const match = meta.file.match(regex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq)) {
        maxSequence = Math.max(maxSequence, seq);
      }
    }
  }

  return maxSequence + 1;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeId(value: string): string {
  if (!value) return 'conversation';
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function extractPrimaryModel(conversation: Conversation): string | null {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message.role === 'assistant' && message.model) {
      return message.model;
    }
  }
  return null;
}
