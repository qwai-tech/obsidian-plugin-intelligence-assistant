# Plugin Architecture

This document describes the architectural design of the Intelligence Assistant plugin, following hexagonal architecture principles with dependency injection, domain-driven design, and event-driven patterns.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Principles](#core-principles)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Testing Strategy](#testing-strategy)

## Architecture Overview

The plugin follows a **layered hexagonal architecture** (also known as Ports and Adapters) with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│            Presentation Layer                   │
│  (Views, Controllers, Components, Handlers)     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Application Layer                      │
│    (Services, Managers, Use Cases)              │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│            Domain Layer                         │
│    (Models, Entities, Value Objects)            │
└─────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         Infrastructure Layer                    │
│  (Config, DI Container, Event Bus, Errors)      │
└─────────────────────────────────────────────────┘
```

## Core Principles

### 1. Dependency Injection
- Centralized `Container` manages all service instances
- Supports singleton and transient registration
- Enables loose coupling and testability

### 2. Event-Driven Architecture
- Global `EventBus` for decoupled communication
- 30+ predefined events for all plugin operations
- Async event handling with error isolation

### 3. Domain-Driven Design
- Rich domain models with business logic
- Validation at model level
- Clear boundaries between layers

### 4. Configuration Management
- Centralized `ConfigManager` for all settings
- Schema-based validation with `ConfigSchema`
- Migration support for version upgrades
- Change tracking and history

### 5. Error Handling
- Custom error hierarchy (`PluginError`, `ConfigurationError`, etc.)
- Global `ErrorHandler` for consistent error processing
- Context-aware error reporting

## Directory Structure

```
src/
├── __tests__/              # Test files organized by module
│   ├── core/               # Core infrastructure tests
│   ├── config/             # Configuration tests
│   └── domain/             # Domain model tests
│
├── config/                 # Configuration management
│   ├── config-manager.ts   # Main configuration manager
│   ├── config-schema.ts    # Validation schema
│   └── index.ts
│
├── core/                   # Core infrastructure
│   ├── container.ts        # Dependency injection
│   ├── event-bus.ts        # Event system
│   ├── error-handler.ts    # Error handling
│   ├── errors.ts           # Error types
│   └── index.ts
│
├── domain/                 # Domain models
│   ├── agent/              # Agent model and logic
│   ├── conversation/       # Conversation model
│   └── workflow/           # Workflow model
│
├── services/               # Application services
│   └── base-service.ts     # Base service class
│
├── types/                  # TypeScript type definitions
│   ├── core/               # Core types
│   ├── features/           # Feature-specific types
│   ├── ui/                 # UI types
│   └── index.ts            # Unified type exports
│
├── views/                  # UI layer
│   └── chat/               # Chat view components
│       ├── components/     # Reusable UI components
│       ├── controllers/    # MVC controllers
│       ├── handlers/       # Event handlers
│       ├── managers/       # Business logic managers
│       └── state/          # State management
│
└── test-support/           # Test utilities
    └── test-utils.ts       # Mock factories
```

## Core Components

### Dependency Injection Container

Location: `src/core/container.ts`

Manages service lifecycle and dependencies:

```typescript
// Registration
container.registerSingleton('configManager', ConfigManager);
container.registerTransient('messageService', MessageService);

// Resolution
const config = container.resolve<ConfigManager>('configManager');
```

**Features:**
- Singleton and transient registration
- Dependency resolution
- Service lifecycle management
- Type-safe service access

### Event Bus

Location: `src/core/event-bus.ts`

Provides decoupled event-driven communication:

```typescript
// Subscribe
eventBus.on(PluginEvent.MESSAGE_SENT, async (data) => {
    // Handle event
});

// Publish
await eventBus.emit(PluginEvent.MESSAGE_SENT, { content: 'Hello' });
```

**Features:**
- Async/sync event emission
- One-time listeners with `once()`
- Error isolation (handlers don't affect each other)
- Event history tracking

**Event Categories:**
- Message events (sent, received, updated, deleted)
- Conversation events (created, updated, deleted, selected)
- Agent events (changed, created, updated, deleted)
- Tool events (executed, failed)
- RAG events (indexed, searched, cleared)
- MCP events (server connected/disconnected, tool registered)
- Workflow events (created, updated, deleted, executed)
- System events (settings updated, plugin loaded/unloaded, errors)

### Configuration Manager

Location: `src/config/config-manager.ts`

Centralized configuration management:

```typescript
// Get settings
const agents = configManager.get('agents');

// Set with validation
await configManager.set('agents', newAgents);

// Path-based access
await configManager.setPath('agents[0].name', 'New Name');

// Export/Import
const json = configManager.export();
await configManager.import(json);
```

**Features:**
- Schema validation with `ConfigSchema`
- Path-based nested access (supports array indices)
- Change tracking and history
- Import/export functionality
- Migration support
- Statistics and monitoring

### Error Handler

Location: `src/core/error-handler.ts`

Centralized error processing:

```typescript
try {
    // Operation
} catch (error) {
    ErrorHandler.handle(error, 'Operation failed', {
        context: { operationType: 'chat' }
    });
}
```

**Custom Error Types:**
- `PluginError` - Base error
- `ConfigurationError` - Config issues
- `ValidationError` - Data validation
- `NetworkError` - API/network failures
- `StorageError` - Persistence issues
- `ToolError` - Tool execution failures

## Domain Layer

### Agent Model

Location: `src/domain/agent/agent.model.ts`

Encapsulates agent configuration and behavior:

```typescript
const agent = new AgentModel(agentData);

// Validation
const result = agent.validate();

// Serialization
const json = agent.toJSON();
const restored = AgentModel.fromJSON(json);
```

**Features:**
- Business logic encapsulation
- Validation rules
- Immutable operations
- Factory methods

### Conversation Model

Location: `src/domain/conversation/conversation.model.ts`

Manages conversation state and messages:

```typescript
const conversation = ConversationModel.create('New Chat', '💬');

// Add messages
conversation.addMessage({ role: 'user', content: 'Hello' });

// Token counting
const totalTokens = conversation.getTotalTokens();

// Summary generation
const summary = conversation.getSummary();
```

### Workflow Model

Location: `src/domain/workflow/workflow.model.ts`

Manages workflow nodes and edges:

```typescript
const workflow = WorkflowModel.create('My Workflow', 'Description');

// Add nodes
workflow.addNode({ id: 'node1', type: 'llm', data: {} });

// Add edges
workflow.addEdge({ id: 'edge1', source: 'node1', target: 'node2' });

// Validation
const result = workflow.validate();
```

## Application Layer

### Controllers (MVC Pattern)

Location: `src/views/chat/controllers/`

Controllers handle user interactions and coordinate between views and models:

#### Base Controller
```typescript
abstract class BaseController {
    constructor(
        protected app: App,
        protected plugin: Plugin,
        protected state: ChatViewState
    ) {}

    abstract initialize(): Promise<void>;
    abstract cleanup(): void;
}
```

#### Chat Controller
Manages chat operations and message flow:
- Send user messages
- Generate AI responses
- Regenerate responses
- Stop generation

#### Message Controller
Handles message display and rendering:
- Add messages to UI
- Clear messages
- Scroll management
- Provider avatars/colors

#### Agent Controller
Manages agent selection and configuration:
- Get/set current agent
- Agent capability checks
- Agent summary generation
- Default agent selection

#### Input Controller
Manages user input and attachments:
- Input handling (auto-resize, send on Enter)
- File/image attachments
- References (@mentions)
- Preview management

### Services

Location: `src/services/`

Base service class with DI support:

```typescript
class MyService extends BaseService {
    constructor(
        protected app: App,
        protected plugin: Plugin,
        protected settings: PluginSettings
    ) {
        super(app, plugin, settings);
    }

    async initialize(): Promise<void> {
        // Setup
    }

    async cleanup(): Promise<void> {
        // Teardown
    }
}
```

### Managers

Location: `src/views/chat/managers/`

Business logic coordination:
- `ConversationManager` - Conversation CRUD and state
- `AgentMemoryManager` - Agent memory persistence
- `RAGManager` - Retrieval augmented generation

## Infrastructure Layer

### Type System

Location: `src/types/`

Unified type definitions organized by domain:

```
types/
├── core/           # Core domain types
│   ├── agent.ts
│   ├── conversation.ts
│   ├── message.ts
│   └── model.ts
├── features/       # Feature types
│   ├── mcp.ts
│   ├── rag.ts
│   ├── tool.ts
│   ├── web-search.ts
│   └── workflow.ts
├── ui/             # UI types
│   └── settings.ts
└── index.ts        # Single export point
```

**Key Types:**
- `Agent` - Agent configuration
- `Conversation` - Chat conversation
- `Message` - Chat message
- `LLMConfig` - LLM provider config
- `ModelInfo` - Model metadata
- `RAGConfig` - RAG settings
- `ToolDefinition` - Tool interface
- `Workflow` - Workflow definition

## Testing Strategy

### Test Organization

Tests mirror the source structure:
```
src/__tests__/
├── core/               # Infrastructure tests
├── config/             # Configuration tests
└── domain/             # Domain model tests
```

### Test Utilities

Location: `src/test-support/test-utils.ts`

Provides mock factories for testing:

```typescript
// Create test data
const settings = createTestSettings();
const agent = createTestAgent();
const llmConfig = createTestLLMConfig();
const conversation = createTestConversation();

// Create mocks
const mockApp = createMockApp();
const mockFile = createMockFile('/path/to/file.md');
```

### Test Coverage

- **Core Infrastructure:** 100% (container, event-bus, error-handler)
- **Configuration:** 100% (config-manager, config-schema)
- **Domain Models:** 100% (agent, conversation, workflow)

**Test Statistics:**
- 126 tests in new architecture
- 100% pass rate
- Full coverage of critical paths

### Running Tests

```bash
# All tests
npm test

# Specific module
npm test -- core
npm test -- config
npm test -- domain

# With coverage
npm test -- --coverage
```

## Migration Guide

### From Old to New Architecture

1. **Configuration Access**
   ```typescript
   // Old
   this.plugin.settings.agents

   // New
   configManager.get('agents')
   ```

2. **Event Handling**
   ```typescript
   // Old
   this.plugin.emit('message-sent', data)

   // New
   eventBus.emit(PluginEvent.MESSAGE_SENT, data)
   ```

3. **Service Registration**
   ```typescript
   // Old
   this.messageService = new MessageService(...)

   // New
   container.registerSingleton('messageService', MessageService)
   const service = container.resolve<MessageService>('messageService')
   ```

4. **Error Handling**
   ```typescript
   // Old
   throw new Error('Something failed')

   // New
   throw new ConfigurationError('Invalid config', { key: 'agents' })
   ```

## Best Practices

### 1. Controller Usage
- Controllers should coordinate, not contain business logic
- Use managers for complex business operations
- Keep controllers thin and focused

### 2. Event Bus
- Use events for cross-component communication
- Don't use events within the same component
- Always handle errors in event listeners

### 3. Configuration
- Always validate before saving
- Use path notation for nested updates
- Track changes for debugging

### 4. Domain Models
- Keep models immutable (return new instances)
- Put validation in models, not controllers
- Use factory methods for creation

### 5. Error Handling
- Use specific error types
- Include context in errors
- Handle errors at appropriate levels

## Performance Considerations

### Singleton vs Transient
- Use singleton for stateful services (config, event bus)
- Use transient for stateless utilities
- Be mindful of memory with long-lived singletons

### Event Bus
- Async emission for heavy operations
- Sync emission for UI updates
- Limit listeners to prevent memory leaks

### Configuration
- Cache frequently accessed config
- Batch updates when possible
- Use path-based access for deep updates

## Future Enhancements

Planned improvements to the architecture:

1. **Command Pattern** - For undo/redo functionality
2. **Repository Pattern** - For data persistence abstraction
3. **State Machine** - For complex workflow states
4. **Middleware Pipeline** - For request/response processing
5. **Decorator Pattern** - For tool execution enhancement

## Resources

- [Main README](./README.md)
- [Test Support](./src/test-support/)
- [Type Definitions](./src/types/)
- [Component Documentation](./docs/architecture/)

## Contributing

When adding new features:

1. Follow the layered architecture
2. Add appropriate tests (aim for 100% coverage)
3. Update type definitions
4. Document public APIs
5. Use existing patterns (DI, events, errors)
6. Validate through ConfigSchema when applicable
