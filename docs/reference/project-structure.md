# Project Structure

Complete structure of the Obsidian Intelligence Assistant plugin.

## Statistics

- **Total TypeScript Files:** 160
  - Source Files: 143
  - Test Files: 17
- **Lines of Code:**
  - Source: ~32,400
  - Tests: ~6,000
- **Build Output:** 1.3MB (main.js)

## Root Directory

```
obsidian-plugin-intelligence-assistant/
├── README.md                    # Project README
├── docs/                        # Documentation hub
│   ├── README.md                # Documentation index
│   ├── architecture/
│   │   ├── overview-en.md       # Architecture documentation (English)
│   │   └── overview-zh.md       # Architecture documentation (Chinese)
│   ├── reference/
│   │   ├── api.md               # API reference
│   │   └── project-structure.md # This file
│   └── archive/
│       ├── old-scripts/         # Legacy automation
│       └── old-workflows-backup # Archived workflow data
├── main.ts                      # Plugin entry point
├── main.js                      # Compiled output
├── manifest.json                # Obsidian manifest
├── package.json                 # NPM configuration
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest test configuration
├── jest.setup.js                # Jest setup
├── scripts.config.js            # Build scripts config
├── versions.json                # Version tracking
├── config/                      # Config templates & user overrides
│   └── default/
│       └── settings.json        # Base template for user settings
├── data/                        # Runtime data managed by the plugin
│   ├── prompts/                 # System prompts (index + per-prompt JSON)
│   ├── agents/                  # Agent definitions (index + per-agent JSON)
│   ├── workflow/                # Workflow metadata & execution history
│   ├── llm-providers.json       # Stored LLM provider configurations
│   ├── mcp-servers.json         # Stored MCP server configurations
│   ├── vector_store/            # Notes vector index (e.g., notes.json)
│   └── cache/                   # Cached data
│       ├── llm_models.json      # Cached LLM model metadata
│       └── mcp-tools/           # Cached MCP tools per server
└── data.json                    # Legacy plugin data snapshot
```

## Source Code Structure (`src/`)

### Core Architecture (New)

```
src/
├── core/                        # Core infrastructure
│   ├── container.ts            # Dependency injection container
│   ├── event-bus.ts            # Event communication system
│   ├── error-handler.ts        # Centralized error handling
│   ├── errors.ts               # Custom error types
│   ├── service-registry.ts     # Service registration
│   └── index.ts                # Exports
│
├── config/                      # Configuration management
│   ├── config-manager.ts       # Configuration CRUD
│   ├── config-schema.ts        # Validation schema
│   └── index.ts                # Exports
│
├── domain/                      # Domain models (DDD)
│   ├── agent/
│   │   └── agent.model.ts      # Agent domain model
│   ├── conversation/
│   │   └── conversation.model.ts  # Conversation model
│   ├── workflow/
│   │   └── workflow.model.ts   # Workflow model
│   └── index.ts                # Exports
│
└── test-support/                # Test utilities
    └── test-utils.ts           # Mock factories
```

### Application Layer

```
src/
├── services/                    # Application services
│   ├── base-service.ts         # Base service class
│   ├── core/                   # Core services
│   ├── features/               # Feature services
│   └── integrations/           # Integration services
│
├── llm/                         # LLM integration
│   ├── provider-factory.ts     # Provider factory
│   ├── model-manager.ts        # Model management
│   ├── base-streaming-provider.ts  # Base provider
│   ├── providers/              # Specific providers
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── google.ts
│   │   ├── deepseek.ts
│   │   ├── ollama.ts
│   │   └── openrouter.ts
│   └── __tests__/              # LLM tests
│
├── tools/                       # Tool system
│   ├── tool-manager.ts         # Tool coordination
│   ├── tool-executor.ts        # Tool execution
│   └── built-in/               # Built-in tools
│
├── rag/                         # RAG (Retrieval Augmented Generation)
│   ├── rag-manager.ts          # RAG coordination
│   ├── document-loader.ts      # Document loading
│   ├── text-splitter.ts        # Text chunking
│   ├── embedding.ts            # Embeddings
│   └── vector-store.ts         # Vector storage
│
├── memory/                      # Agent memory
│   └── agent-memory.ts         # Memory management
│
└── agents/                      # Agent system
    └── agent-executor.ts       # Agent execution
```

### Presentation Layer

```
src/
├── views/                       # UI views
│   ├── chat-view.ts            # Main chat view
│   ├── chat/                   # Chat components
│   │   ├── controllers/        # MVC controllers
│   │   │   ├── base-controller.ts
│   │   │   ├── message-controller.ts
│   │   │   ├── agent-controller.ts
│   │   │   ├── input-controller.ts
│   │   │   ├── chat-controller.ts
│   │   │   └── index.ts
│   │   ├── components/         # UI components
│   │   │   ├── chat-header.ts
│   │   │   ├── input-controls-bar.ts
│   │   │   └── message-renderer.ts
│   │   ├── handlers/           # Event handlers
│   │   │   ├── streaming-handler.ts
│   │   │   ├── tool-call-handler.ts
│   │   │   └── attachment-handler.ts
│   │   ├── managers/           # Business logic managers
│   │   │   └── conversation-manager.ts
│   │   ├── state/              # State management
│   │   │   └── chat-view-state.ts
│   │   ├── utils/              # View utilities
│   │   └── __tests__/          # View tests
│   │
│   └── workflow-editor-view.ts # Workflow editor
│
└── settings/                    # Settings UI
    ├── settings-tab.ts         # Main settings tab
    ├── tabs/                   # Setting tabs
    │   ├── general-tab.ts
    │   ├── provider-tab.ts
    │   ├── models-tab.ts
    │   ├── agents-tab.ts
    │   ├── prompts-tab.ts
    │   ├── tools-tab.ts
    │   ├── mcp-tab.ts
    │   ├── rag-tab.ts
    │   └── websearch-tab.ts
    ├── components/             # Setting components
    └── modals/                 # Setting modals
```

### Type System

```
src/
└── types/                       # TypeScript types
    ├── index.ts                # Unified exports
    ├── core/                   # Core types
    │   ├── agent.ts
    │   ├── conversation.ts
    │   ├── model.ts
    │   └── index.ts
    ├── features/               # Feature types
    │   ├── mcp.ts
    │   ├── rag.ts
    │   ├── web-search.ts
    │   ├── workflow.ts
    │   ├── think.ts
    │   ├── memory.ts
    │   └── index.ts
    └── common/                 # Common types
```

### Workflow System (v2)

```
src/
└── workflow-v2/                 # Advanced workflow system
    ├── core/                   # Core types and interfaces
    ├── nodes/                  # Node implementations
    ├── ports/                  # Port system
    ├── adapters/               # Hexagonal adapters
    ├── services/               # Workflow services
    ├── editor/                 # Visual editor
    ├── expression/             # Expression engine
    ├── storage/                # Workflow storage
    └── __tests__/              # Workflow tests
```

### Utilities

```
src/
├── utils/                       # General utilities
│   ├── file-utils.ts
│   ├── date-utils.ts
│   └── string-utils.ts
│
└── styles/                      # CSS styles
    ├── main.css
    ├── chat.css
    ├── settings.css
    └── workflow.css
```

## Test Structure (`src/__tests__/`)

### Architecture Tests (New)

```
src/__tests__/
├── core/                        # Core infrastructure tests
│   ├── container.test.ts       # DI container tests
│   ├── event-bus.test.ts       # Event bus tests
│   └── error-handler.test.ts   # Error handler tests
│
├── config/                      # Configuration tests
│   ├── config-manager.test.ts  # Config manager tests
│   └── config-schema.test.ts   # Validation tests
│
└── domain/                      # Domain model tests
    ├── agent.model.test.ts     # Agent model tests
    ├── conversation.model.test.ts  # Conversation tests
    └── workflow.model.test.ts  # Workflow tests
```

### Feature Tests

```
src/
├── llm/__tests__/              # LLM tests
│   ├── base-streaming-provider.test.ts
│   └── providers.integration.test.ts
│
├── views/chat/__tests__/       # View tests
│   └── message-renderer.test.ts
│
├── views/chat/handlers/__tests__/  # Handler tests
│   └── attachment-handler.test.ts
│
├── views/chat/managers/__tests__/  # Manager tests
│   └── conversation-manager.test.ts
│
├── views/chat/state/__tests__/     # State tests
│   └── chat-view-state.test.ts
│
└── workflow-v2/__tests__/      # Workflow tests
    ├── secure-execution.test.ts
    └── ...
```

## Documentation (`docs/`)

```
docs/
├── architecture/                # Architecture documentation
│   ├── 01-dependency-injection.md  # DI guide
│   ├── 02-event-bus.md         # Event system guide
│   ├── 03-configuration.md     # Configuration guide
│   └── 06-controllers.md       # Controllers guide
│
├── old-scripts/                # Legacy scripts (archived)
└── old-workflows-backup/       # Legacy workflows (archived)
```

## Build & Development

```
scripts/                         # Build scripts
├── build.js                    # Production build
├── dev.js                      # Development server
├── deploy.js                   # Deployment
├── clean.js                    # Clean build artifacts
├── version.js                  # Version management
├── config/                     # Script configuration
└── utils/                      # Script utilities
```

## Configuration Files

```
Root Configuration:
├── package.json                # NPM dependencies & scripts
├── tsconfig.json               # TypeScript compiler config
├── jest.config.js              # Jest test configuration
├── jest.setup.js               # Jest initialization
├── scripts.config.js           # Build scripts config
├── manifest.json               # Obsidian plugin manifest
├── versions.json               # Version tracking
├── .gitignore                  # Git ignore patterns
└── .eslintrc.js               # ESLint configuration (if exists)
```

## Key Directories Explained

### `/src/core/` - Infrastructure Layer
Contains fundamental infrastructure components:
- **Dependency Injection** - Service lifecycle management
- **Event Bus** - Decoupled communication
- **Error Handling** - Centralized error processing
- **Service Registry** - Service coordination

### `/src/config/` - Configuration Layer
Manages all plugin configuration:
- **ConfigManager** - CRUD operations with validation
- **ConfigSchema** - Validation rules and constraints
- Migration support for version upgrades

### `/src/domain/` - Domain Layer
Rich domain models following DDD principles:
- **Agent Model** - Agent configuration and behavior
- **Conversation Model** - Chat conversation logic
- **Workflow Model** - Workflow definition and validation

### `/src/views/chat/controllers/` - MVC Controllers
Implements MVC pattern for chat view:
- **Base Controller** - Abstract controller base
- **Message Controller** - Message display
- **Agent Controller** - Agent selection
- **Input Controller** - User input handling
- **Chat Controller** - Core chat operations

### `/src/types/` - Type System
Centralized TypeScript definitions:
- **Core Types** - Fundamental domain types
- **Feature Types** - Feature-specific types
- **Common Types** - Shared type utilities

### `/src/__tests__/` - Test Suite
Comprehensive test coverage:
- **Architecture Tests** - Core infrastructure (126 tests)
- **Integration Tests** - LLM providers
- **Unit Tests** - Individual components
- **E2E Tests** - Workflow system

## Module Dependencies

```
┌─────────────────────────────────────────────────┐
│            Presentation Layer                   │
│  (Views, Controllers, Components, Handlers)     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Application Layer                      │
│    (Services, Managers, LLM, Tools, RAG)        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│            Domain Layer                         │
│    (Models, Entities, Value Objects)            │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         Infrastructure Layer                    │
│  (Config, DI Container, Event Bus, Errors)      │
└─────────────────────────────────────────────────┘
```

## File Naming Conventions

- **Models:** `*.model.ts` (e.g., `agent.model.ts`)
- **Controllers:** `*-controller.ts` (e.g., `chat-controller.ts`)
- **Services:** `*-service.ts` or `*-manager.ts`
- **Tests:** `*.test.ts` (e.g., `container.test.ts`)
- **Types:** Simple names in `/types` directory
- **Components:** `*.ts` in `/components` directory
- **Utilities:** `*-utils.ts` (e.g., `test-utils.ts`)

## Import Patterns

```typescript
// Core infrastructure
import { Container } from './core/container';
import { eventBus, PluginEvent } from './core/event-bus';
import { ConfigManager } from './config/config-manager';

// Domain models
import { AgentModel } from './domain/agent/agent.model';
import { ConversationModel } from './domain/conversation/conversation.model';

// Controllers
import { ChatController } from './views/chat/controllers/chat-controller';

// Types (unified import point)
import type { Agent, Conversation, Message } from './types';
```

## Build Output

```
dist/                           # Build directory
└── main.js                    # Bundled output (1.3MB)

Root level:
└── main.js                    # Deployed plugin
```

## Environment Setup

### Development
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server
npm run test:watch             # Run tests in watch mode
```

### Production
```bash
npm run build:production       # Production build
npm test                       # Run all tests
npm run deploy:production      # Deploy to production
```

## Code Quality

- **Linting:** ESLint for TypeScript
- **Type Checking:** TypeScript strict mode
- **Testing:** Jest with 126+ tests
- **Coverage:** Core modules at 100%
- **Build:** esbuild for fast compilation

---

**Version:** 1.0
**Last Updated:** 2025-11-06
**Total Files:** 160+ TypeScript files
**Total Lines:** ~38,000 lines of code
