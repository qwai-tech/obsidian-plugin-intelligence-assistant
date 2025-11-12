# API 文档

本文档描述了新架构的核心 API 接口和使用方法。

## 📚 目录

- [核心 API](#核心-api)
- [领域实体](#领域实体)
- [应用服务](#应用服务)
- [基础设施](#基础设施)
- [UI 组件](#ui-组件)
- [LLM 提供商](#llm-提供商)

## 🔧 核心 API

### Result<T>

统一的错误处理模式，避免异常传播。

```typescript
import { Result } from '../src/core';

// 创建成功结果
const success = Result.success('operation completed');

// 创建失败结果
const failure = Result.failure('operation failed', 'ERROR_CODE');

// 检查结果
if (result.isSuccess) {
  console.log(result.value); // 成功值
} else {
  console.error(result.error, result.code); // 错误信息
}
```

#### 方法

- `Result.success<T>(value: T): Result<T>` - 创建成功结果
- `Result.failure(error: string, code?: string): Result<never>` - 创建失败结果
- `Result.fromPromise<T>(promise: Promise<T>): Promise<Result<T>>` - 包装 Promise
- `Result.combine<T>(results: Result<T>[]): Result<T[]>` - 组合多个结果
- `result.map<U>(fn: (value: T) => U): Result<U>` - 映射成功值
- `result.flatMap<U>(fn: (value: T) => Result<U>): Result<U>` - 平面映射
- `result.getOrElse(defaultValue: T): T` - 获取值或默认值

### IService

服务生命周期接口。

```typescript
interface IService {
  readonly name: string;
  readonly version: string;
  readonly isInitialized: boolean;
  
  initialize(context: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  getStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'error';
    details?: any;
  }>;
}
```

### IRepository<T>

通用仓储接口。

```typescript
interface IRepository<T> {
  save(entity: T): Promise<Result<T>>;
  findById(id: string): Promise<Result<T | undefined>>;
  findAll(options?: QueryOptions): Promise<Result<T[]>>;
  update(id: string, updates: Partial<T>): Promise<Result<T>>;
  delete(id: string): Promise<Result<boolean>>;
  count(filter?: any): Promise<Result<number>>;
}
```

## 🏗️ 领域实体

### Message

消息实体模型。

```typescript
import { Message, MessageFactory } from '../src/domain/chat/entities';

// 创建用户消息
const userMessage = MessageFactory.createUser({
  conversationId: 'conv-123',
  content: 'Hello, world!',
  author: 'User'
});

// 创建 AI 消息
const aiMessage = MessageFactory.createAI({
  conversationId: 'conv-123',
  content: 'Hello! How can I help you?',
  author: 'Assistant',
  model: 'gpt-4',
  usage: {
    promptTokens: 10,
    completionTokens: 15,
    totalTokens: 25
  }
});

// 添加反应
aiMessage.addReaction('👍', 'user-id');
aiMessage.addReaction('❤️', 'user-id-2');

// 添加书签
aiMessage.addBookmark('Important response');

// 转换为存储格式
const storageData = aiMessage.toStorage();
```

#### 属性

- `id: string` - 消息唯一标识
- `conversationId: string` - 所属对话 ID
- `content: string` - 消息内容
- `role: 'user' | 'assistant' | 'system'` - 消息角色
- `author: string` - 作者名称
- `timestamp: number` - 创建时间戳
- `status: MessageStatus` - 消息状态
- `attachments: MessageAttachment[]` - 附件列表
- `reactions: Map<string, string[]>` - 反应映射
- `bookmarks: string[]` - 书签列表
- `metadata: Record<string, any>` - 元数据

#### 方法

- `updateContent(content: string): void` - 更新内容
- `addAttachment(attachment: MessageAttachment): void` - 添加附件
- `removeAttachment(id: string): void` - 移除附件
- `addReaction(emoji: string, userId: string): void` - 添加反应
- `removeReaction(emoji: string, userId: string): void` - 移除反应
- `addBookmark(reason?: string): void` - 添加书签
- `removeBookmark(): void` - 移除书签
- `toStorage(): any` - 转换为存储格式
- `validate(): ValidationResult` - 验证数据

### Conversation

对话实体模型。

```typescript
import { Conversation, ConversationFactory } from '../src/domain/chat/entities';

// 创建对话
const conversation = ConversationFactory.create({
  title: 'My Chat',
  agentId: 'agent-123',
  systemPrompt: 'You are a helpful assistant.'
});

// 更新设置
conversation.updateSettings({
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000
});

// 更新统计
conversation.updateStats({
  messageCount: 10,
  lastActivity: Date.now()
});

// 转换为存储格式
const storageData = conversation.toStorage();
```

#### 属性

- `id: string` - 对话唯一标识
- `title: string` - 对话标题
- `agentId: string` - 关联的代理 ID
- `systemPrompt: string` - 系统提示词
- `createdAt: number` - 创建时间
- `updatedAt: number` - 更新时间
- `settings: ConversationSettings` - 对话设置
- `stats: ConversationStats` - 统计信息
- `metadata: Record<string, any>` - 元数据

#### 方法

- `updateTitle(title: string): void` - 更新标题
- `updateSettings(settings: Partial<ConversationSettings>): void` - 更新设置
- `updateStats(stats: Partial<ConversationStats>): void` - 更新统计
- `incrementMessageCount(): void` - 增加消息计数
- `toStorage(): any` - 转换为存储格式
- `validate(): ValidationResult` - 验证数据

## 🎯 应用服务

### ChatService

聊天业务逻辑服务。

```typescript
import { ChatService } from '../src/application/services/chat.service';

// 创建服务实例
const chatService = new ChatService(messageRepo, conversationRepo, llmProvider);

// 初始化
await chatService.initialize(app);

// 发送消息
const result = await chatService.sendMessage('conv-123', userMessage);
if (result.isSuccess) {
  console.log('AI Response:', result.value.content);
} else {
  console.error('Send failed:', result.error);
}

// 获取对话历史
const history = await chatService.getConversationHistory('conv-123', {
  limit: 50,
  offset: 0
});

// 搜索消息
const searchResults = await chatService.searchMessages('conv-123', 'hello world');

// 删除消息
const deleted = await chatService.deleteMessage('conv-123', 'msg-456');
```

#### 方法

- `initialize(app: App): Promise<void>` - 初始化服务
- `sendMessage(conversationId: string, message: Message): Promise<Result<Message>>` - 发送消息
- `getConversationHistory(conversationId: string, options?: PaginationOptions): Promise<Result<Message[]>>` - 获取历史
- `searchMessages(conversationId: string, query: string): Promise<Result<Message[]>>` - 搜索消息
- `updateMessage(messageId: string, updates: Partial<Message>): Promise<Result<Message>>` - 更新消息
- `deleteMessage(conversationId: string, messageId: string): Promise<Result<boolean>>` - 删除消息
- `getMessageStats(conversationId: string): Promise<Result<ConversationStats>>` - 获取统计

## 🏛️ 基础设施

### LLM 提供商

统一的 LLM 提供商接口。

```typescript
import { providerRegistry, OpenAIConfig } from '../src/infrastructure/llm';

// 创建 OpenAI 提供商
const openaiConfig: OpenAIConfig = {
  name: 'OpenAI',
  version: '0.0.1',
  apiKey: 'your-api-key',
  defaultModel: 'gpt-4o-mini'
};

const provider = providerRegistry.createProvider('OpenAI', openaiConfig);
await provider.initialize(openaiConfig);

// 聊天完成
const response = await provider.chatCompletion([
  { role: 'user', content: 'Hello!' }
], {
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 1000
});

// 流式聊天
await provider.chatCompletionStream([
  { role: 'user', content: 'Hello!' }
], {
  model: 'gpt-4o-mini'
}, (chunk) => {
  console.log('Chunk:', chunk.delta?.content);
});

// 获取提供商信息
const capabilities = provider.capabilities;
const models = provider.models;
const status = await provider.getStatus();
```

### 仓储实现

Obsidian 存储仓储。

```typescript
import { MessageRepository, ConversationRepository } from '../src/infrastructure/persistence/obsidian';

// 创建仓储
const messageRepo = new MessageRepository();
const conversationRepo = new ConversationRepository();

// 初始化
await messageRepo.initialize();
await conversationRepo.initialize();

// 使用仓储
const message = MessageFactory.createUser({...});
const saved = await messageRepo.save(message);
if (saved.isSuccess) {
  console.log('Message saved:', saved.value.id);
}

// 查询消息
const messages = await messageRepo.findByConversation('conv-123', {
  limit: 10,
  orderBy: 'timestamp',
  order: 'desc'
});
```

## 🎨 UI 组件

### ChatState

聊天状态管理。

```typescript
import { useChatStore } from '../src/presentation/state/chat.state';

function ChatComponent() {
  const chatStore = useChatStore();
  
  // 获取状态
  const currentConversation = chatStore.getCurrentConversation();
  const messages = chatStore.getMessages('conv-123');
  const isLoading = chatStore.isLoading();
  
  // 执行操作
  const handleSend = async (content: string) => {
    const result = await chatStore.sendMessage(content);
    if (result.isFailure) {
      console.error('Send failed:', result.error);
    }
  };
  
  return (
    <div>
      {messages.map(msg => (
        <MessageComponent key={msg.id} message={msg} />
      ))}
      <InputComponent onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
```

#### 状态选择器

- `getCurrentConversation(): Conversation | undefined` - 当前对话
- `getMessages(conversationId: string): Message[]` - 对话消息
- `isLoading(): boolean` - 加载状态
- `getError(): string | undefined` - 错误信息
- `getUnreadCount(conversationId: string): number` - 未读数

#### 状态操作

- `sendMessage(content: string): Promise<Result<Message>>` - 发送消息
- `loadConversation(id: string): Promise<void>` - 加载对话
- `createConversation(options: CreateConversationOptions): Promise<Result<Conversation>>` - 创建对话
- `updateMessage(id: string, updates: Partial<Message>): Promise<void>` - 更新消息
- `deleteMessage(id: string): Promise<void>` - 删除消息

## 🔌 LLM 提供商 API

### 注册自定义提供商

```typescript
import { ILLMProvider, ILLMProviderFactory } from '../src/infrastructure/llm';

// 实现提供商
class MyProvider implements ILLMProvider {
  public readonly name = 'MyProvider';
  public readonly version = '0.0.1';
  
  async initialize(config: LLMProviderConfig): Promise<void> {
    // 初始化逻辑
  }
  
  async chatCompletion(messages: LLMMessage[], options: LLMRequestOptions): Promise<LLMResponse> {
    // 实现聊天完成
    return {
      id: 'resp-123',
      object: 'chat.completion',
      created: Date.now(),
      model: options.model,
      content: { text: 'Response content' }
    };
  }
  
  // 实现其他必需方法...
}

// 实现工厂
class MyProviderFactory implements ILLMProviderFactory {
  public readonly name = 'MyProvider';
  
  create(config: LLMProviderConfig): ILLMProvider {
    return new MyProvider();
  }
  
  validateConfig(config: LLMProviderConfig): { valid: boolean; errors: string[] } {
    // 验证配置
    return { valid: true, errors: [] };
  }
  
  getDefaultConfig(): LLMProviderConfig {
    return {
      name: 'MyProvider',
      version: '0.0.1',
      defaultModel: 'my-model'
    };
  }
}

// 注册提供商
providerRegistry.register(new MyProviderFactory());
```

### 使用提供商管理器

```typescript
import { llmProviderManager } from '../src/infrastructure/llm';

// 获取默认提供商
const defaultProvider = llmProviderManager.getDefaultProvider();

// 获取特定提供商
const openaiProvider = llmProviderManager.getProvider('OpenAI');

// 切换默认提供商
await llmProviderManager.switchDefaultProvider('Ollama');

// 获取所有提供商状态
const status = await llmProviderManager.getAllStatus();

// 批量测试提供商
const testResults = await llmProviderManager.testAllProviders();
```

## 📝 类型定义

### 核心类型

```typescript
// Result 类型
interface Result<T> {
  readonly isSuccess: boolean;
  readonly isFailure: boolean;
  readonly value?: T;
  readonly error?: string;
  readonly code?: string;
}

// 服务状态
type ServiceStatus = 'initializing' | 'ready' | 'error' | 'stopped';

// 生命周期
interface ServiceLifecycle {
  initialize(context: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}
```

### LLM 类型

```typescript
// 消息格式
interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: MessageAttachment[];
}

// 请求选项
interface LLMRequestOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

// 响应格式
interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  content: LLMResponseContent;
  usage?: TokenUsage;
  finishReason?: string;
  processingTime?: number;
}
```

## 🧪 测试 API

### 测试工具

```typescript
import { createMockProvider, createTestRepositories } from '../src/test-support';

// 创建模拟提供商
const mockProvider = createMockProvider({
  responses: ['Hello!', 'How can I help?']
});

// 创建测试仓储
const { messageRepo, conversationRepo } = createTestRepositories();

// 测试服务
const chatService = new ChatService(messageRepo, conversationRepo, mockProvider);

// 测试消息发送
const result = await chatService.sendMessage('conv-123', message);
expect(result.isSuccess).toBe(true);
```

## 🔗 相关链接

- [架构设计](../architecture/overview-zh.md)
- [开发指南](../../README.md#development)
- [测试指南](../../README.md#building-from-source)

---

*API 文档会随着项目发展持续更新。*
