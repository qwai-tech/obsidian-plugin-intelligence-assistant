# i18n Multi-Language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add i18next-based i18n to the Intelligence Assistant Obsidian plugin, supporting English (en) and Simplified Chinese (zh), auto-detected from Obsidian's moment.js locale.

**Architecture:** A new `src/i18n/` module initialises i18next once at plugin load with two statically-bundled JSON locale files. All presentation-layer files import the single `t()` function and replace hardcoded strings. No external backend; both locales ship inside `main.js`.

**Tech Stack:** i18next, TypeScript, esbuild (existing), Jest (existing unit-test infra)

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/i18n/index.ts` |
| Create | `src/i18n/locales/en.json` |
| Create | `src/i18n/locales/zh.json` |
| Create | `src/__tests__/i18n/i18n.test.ts` |
| Modify | `main.ts` |
| Modify | `src/presentation/components/settings-tab.ts` |
| Modify | `src/presentation/components/tabs/general-tab.ts` |
| Modify | `src/presentation/components/tabs/provider-tab.ts` |
| Modify | `src/presentation/components/tabs/llm-tab.ts` |
| Modify | `src/presentation/components/tabs/models-tab.ts` |
| Modify | `src/presentation/components/tabs/mcp-tab.ts` |
| Modify | `src/presentation/components/tabs/agents-tab.ts` |
| Modify | `src/presentation/components/tabs/prompts-tab.ts` |
| Modify | `src/presentation/components/tabs/tools-tab.ts` |
| Modify | `src/presentation/components/tabs/rag-tab.ts` |
| Modify | `src/presentation/components/tabs/websearch-tab.ts` |
| Modify | `src/presentation/components/tabs/quickactions-tab.ts` |
| Modify | `src/presentation/components/tabs/usage-tab.ts` |
| Modify | `src/presentation/components/chat/chat-header.component.ts` |
| Modify | `src/presentation/components/chat/chat-input.component.ts` |
| Modify | `src/presentation/components/modals/confirm-modal.ts` |
| Modify | `src/presentation/components/modals/agent-edit-modal.ts` |

---

## Task 1: Install i18next

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd /Users/chengqing/Projects/leonward899/obsidian-plugin-intelligence-assistant
npm install i18next
```

Expected: i18next added to `dependencies` in `package.json`, no errors.

- [ ] **Step 2: Verify TypeScript types ship with i18next**

```bash
ls node_modules/i18next/typescript/
```

Expected: `options.d.ts` or similar files present (i18next bundles its own types).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add i18next dependency"
```

---

## Task 2: Create i18n module + write unit test

**Files:**
- Create: `src/i18n/index.ts`
- Create: `src/__tests__/i18n/i18n.test.ts`

- [ ] **Step 1: Create `src/i18n/index.ts`**

```typescript
import i18next from 'i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

export function initI18n(): void {
	const raw: string = (window as Window & { moment?: { locale(): string } }).moment?.locale() ?? 'en';
	const lang = raw.startsWith('zh') ? 'zh' : 'en';

	void i18next.init({
		lng: lang,
		fallbackLng: 'en',
		initImmediate: false,
		resources: {
			en: { translation: en as Record<string, unknown> },
			zh: { translation: zh as Record<string, unknown> },
		},
		interpolation: { escapeValue: false },
	});
}

export function t(key: string, options?: Record<string, unknown>): string {
	return i18next.t(key, options) as string;
}
```

- [ ] **Step 2: Write failing unit test**

Create `src/__tests__/i18n/i18n.test.ts`:

```typescript
describe('i18n module', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('returns English string for en locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'en' }
		};
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.general')).toBe('General');
	});

	it('returns Chinese string for zh-cn locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'zh-cn' }
		};
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.general')).toBe('通用');
	});

	it('falls back to English for unknown locale', () => {
		(global as unknown as Record<string, unknown>).window = {
			moment: { locale: () => 'ja' }
		};
		jest.resetModules();
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initI18n, t } = require('@/i18n') as { initI18n: () => void; t: (k: string) => string };
		initI18n();
		expect(t('settings.tabs.mcp')).toBe('MCP');
	});
});
```

- [ ] **Step 3: Run test — expect FAIL (locale files don't exist yet)**

```bash
npm test -- --testPathPattern="i18n" --no-coverage 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module" or similar JSON import error.

- [ ] **Step 4: Commit scaffold**

```bash
git add src/i18n/index.ts src/__tests__/i18n/i18n.test.ts
git commit -m "feat: scaffold i18n module and unit test"
```

---

## Task 3: Create `en.json`

**Files:**
- Create: `src/i18n/locales/en.json`

- [ ] **Step 1: Create the file**

```json
{
  "settings": {
    "tabs": {
      "general": "General",
      "llm": "LLM",
      "mcp": "MCP",
      "tools": "Tools",
      "rag": "RAG",
      "prompts": "Prompts",
      "agents": "Agents",
      "quickActions": "Quick Actions",
      "usage": "Usage"
    },
    "general": {
      "title": "General settings",
      "desc": "Configure general settings for the intelligence assistant plugin.",
      "pluginVersion": { "name": "Plugin version", "desc": "Current version of the intelligence assistant plugin" },
      "defaultModel": { "name": "Default model", "desc": "Default model to use for conversations", "placeholder": "Deepseek-chat" },
      "defaultChatMode": { "name": "Default chat mode", "desc": "Choose which mode the chat view opens with", "chat": "Chat mode", "agent": "Agent mode" },
      "conversationTitleMode": { "name": "Conversation title mode", "desc": "How to generate conversation titles", "firstMessage": "Use first message", "autoSummary": "Auto generate summary", "manual": "Manual" },
      "conversationIcons": { "name": "Conversation icons", "desc": "Enable automatic icon generation for conversations" },
      "configStatus": {
        "name": "Configuration status",
        "desc": "Overall plugin configuration status",
        "ok": "✅ Configured ({{providers}} providers, {{conversations}} conversations)",
        "incomplete": "⚠️ Incomplete - Please configure providers and models"
      }
    },
    "llm": {
      "title": "LLM configuration",
      "desc": "Configure language model providers and manage available models.",
      "subTabs": { "provider": "Providers", "models": "Models" }
    },
    "models": {
      "title": "Model configuration",
      "desc": "View and manage models from all configured providers. Click \"refresh models\" to fetch the latest available models.",
      "providerCount": "{{count}} provider configured",
      "providerCount_plural": "{{count}} providers configured",
      "refreshAll": "🔄 refresh all models",
      "empty": "No providers configured yet. Add providers in the provider tab first.",
      "noModels": "No models available. Click \"refresh all models\" or refresh individual providers in the provider tab.",
      "noMatch": "No models match the current filters. Adjust or clear filters to see results.",
      "modelCount": "• {{count}} model cached",
      "modelCount_plural": "• {{count}} models cached",
      "matchCount": "• {{count}} match selected filters",
      "matchCount_plural": "• {{count}} matches selected filters",
      "status": { "enabled": "Enabled", "disabled": "Disabled" },
      "actions": { "disable": "Disable", "enable": "Enable", "setDefaultChat": "Set Default Chat", "defaultChat": "Default Chat", "setDefaultEmbedding": "Set Default Embedding", "defaultEmbedding": "Default Embedding" },
      "notices": {
        "fetching": "Fetching models for {{provider}}...",
        "fetchFailed": "Failed to refresh {{provider}} models",
        "refreshed": "Models refreshed successfully!",
        "refreshFailed": "Failed to refresh models",
        "defaultChatSet": "Default chat model set to {{name}}",
        "defaultEmbeddingSet": "Default embedding model set to {{name}}"
      },
      "filters": { "allProviders": "All providers", "allCapabilities": "All capabilities" }
    },
    "provider": {
      "title": "Provider configuration",
      "securityTitle": "⚠️ Security Warning",
      "securityDesc": "API keys are stored as plain text in your vault for compatibility. To prevent accidental leaks:",
      "securityItem1": "Do NOT share your {{configDir}}/plugins/intelligence-assistant/data/ folder.",
      "securityItem2": "Add this folder to your .gitignore if you use Git sync.",
      "securityItem3": "Be cautious when using public cloud sync services.",
      "desc": "Manage LLM providers and API credentials. Use the actions column to edit configuration details or refresh cached models.",
      "count": "{{count}} provider configured",
      "count_plural": "{{count}} providers configured",
      "addBtn": "+ Add provider",
      "empty": "No providers configured. Select \"Add provider\" to get started.",
      "tableHeaders": { "provider": "Provider", "status": "Status", "actions": "Actions" },
      "status": {
        "ready": "Ready",
        "needsConfig": "Needs Configuration",
        "checking": "Checking...",
        "credentialsSet": "Credentials Set",
        "serverOnline": "Server online",
        "serverOffline": "Server offline",
        "serverError": "Server error"
      },
      "guidance": { "requiresCli": "Requires local CLI", "provideServiceKey": "Provide service key", "configureBaseUrl": "Configure base URL", "addApiKey": "Add API key" },
      "models": { "none": "No models", "count": "{{count}} model", "count_plural": "{{count}} models" },
      "ollama": {
        "checkingVersion": "Checking version...",
        "server": {
          "checking": "Checking server...",
          "online": "Server: online",
          "offline": "Server: offline or unreachable",
          "error": "Server: connection error",
          "versionOnline": "Server online",
          "versionOffline": "Server offline",
          "versionError": "Connection error",
          "version": "Version: {{version}}"
        }
      },
      "refresh": {
        "lastRefresh": "Last refresh: {{timeAgo}}",
        "neverRefreshed": "Never refreshed",
        "justNow": "just now",
        "minutesAgo": "{{n}}m ago",
        "hoursAgo": "{{n}}h ago",
        "daysAgo": "{{n}}d ago"
      },
      "actions": { "edit": "Edit", "manageModels": "Manage models", "refreshModels": "Refresh models", "refreshing": "Refreshing...", "delete": "Delete" },
      "notices": { "refreshed": "Models refreshed for {{provider}}.", "refreshFailed": "Failed to refresh models" },
      "confirm": { "delete": "Remove provider {{provider}}?" }
    },
    "mcp": {
      "title": "MCP server management",
      "desc": "Configure Model Context Protocol (MCP) servers to extend agent capabilities with external tools and data sources.",
      "inspectorBtn": "🔍 Open MCP inspector",
      "testAllBtn": "🧪 test all connections",
      "refreshAllBtn": "🔄 refresh all tools",
      "addBtn": "+ Add MCP server",
      "empty": "No MCP servers configured. Select Add MCP server to get started.",
      "tableHeaders": { "name": "Name", "command": "Command", "arguments": "Arguments", "status": "Status", "tools": "Tools", "actions": "Actions" },
      "untitled": "Untitled MCP Server",
      "notConfigured": "Not configured",
      "noArgs": "None",
      "cached": "Cached",
      "disabled": "Disabled",
      "envVars": "{{count}} env var",
      "envVars_plural": "{{count}} env vars",
      "status": { "disabled": "Disabled", "connected": "connected", "disconnected": "disconnected", "enableToManage": "Enable to manage connections", "manualConnect": "Manual connect", "autoConnect": "Auto-connect" },
      "toolCount": { "live": "{{count}} live tool", "live_plural": "{{count}} live tools", "cached": "{{count}} cached tool", "cached_plural": "{{count}} cached tools" },
      "actions": { "edit": "Edit", "enabled": "✓ Enabled", "enabledOff": "✗ Disabled", "connect": "connect", "disconnect": "disconnect", "connecting": "Connecting...", "disconnecting": "Disconnecting...", "test": "Test", "testing": "Testing...", "delete": "Delete" },
      "notices": {
        "disconnected": "Disconnected from {{name}}",
        "connected": "Connected to {{name}}",
        "autoConnectFailed": "Failed to auto-connect {{name}}",
        "enableFirst": "Enable the server before connecting",
        "disconnectFailed": "Failed to disconnect from {{name}}",
        "connectFailed": "Failed to connect to {{name}}",
        "testNoCommand": "❌ please enter a command before testing connection",
        "testSuccess": "✅ connected successfully! Found {{count}} tools.",
        "testFailed": "❌ Connection failed: {{message}}",
        "refreshedAll": "✅ refreshed tools for {{count}} server",
        "refreshedAll_plural": "✅ refreshed tools for {{count}} servers",
        "refreshedPartial": "✅ refreshed {{success}} servers, ❌ {{failed}} failed"
      },
      "confirm": { "delete": "Delete MCP server \"{{name}}\"?" }
    },
    "agents": {
      "title": "Agent management",
      "desc": "Create and manage AI agents with specific capabilities, tools, and behaviors.",
      "count": "{{count}} agent configured",
      "count_plural": "{{count}} agents configured",
      "addBtn": "+ add agent",
      "empty": "No agents configured. Select add agent to get started.",
      "tableHeaders": { "agent": "Agent", "model": "Model", "capabilities": "Capabilities", "tools": "Tools", "actions": "Actions" },
      "defaultBadge": "Default",
      "systemPrompt": "System prompt • {{promptName}}",
      "customPrompt": "Custom prompt",
      "model": { "notSet": "Not set", "notFound": "Model not found in cache", "useChatView": "Use Chat View Model", "useChatViewDesc": "Will use model selected in chat view", "useDefault": "Use Default Model", "useDefaultDesc": "Will use default model from settings" },
      "capabilities": { "noSpecialModes": "No special modes" },
      "tools": { "builtIn": "{{count}} built-in", "mcpServer": "{{count}} mcp server", "mcpServer_plural": "{{count}} mcp servers", "mcpTool": "{{count}} mcp tool", "mcpTool_plural": "{{count}} mcp tools", "noTools": "No tools enabled" },
      "actions": { "edit": "Edit", "delete": "delete", "protected": "protected" },
      "confirm": { "delete": "Delete agent \"{{name}}\"?" }
    },
    "prompts": {
      "title": "System prompts",
      "desc": "Manage system prompts that define the behavior and personality of your AI assistant.",
      "addBtn": "+ add system prompt",
      "empty": "No system prompts configured. Select add system prompt to get started.",
      "tableHeaders": { "name": "Name", "contentPreview": "Content Preview", "created": "Created", "updated": "Updated", "enabled": "Enabled", "actions": "Actions" },
      "status": { "enabled": "Enabled", "disabled": "Disabled" },
      "actions": { "edit": "Edit", "disable": "Disable", "enable": "Enable", "delete": "Delete" },
      "confirm": { "delete": "Delete prompt \"{{name}}\"?" }
    },
    "tools": {
      "title": "Tool configuration",
      "desc": "Review built-in tools and explore MCP tools loaded from connected servers. Enable the actions your agents should be able to perform.",
      "subTabs": { "builtIn": "Built-in Tools", "mcp": "MCP tools", "openapi": "HTTP / OpenAPI", "cli": "CLI Tools" }
    },
    "rag": {
      "title": "RAG configuration",
      "desc": "Configure retrieval-augmented generation and web search to enhance AI responses.",
      "subTabs": { "overview": "Overview", "chunking": "Chunking", "search": "Search", "filters": "Filters", "advanced": "Advanced", "websearch": "Web Search" }
    },
    "websearch": {
      "title": "Web search configuration",
      "desc": "Configure web search functionality to enhance AI responses with up-to-date information from the internet.",
      "generalBehavior": "General behavior",
      "providers": {
        "duckduckgo": "DuckDuckGo (no key required)", "google": "Google Custom Search", "bing": "Bing Web Search",
        "serpapi": "SerpAPI", "tavily": "Tavily", "searxng": "SearXNG",
        "brave": "Brave Search", "yahoo": "Yahoo (HTML scraping)", "yandex": "Yandex (HTML scraping)",
        "qwant": "Qwant", "mojeek": "Mojeek"
      }
    },
    "quickActions": {
      "title": "Quick actions",
      "desc": "Configure AI-powered quick actions that appear in the editor context menu when text is selected.",
      "actionPrefix": { "name": "Action prefix", "desc": "Prefix (emoji or text) to display before all quick actions in the context menu", "placeholder": "⚡" },
      "count": "{{count}} action configured ({{enabled}} enabled)",
      "count_plural": "{{count}} actions configured ({{enabled}} enabled)",
      "addBtn": "+ add quick action"
    },
    "usage": {
      "title": "Token usage",
      "desc": "Track token consumption across providers and models. Data is accumulated across all conversations.",
      "notAvailable": "Token usage tracking is not available.",
      "ranges": { "today": "Today", "week": "This week", "month": "This month", "all": "All time" }
    }
  },
  "chat": {
    "placeholder": "Type your message... (Enter to send, Shift+Enter for new line)",
    "conversations": "Conversations",
    "toggleConversationsTitle": "Toggle conversation list",
    "currentConversation": "Current conversation",
    "new": "New",
    "settings": "Settings",
    "openSettingsTitle": "Open plugin settings",
    "mode": "Mode",
    "prompt": "Prompt",
    "agent": "Agent",
    "modeOptions": { "chat": "Chat", "agent": "Agent" },
    "noSystemPrompt": "No system prompt",
    "noAgentsAvailable": "No agents available",
    "sendHintPrefix": "Press ",
    "sendHintKey": "Enter",
    "sendHintSuffix": " to send",
    "sendAriaLabel": "Send message",
    "stop": " Stop",
    "addReference": "Add reference",
    "addReferenceTooltip": "Add file or folder reference (@)"
  },
  "modals": {
    "confirm": { "cancel": "Cancel", "confirm": "Confirm" },
    "agentEdit": {
      "title": "Edit agent",
      "icon": { "name": "Icon", "desc": "Emoji or character to represent this agent" },
      "description": { "name": "Description", "desc": "Brief description of the agent" },
      "modelStrategy": { "name": "Model strategy", "options": { "default": "Use default model (from settings)", "chatView": "Use chat view model", "fixed": "Fixed model" }, "noModels": "No models cached" },
      "systemPrompt": { "createNew": "➕ create new prompt…", "promptName": { "name": "Prompt name", "desc": "Display name for the new system prompt" }, "promptContent": { "name": "Prompt content", "desc": "Content for the new system prompt" } },
      "capabilities": "Capabilities",
      "memory": { "title": "Memory", "notice": "Agent memory is temporarily unavailable while we iterate on the experience." },
      "tools": { "title": "Tools", "builtIn": { "name": "Built-in tools", "desc": "Select which built-in tools this agent can use" }, "cli": { "name": "CLI tools", "desc": "Grant access to all enabled CLI tools, or pick individually below", "noTools": "No CLI tools configured. Add and enable tools under Settings → Tools → CLI to use them here." } },
      "mcp": { "title": "MCP access", "noServers": "No MCP servers configured. Add servers under Settings → MCP to unlock these options." },
      "notices": { "promptRequired": "Please provide a name and content for the new system prompt." }
    }
  },
  "notices": {
    "noProvider": "Please configure an LLM provider in settings first",
    "noModel": "Please select a default model in settings",
    "noValidProvider": "No valid provider configuration found for model: {{modelId}}",
    "processing": "Processing...",
    "textUpdated": "Text updated successfully",
    "error": "Error: {{message}}"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n/locales/en.json
git commit -m "feat: add English locale file"
```

---

## Task 4: Create `zh.json`

**Files:**
- Create: `src/i18n/locales/zh.json`

- [ ] **Step 1: Create the file**

```json
{
  "settings": {
    "tabs": {
      "general": "通用",
      "llm": "LLM",
      "mcp": "MCP",
      "tools": "工具",
      "rag": "RAG",
      "prompts": "提示词",
      "agents": "智能体",
      "quickActions": "快捷操作",
      "usage": "用量统计"
    },
    "general": {
      "title": "通用设置",
      "desc": "配置智能助手插件的通用选项。",
      "pluginVersion": { "name": "插件版本", "desc": "智能助手插件的当前版本" },
      "defaultModel": { "name": "默认模型", "desc": "对话时使用的默认模型", "placeholder": "Deepseek-chat" },
      "defaultChatMode": { "name": "默认对话模式", "desc": "聊天视图打开时的默认模式", "chat": "对话模式", "agent": "智能体模式" },
      "conversationTitleMode": { "name": "对话标题模式", "desc": "对话标题的生成方式", "firstMessage": "使用首条消息", "autoSummary": "自动生成摘要", "manual": "手动" },
      "conversationIcons": { "name": "对话图标", "desc": "启用对话的自动图标生成" },
      "configStatus": {
        "name": "配置状态",
        "desc": "插件整体配置状态",
        "ok": "✅ 已配置（{{providers}} 个服务商，{{conversations}} 条对话）",
        "incomplete": "⚠️ 配置不完整 - 请配置服务商和模型"
      }
    },
    "llm": {
      "title": "LLM 配置",
      "desc": "配置语言模型服务商并管理可用模型。",
      "subTabs": { "provider": "服务商", "models": "模型" }
    },
    "models": {
      "title": "模型配置",
      "desc": "查看并管理所有已配置服务商的模型。点击"刷新模型"获取最新可用模型。",
      "providerCount": "已配置 {{count}} 个服务商",
      "providerCount_plural": "已配置 {{count}} 个服务商",
      "refreshAll": "🔄 刷新所有模型",
      "empty": "尚未配置服务商，请先在服务商标签页中添加。",
      "noModels": "暂无可用模型，请点击"刷新所有模型"或在服务商标签页中单独刷新。",
      "noMatch": "没有模型符合当前过滤条件，请调整或清除过滤器。",
      "modelCount": "• 已缓存 {{count}} 个模型",
      "modelCount_plural": "• 已缓存 {{count}} 个模型",
      "matchCount": "• {{count}} 个符合过滤条件",
      "matchCount_plural": "• {{count}} 个符合过滤条件",
      "status": { "enabled": "已启用", "disabled": "已禁用" },
      "actions": { "disable": "禁用", "enable": "启用", "setDefaultChat": "设为默认对话模型", "defaultChat": "默认对话模型", "setDefaultEmbedding": "设为默认嵌入模型", "defaultEmbedding": "默认嵌入模型" },
      "notices": {
        "fetching": "正在获取 {{provider}} 的模型...",
        "fetchFailed": "刷新 {{provider}} 模型失败",
        "refreshed": "模型刷新成功！",
        "refreshFailed": "刷新模型失败",
        "defaultChatSet": "默认对话模型已设为 {{name}}",
        "defaultEmbeddingSet": "默认嵌入模型已设为 {{name}}"
      },
      "filters": { "allProviders": "所有服务商", "allCapabilities": "所有能力" }
    },
    "provider": {
      "title": "服务商配置",
      "securityTitle": "⚠️ 安全提示",
      "securityDesc": "API 密钥以明文存储在您的 Vault 中以保证兼容性。为防止意外泄露：",
      "securityItem1": "请勿共享 {{configDir}}/plugins/intelligence-assistant/data/ 目录。",
      "securityItem2": "如使用 Git 同步，请将此目录添加到 .gitignore。",
      "securityItem3": "使用公共云同步服务时请谨慎。",
      "desc": "管理 LLM 服务商和 API 凭据。使用操作列编辑配置详情或刷新缓存模型。",
      "count": "已配置 {{count}} 个服务商",
      "count_plural": "已配置 {{count}} 个服务商",
      "addBtn": "+ 添加服务商",
      "empty": "未配置服务商，点击"添加服务商"开始。",
      "tableHeaders": { "provider": "服务商", "status": "状态", "actions": "操作" },
      "status": { "ready": "就绪", "needsConfig": "需要配置", "checking": "检查中...", "credentialsSet": "已设置凭据", "serverOnline": "服务器在线", "serverOffline": "服务器离线", "serverError": "服务器错误" },
      "guidance": { "requiresCli": "需要本地 CLI", "provideServiceKey": "提供服务密钥", "configureBaseUrl": "配置基础 URL", "addApiKey": "添加 API 密钥" },
      "models": { "none": "无模型", "count": "{{count}} 个模型", "count_plural": "{{count}} 个模型" },
      "ollama": {
        "checkingVersion": "正在检查版本...",
        "server": { "checking": "正在检查服务器...", "online": "服务器：在线", "offline": "服务器：离线或不可达", "error": "服务器：连接错误", "versionOnline": "服务器在线", "versionOffline": "服务器离线", "versionError": "连接错误", "version": "版本：{{version}}" }
      },
      "refresh": { "lastRefresh": "上次刷新：{{timeAgo}}", "neverRefreshed": "从未刷新", "justNow": "刚刚", "minutesAgo": "{{n}} 分钟前", "hoursAgo": "{{n}} 小时前", "daysAgo": "{{n}} 天前" },
      "actions": { "edit": "编辑", "manageModels": "管理模型", "refreshModels": "刷新模型", "refreshing": "刷新中...", "delete": "删除" },
      "notices": { "refreshed": "已刷新 {{provider}} 的模型。", "refreshFailed": "刷新模型失败" },
      "confirm": { "delete": "移除服务商 {{provider}}？" }
    },
    "mcp": {
      "title": "MCP 服务器管理",
      "desc": "配置模型上下文协议（MCP）服务器，为智能体扩展外部工具和数据源。",
      "inspectorBtn": "🔍 打开 MCP 检查器",
      "testAllBtn": "🧪 测试所有连接",
      "refreshAllBtn": "🔄 刷新所有工具",
      "addBtn": "+ 添加 MCP 服务器",
      "empty": "未配置 MCP 服务器，点击"添加 MCP 服务器"开始。",
      "tableHeaders": { "name": "名称", "command": "命令", "arguments": "参数", "status": "状态", "tools": "工具", "actions": "操作" },
      "untitled": "未命名 MCP 服务器",
      "notConfigured": "未配置",
      "noArgs": "无",
      "cached": "已缓存",
      "disabled": "已禁用",
      "envVars": "{{count}} 个环境变量",
      "envVars_plural": "{{count}} 个环境变量",
      "status": { "disabled": "已禁用", "connected": "已连接", "disconnected": "未连接", "enableToManage": "启用以管理连接", "manualConnect": "手动连接", "autoConnect": "自动连接" },
      "toolCount": { "live": "{{count}} 个实时工具", "live_plural": "{{count}} 个实时工具", "cached": "{{count}} 个缓存工具", "cached_plural": "{{count}} 个缓存工具" },
      "actions": { "edit": "编辑", "enabled": "✓ 已启用", "enabledOff": "✗ 已禁用", "connect": "连接", "disconnect": "断开", "connecting": "连接中...", "disconnecting": "断开中...", "test": "测试", "testing": "测试中...", "delete": "删除" },
      "notices": { "disconnected": "已从 {{name}} 断开连接", "connected": "已连接到 {{name}}", "autoConnectFailed": "自动连接 {{name}} 失败", "enableFirst": "连接前请先启用服务器", "disconnectFailed": "从 {{name}} 断开连接失败", "connectFailed": "连接 {{name}} 失败", "testNoCommand": "❌ 请在测试连接前输入命令", "testSuccess": "✅ 连接成功！找到 {{count}} 个工具。", "testFailed": "❌ 连接失败：{{message}}", "refreshedAll": "✅ 已刷新 {{count}} 个服务器的工具", "refreshedAll_plural": "✅ 已刷新 {{count}} 个服务器的工具", "refreshedPartial": "✅ 已刷新 {{success}} 个服务器，❌ {{failed}} 个失败" },
      "confirm": { "delete": "删除 MCP 服务器\"{{name}}\"？" }
    },
    "agents": {
      "title": "智能体管理",
      "desc": "创建和管理具有特定功能、工具和行为的 AI 智能体。",
      "count": "已配置 {{count}} 个智能体",
      "count_plural": "已配置 {{count}} 个智能体",
      "addBtn": "+ 添加智能体",
      "empty": "未配置智能体，点击"添加智能体"开始。",
      "tableHeaders": { "agent": "智能体", "model": "模型", "capabilities": "能力", "tools": "工具", "actions": "操作" },
      "defaultBadge": "默认",
      "systemPrompt": "系统提示词 • {{promptName}}",
      "customPrompt": "自定义提示词",
      "model": { "notSet": "未设置", "notFound": "模型不在缓存中", "useChatView": "使用聊天视图模型", "useChatViewDesc": "将使用聊天视图中选中的模型", "useDefault": "使用默认模型", "useDefaultDesc": "将使用设置中的默认模型" },
      "capabilities": { "noSpecialModes": "无特殊模式" },
      "tools": { "builtIn": "{{count}} 个内置工具", "mcpServer": "{{count}} 个 MCP 服务器", "mcpServer_plural": "{{count}} 个 MCP 服务器", "mcpTool": "{{count}} 个 MCP 工具", "mcpTool_plural": "{{count}} 个 MCP 工具", "noTools": "未启用工具" },
      "actions": { "edit": "编辑", "delete": "删除", "protected": "受保护" },
      "confirm": { "delete": "删除智能体\"{{name}}\"？" }
    },
    "prompts": {
      "title": "系统提示词",
      "desc": "管理定义 AI 助手行为和个性的系统提示词。",
      "addBtn": "+ 添加系统提示词",
      "empty": "未配置系统提示词，点击"添加系统提示词"开始。",
      "tableHeaders": { "name": "名称", "contentPreview": "内容预览", "created": "创建时间", "updated": "更新时间", "enabled": "启用状态", "actions": "操作" },
      "status": { "enabled": "已启用", "disabled": "已禁用" },
      "actions": { "edit": "编辑", "disable": "禁用", "enable": "启用", "delete": "删除" },
      "confirm": { "delete": "删除提示词\"{{name}}\"？" }
    },
    "tools": {
      "title": "工具配置",
      "desc": "查看内置工具并探索已连接服务器加载的 MCP 工具。启用智能体可执行的操作。",
      "subTabs": { "builtIn": "内置工具", "mcp": "MCP 工具", "openapi": "HTTP / OpenAPI", "cli": "CLI 工具" }
    },
    "rag": {
      "title": "RAG 配置",
      "desc": "配置检索增强生成和网络搜索，增强 AI 响应。",
      "subTabs": { "overview": "概览", "chunking": "分块", "search": "搜索", "filters": "过滤器", "advanced": "高级", "websearch": "网络搜索" }
    },
    "websearch": {
      "title": "网络搜索配置",
      "desc": "配置网络搜索功能，以互联网最新信息增强 AI 响应。",
      "generalBehavior": "通用行为",
      "providers": { "duckduckgo": "DuckDuckGo（无需密钥）", "google": "Google 自定义搜索", "bing": "Bing 网络搜索", "serpapi": "SerpAPI", "tavily": "Tavily", "searxng": "SearXNG", "brave": "Brave 搜索", "yahoo": "Yahoo（HTML 抓取）", "yandex": "Yandex（HTML 抓取）", "qwant": "Qwant", "mojeek": "Mojeek" }
    },
    "quickActions": {
      "title": "快捷操作",
      "desc": "配置出现在编辑器上下文菜单中的 AI 快捷操作（选中文本时显示）。",
      "actionPrefix": { "name": "操作前缀", "desc": "在上下文菜单中所有快捷操作前显示的前缀（表情符号或文字）", "placeholder": "⚡" },
      "count": "已配置 {{count}} 个操作（{{enabled}} 个已启用）",
      "count_plural": "已配置 {{count}} 个操作（{{enabled}} 个已启用）",
      "addBtn": "+ 添加快捷操作"
    },
    "usage": {
      "title": "Token 用量",
      "desc": "跟踪各服务商和模型的 Token 消耗。数据在所有对话中累积。",
      "notAvailable": "Token 用量跟踪不可用。",
      "ranges": { "today": "今日", "week": "本周", "month": "本月", "all": "全部" }
    }
  },
  "chat": {
    "placeholder": "输入消息...（Enter 发送，Shift+Enter 换行）",
    "conversations": "对话列表",
    "toggleConversationsTitle": "切换对话列表",
    "currentConversation": "当前对话",
    "new": "新建",
    "settings": "设置",
    "openSettingsTitle": "打开插件设置",
    "mode": "模式",
    "prompt": "提示词",
    "agent": "智能体",
    "modeOptions": { "chat": "对话", "agent": "智能体" },
    "noSystemPrompt": "无系统提示词",
    "noAgentsAvailable": "暂无智能体",
    "sendHintPrefix": "按 ",
    "sendHintKey": "Enter",
    "sendHintSuffix": " 发送",
    "sendAriaLabel": "发送消息",
    "stop": " 停止",
    "addReference": "添加引用",
    "addReferenceTooltip": "添加文件或文件夹引用 (@)"
  },
  "modals": {
    "confirm": { "cancel": "取消", "confirm": "确认" },
    "agentEdit": {
      "title": "编辑智能体",
      "icon": { "name": "图标", "desc": "代表此智能体的表情符号或字符" },
      "description": { "name": "描述", "desc": "智能体的简要描述" },
      "modelStrategy": { "name": "模型策略", "options": { "default": "使用默认模型（来自设置）", "chatView": "使用聊天视图模型", "fixed": "固定模型" }, "noModels": "无缓存模型" },
      "systemPrompt": { "createNew": "➕ 创建新提示词…", "promptName": { "name": "提示词名称", "desc": "新系统提示词的显示名称" }, "promptContent": { "name": "提示词内容", "desc": "新系统提示词的内容" } },
      "capabilities": "能力",
      "memory": { "title": "记忆", "notice": "智能体记忆功能正在迭代中，暂时不可用。" },
      "tools": { "title": "工具", "builtIn": { "name": "内置工具", "desc": "选择此智能体可使用的内置工具" }, "cli": { "name": "CLI 工具", "desc": "授权访问所有已启用的 CLI 工具，或在下方单独选择", "noTools": "未配置 CLI 工具。请在设置 → 工具 → CLI 中添加并启用。" } },
      "mcp": { "title": "MCP 访问", "noServers": "未配置 MCP 服务器。请在设置 → MCP 中添加服务器以解锁这些选项。" },
      "notices": { "promptRequired": "请为新系统提示词提供名称和内容。" }
    }
  },
  "notices": {
    "noProvider": "请先在设置中配置 LLM 服务商",
    "noModel": "请在设置中选择默认模型",
    "noValidProvider": "未找到模型 {{modelId}} 的有效服务商配置",
    "processing": "处理中...",
    "textUpdated": "文本更新成功",
    "error": "错误：{{message}}"
  }
}
```

- [ ] **Step 2: Run unit test — expect PASS**

```bash
npm test -- --testPathPattern="i18n" --no-coverage 2>&1 | tail -20
```

Expected: PASS (3 tests passing).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh.json
git commit -m "feat: add Chinese locale file and pass i18n unit tests"
```

---

## Task 5: Wire `initI18n` in `main.ts` + migrate `settings-tab.ts` tab labels

**Files:**
- Modify: `main.ts`
- Modify: `src/presentation/components/settings-tab.ts`

- [ ] **Step 1: Add import + call in `main.ts`**

In `main.ts`, add the import near the top with the other src imports:

```typescript
import { initI18n } from './src/i18n';
```

In the `onload()` method, add `initI18n()` as the very first line before anything else runs:

```typescript
async onload() {
    initI18n();
    // ... rest of existing onload
```

- [ ] **Step 2: Migrate tab labels in `settings-tab.ts`**

Add import at top of `src/presentation/components/settings-tab.ts`:

```typescript
import { t } from '@/i18n';
```

Replace the `tabDefs` array (around line 49–59):

```typescript
// BEFORE:
const tabDefs: Array<{ slug: string; label: string }> = [
    { slug: 'general', label: 'General' },
    { slug: 'llm', label: 'LLM' },
    { slug: 'mcp', label: 'MCP' },
    { slug: 'tools', label: 'Tools' },
    { slug: 'rag', label: 'RAG' },
    { slug: 'prompts', label: 'Prompts' },
    { slug: 'agents', label: 'Agents' },
    { slug: 'quickactions', label: 'Quick Actions' },
    { slug: 'usage', label: 'Usage' }
];

// AFTER:
const tabDefs: Array<{ slug: string; label: string }> = [
    { slug: 'general', label: t('settings.tabs.general') },
    { slug: 'llm', label: t('settings.tabs.llm') },
    { slug: 'mcp', label: t('settings.tabs.mcp') },
    { slug: 'tools', label: t('settings.tabs.tools') },
    { slug: 'rag', label: t('settings.tabs.rag') },
    { slug: 'prompts', label: t('settings.tabs.prompts') },
    { slug: 'agents', label: t('settings.tabs.agents') },
    { slug: 'quickactions', label: t('settings.tabs.quickActions') },
    { slug: 'usage', label: t('settings.tabs.usage') }
];
```

- [ ] **Step 3: Build to verify no errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add main.ts src/presentation/components/settings-tab.ts
git commit -m "feat(i18n): wire initI18n and migrate settings tab labels"
```

---

## Task 6: Migrate `general-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/general-tab.ts`

- [ ] **Step 1: Apply all string replacements**

Replace the full file content:

```typescript
import { Setting } from 'obsidian';
import type IntelligenceAssistantPlugin from '@plugin';
import { t } from '@/i18n';

export function displayGeneralTab(
	containerEl: HTMLElement,
	plugin: IntelligenceAssistantPlugin
): void {
	containerEl.createEl('h3', { text: t('settings.general.title') });

	const desc = containerEl.createEl('p', {
		text: t('settings.general.desc')
	});
	desc.addClass('ia-section-description', 'ia-section-description--spaced');

	new Setting(containerEl)
		.setName(t('settings.general.pluginVersion.name'))
		.setDesc(t('settings.general.pluginVersion.desc'))
		.addText(text => text
			.setValue(plugin.manifest.version)
			.setDisabled(true));

	new Setting(containerEl)
		.setName(t('settings.general.defaultModel.name'))
		.setDesc(t('settings.general.defaultModel.desc'))
		.addText(text => text
			.setPlaceholder(t('settings.general.defaultModel.placeholder'))
			.setValue(plugin.settings.defaultModel)
			.onChange(async (value) => {
				plugin.settings.defaultModel = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName(t('settings.general.defaultChatMode.name'))
		.setDesc(t('settings.general.defaultChatMode.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('Chat', t('settings.general.defaultChatMode.chat'))
			.addOption('Agent', t('settings.general.defaultChatMode.agent'))
			.setValue(plugin.settings.defaultChatMode ?? 'chat')
			.onChange(async (value) => {
				plugin.settings.defaultChatMode = (value as 'chat' | 'agent');
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName(t('settings.general.conversationTitleMode.name'))
		.setDesc(t('settings.general.conversationTitleMode.desc'))
		.addDropdown(dropdown => dropdown
			.addOption('first-message', t('settings.general.conversationTitleMode.firstMessage'))
			.addOption('auto-summary', t('settings.general.conversationTitleMode.autoSummary'))
			.addOption('manual', t('settings.general.conversationTitleMode.manual'))
			.setValue(plugin.settings.conversationTitleMode)
			.onChange(async (value) => {
				plugin.settings.conversationTitleMode = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName(t('settings.general.conversationIcons.name'))
		.setDesc(t('settings.general.conversationIcons.desc'))
		.addToggle(toggle => toggle
			.setValue(plugin.settings.conversationIconEnabled)
			.onChange(async (value) => {
				plugin.settings.conversationIconEnabled = value;
				await plugin.saveSettings();
			}));

	void plugin.getConversationStorageService().then(storageService => {
		void storageService.getConversationCount().then(conversationCount => {
			const statusValue = plugin.settings.llmConfigs.length > 0 && plugin.settings.defaultModel
				? t('settings.general.configStatus.ok', {
					providers: plugin.settings.llmConfigs.length,
					conversations: conversationCount
				})
				: t('settings.general.configStatus.incomplete');

			new Setting(containerEl)
				.setName(t('settings.general.configStatus.name'))
				.setDesc(t('settings.general.configStatus.desc'))
				.addText(text => text
					.setValue(statusValue)
					.setDisabled(true));
		});
	});
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/components/tabs/general-tab.ts
git commit -m "feat(i18n): migrate general-tab strings"
```

---

## Task 7: Migrate `llm-tab.ts` and `models-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/llm-tab.ts`
- Modify: `src/presentation/components/tabs/models-tab.ts`

- [ ] **Step 1: Migrate `llm-tab.ts`**

Add `import { t } from '@/i18n';` after the existing imports.

Replace all hardcoded strings:

```typescript
// line 21 — title
containerEl.createEl('h3', { text: t('settings.llm.title') });

// line 23-25 — desc
const desc = containerEl.createEl('p', {
    text: t('settings.llm.desc')
});

// line 34-37 — subTabs array
const subTabs: Array<{ id: 'provider' | 'models'; label: string; icon: string }> = [
    { id: 'provider', label: t('settings.llm.subTabs.provider'), icon: '🔌' },
    { id: 'models', label: t('settings.llm.subTabs.models'), icon: '🤖' }
];
```

- [ ] **Step 2: Migrate `models-tab.ts`**

Add `import { t } from '@/i18n';` after the existing imports.

Replace hardcoded strings in `models-tab.ts`:

```typescript
// title / desc
containerEl.createEl('h3', { text: t('settings.models.title') });
// desc paragraph
text: t('settings.models.desc')

// provider count summary
summary.createSpan({ text: `${plugin.settings.llmConfigs.length} ${t('settings.models.providerCount', { count: plugin.settings.llmConfigs.length })}` });
// (i18next handles count automatically with count_plural; pass count directly)
summary.createSpan({ text: t('settings.models.providerCount', { count: plugin.settings.llmConfigs.length }) });

// refresh all button
const refreshAllBtn = controls.createEl('button', { text: t('settings.models.refreshAll') });

// empty states
emptyDiv.setText(t('settings.models.empty'));           // no providers
emptyDiv.setText(t('settings.models.noModels'));        // no models
emptyDiv.setText(t('settings.models.noMatch'));         // no filter match

// model count pills
summary.createSpan({ text: t('settings.models.modelCount', { count: allModels.length }) });
summary.createSpan({ text: t('settings.models.matchCount', { count: filteredModels.length }) });

// status badge
statusBadge.setText(model.enabled ? t('settings.models.status.enabled') : t('settings.models.status.disabled'));

// action buttons
const toggleBtn = actionsCell.createEl('button', { text: model.enabled ? t('settings.models.actions.disable') : t('settings.models.actions.enable') });
const chatBtn = actionsCell.createEl('button', { text: isDefaultChat ? t('settings.models.actions.defaultChat') : t('settings.models.actions.setDefaultChat') });
const embeddingBtn = actionsCell.createEl('button', { text: isDefaultEmbedding ? t('settings.models.actions.defaultEmbedding') : t('settings.models.actions.setDefaultEmbedding') });

// Notices
new Notice(t('settings.models.notices.fetching', { provider: config.provider }));
new Notice(t('settings.models.notices.fetchFailed', { provider: config.provider }));
new Notice(t('settings.models.notices.refreshed'));
new Notice(t('settings.models.notices.refreshFailed'));
new Notice(t('settings.models.notices.defaultChatSet', { name: model.name }));
new Notice(t('settings.models.notices.defaultEmbeddingSet', { name: model.name }));

// filter dropdowns
providerSelect.createEl('option', { value: 'all', text: t('settings.models.filters.allProviders') });
capabilitySelect.createEl('option', { value: 'all', text: t('settings.models.filters.allCapabilities') });
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/components/tabs/llm-tab.ts src/presentation/components/tabs/models-tab.ts
git commit -m "feat(i18n): migrate llm-tab and models-tab strings"
```

---

## Task 8: Migrate `provider-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/provider-tab.ts`

- [ ] **Step 1: Add import**

```typescript
import { t } from '@/i18n';
```

- [ ] **Step 2: Replace all hardcoded strings**

```typescript
// Title
containerEl.createEl('h3', { text: t('settings.provider.title') });

// Security warning
warningTitle.createSpan({ text: t('settings.provider.securityTitle') });
warningText.setText(t('settings.provider.securityDesc'));
warningList.createEl('li', { text: t('settings.provider.securityItem1', { configDir: app.vault.configDir }) });
warningList.createEl('li', { text: t('settings.provider.securityItem2') });
warningList.createEl('li', { text: t('settings.provider.securityItem3') });

// Desc
text: t('settings.provider.desc')

// Summary + add button
summary.createSpan({ text: t('settings.provider.count', { count: plugin.settings.llmConfigs.length }) });
const addBtn = actionsRow.createEl('button', { text: t('settings.provider.addBtn') });

// Empty state
emptyDiv.setText(t('settings.provider.empty'));

// Table headers
const table = createTable(containerEl, [
    t('settings.provider.tableHeaders.provider'),
    t('settings.provider.tableHeaders.status'),
    t('settings.provider.tableHeaders.actions')
]);

// Ollama version placeholder
versionEl.setText(t('settings.provider.ollama.checkingVersion'));

// Guidance text (in switch/case)
case 'claude-code': case 'codex': case 'qwen-code':
    guidance = t('settings.provider.guidance.requiresCli'); break;
case 'sap-ai-core':
    guidance = t('settings.provider.guidance.provideServiceKey'); break;
case 'ollama':
    guidance = t('settings.provider.guidance.configureBaseUrl'); break;
default:
    guidance = t('settings.provider.guidance.addApiKey'); break;

// Status labels
let statusLabel = t('settings.provider.status.needsConfig');
// ...
statusLabel = t('settings.provider.status.ready');
statusLabel = t('settings.provider.status.checking');
statusLabel = t('settings.provider.status.credentialsSet');

// Model summary
const modelSummary = hasModels
    ? t('settings.provider.models.count', { count: modelCount })
    : t('settings.provider.models.none');

// Ollama async status updates
serverStatusLine.setText(t('settings.provider.ollama.server.checking'));
serverStatusLine.setText(t('settings.provider.ollama.server.online'));
serverStatusLine.setText(t('settings.provider.ollama.server.offline'));
serverStatusLine.setText(t('settings.provider.ollama.server.error'));
versionEl.setText(status.version
    ? t('settings.provider.ollama.server.version', { version: status.version })
    : t('settings.provider.ollama.server.versionOnline'));
versionEl.setText(t('settings.provider.ollama.server.versionOffline'));
versionEl.setText(t('settings.provider.ollama.server.versionError'));
statusBadge.setText(hasModels ? t('settings.provider.status.ready') : t('settings.provider.status.serverOnline'));
statusBadge.setText(t('settings.provider.status.serverOffline'));
statusBadge.setText(t('settings.provider.status.serverError'));

// Time ago (in the refresh section)
if (diffMinutes < 1) timeAgo = t('settings.provider.refresh.justNow');
else if (diffMinutes < 60) timeAgo = t('settings.provider.refresh.minutesAgo', { n: diffMinutes });
else if (diffMinutes < 1440) timeAgo = t('settings.provider.refresh.hoursAgo', { n: Math.floor(diffMinutes / 60) });
else timeAgo = t('settings.provider.refresh.daysAgo', { n: Math.floor(diffMinutes / 1440) });
refreshLine.setText(t('settings.provider.refresh.lastRefresh', { timeAgo }));
refreshLine.setText(t('settings.provider.refresh.neverRefreshed'));

// Action buttons
const editBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.edit') });
const manageBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.manageModels') });
const refreshBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.refreshModels') });
refreshBtn.textContent = t('settings.provider.actions.refreshing');
refreshBtn.textContent = t('settings.provider.actions.refreshModels');
new Notice(t('settings.provider.notices.refreshed', { provider: config.provider }));
new Notice(t('settings.provider.notices.refreshFailed'));
const deleteBtn = actionsCell.createEl('button', { text: t('settings.provider.actions.delete') });

// Confirm delete
if (await showConfirm(app, t('settings.provider.confirm.delete', { provider: config.provider })))
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/components/tabs/provider-tab.ts
git commit -m "feat(i18n): migrate provider-tab strings"
```

---

## Task 9: Migrate `mcp-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/mcp-tab.ts`

- [ ] **Step 1: Add import**

```typescript
import { t } from '@/i18n';
```

- [ ] **Step 2: Replace all hardcoded strings**

```typescript
// Title + desc
containerEl.createEl('h3', { text: t('settings.mcp.title') });
text: t('settings.mcp.desc')

// Toolbar buttons
const inspectorBtn = toolbar.createEl('button', { text: t('settings.mcp.inspectorBtn') });
const testAllBtn = toolbar.createEl('button', { text: t('settings.mcp.testAllBtn') });
const refreshAllBtn = toolbar.createEl('button', { text: t('settings.mcp.refreshAllBtn') });
const addBtn = toolbar.createEl('button', { text: t('settings.mcp.addBtn') });

// Refresh all results notices
new Notice(t('settings.mcp.notices.refreshedAll', { count: successful }));
new Notice(t('settings.mcp.notices.refreshedPartial', { success: successful, failed }));

// Empty state
emptyDiv.setText(t('settings.mcp.empty'));

// Table headers
const table = createTable(containerEl, [
    t('settings.mcp.tableHeaders.name'),
    t('settings.mcp.tableHeaders.command'),
    t('settings.mcp.tableHeaders.arguments'),
    t('settings.mcp.tableHeaders.status'),
    t('settings.mcp.tableHeaders.tools'),
    t('settings.mcp.tableHeaders.actions')
]);

// Name column
nameStack.createDiv('ia-table-primary').setText(server.name || t('settings.mcp.untitled'));
nameStack.createDiv('ia-table-subtext').setText(t('settings.mcp.envVars', { count: envCount }));

// Command column
commandDisplay.setText(server.command || t('settings.mcp.notConfigured'));

// Args column
const argsPreview = server.args && server.args.length > 0 ? server.args.join(', ') : t('settings.mcp.noArgs');

// Status
statusLabel = t('settings.mcp.status.disabled');
statusLabel = 'connected';  // keep as-is (status value used as CSS class key)
statusLabel = 'disconnected';
// status detail strings
statusDetails.push(t('settings.mcp.status.enableToManage'));
statusDetails.push(connectionMode === 'manual' ? t('settings.mcp.status.manualConnect') : t('settings.mcp.status.autoConnect'));
statusDetails.push(t('settings.mcp.toolCount.live', { count: toolCount }));
statusDetails.push(t('settings.mcp.toolCount.cached', { count: cachedToolCount }));

// Tools column
toolsCell.createDiv('ia-table-subtext').setText(t('settings.mcp.cached'));
toolsCell.createDiv('ia-table-subtext').setText(t('settings.mcp.disabled'));

// Action buttons
const editBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.edit') });
const toggleBtn = actionsCell.createEl('button', {
    text: server.enabled ? t('settings.mcp.actions.enabled') : t('settings.mcp.actions.enabledOff')
});
new Notice(t('settings.mcp.notices.autoConnectFailed', { name: server.name }));
const connectBtn = actionsCell.createEl('button', { text: isConnected ? t('settings.mcp.actions.disconnect') : t('settings.mcp.actions.connect') });
connectBtn.textContent = currentlyConnected ? t('settings.mcp.actions.disconnecting') : t('settings.mcp.actions.connecting');
connectBtn.textContent = originalText;
new Notice(t('settings.mcp.notices.disconnected', { name: server.name }));
new Notice(t('settings.mcp.notices.enableFirst'));
new Notice(t('settings.mcp.notices.connected', { name: server.name }));
new Notice(t('settings.mcp.notices.disconnectFailed', { name: server.name }));
new Notice(t('settings.mcp.notices.connectFailed', { name: server.name }));
const testBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.test') });
new Notice(t('settings.mcp.notices.testNoCommand'));
testBtn.textContent = t('settings.mcp.actions.testing');
testBtn.textContent = t('settings.mcp.actions.test');
new Notice(t('settings.mcp.notices.testSuccess', { count: tools.length }));
new Notice(t('settings.mcp.notices.testFailed', { message: displayMessage }));
const deleteBtn = actionsCell.createEl('button', { text: t('settings.mcp.actions.delete') });
if (await showConfirm(app, t('settings.mcp.confirm.delete', { name: server.name })))
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/components/tabs/mcp-tab.ts
git commit -m "feat(i18n): migrate mcp-tab strings"
```

---

## Task 10: Migrate `agents-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/agents-tab.ts`

- [ ] **Step 1: Add import**

```typescript
import { t } from '@/i18n';
```

- [ ] **Step 2: Replace all hardcoded strings**

```typescript
// Title + desc
containerEl.createEl('h3', { text: t('settings.agents.title') });
text: t('settings.agents.desc')

// Summary + add button
agentSummary.createSpan({ text: t('settings.agents.count', { count: plugin.settings.agents.length }) });
const addBtn = actionsRow.createEl('button', { text: t('settings.agents.addBtn') });

// Empty state
emptyDiv.setText(t('settings.agents.empty'));

// Table headers
const table = createTable(containerEl, [
    t('settings.agents.tableHeaders.agent'),
    t('settings.agents.tableHeaders.model'),
    t('settings.agents.tableHeaders.capabilities'),
    t('settings.agents.tableHeaders.tools'),
    t('settings.agents.tableHeaders.actions')
]);

// Default badge
const tag = badges.createEl('span', { text: t('settings.agents.defaultBadge') });

// System prompt label
agentStack.createDiv('ia-table-subtext').setText(t('settings.agents.systemPrompt', { promptName: promptMap.get(agent.systemPromptId)?.name || t('settings.agents.customPrompt') }));

// Model display
let displayModel = t('settings.agents.model.notSet');
let displaySubtext = t('settings.agents.model.notFound');
// ...
displayModel = t('settings.agents.model.useChatView');
displaySubtext = t('settings.agents.model.useChatViewDesc');
// ...
displayModel = t('settings.agents.model.useDefault');
displaySubtext = t('settings.agents.model.useDefaultDesc');

// Capabilities
capsCell.createDiv('ia-table-subtext').setText(t('settings.agents.capabilities.noSpecialModes'));

// Tools badges
const builtInBadge = toolsBadges.createEl('span', { text: t('settings.agents.tools.builtIn', { count: agent.enabledBuiltInTools.length }) });
const mcpBadge = toolsBadges.createEl('span', { text: t('settings.agents.tools.mcpServer', { count: serverCount }) });
const toolBadge = toolsBadges.createEl('span', { text: t('settings.agents.tools.mcpTool', { count: toolCount }) });
toolsCell.createDiv('ia-table-subtext').setText(t('settings.agents.tools.noTools'));

// Action buttons
const editBtn = actionsCell.createEl('button', { text: t('settings.agents.actions.edit') });
const deleteBtn = actionsCell.createEl('button', { text: canDelete ? t('settings.agents.actions.delete') : t('settings.agents.actions.protected') });

// Confirm
if (await showConfirm(app, t('settings.agents.confirm.delete', { name: agent.name })))
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/components/tabs/agents-tab.ts
git commit -m "feat(i18n): migrate agents-tab strings"
```

---

## Task 11: Migrate `prompts-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/prompts-tab.ts`

- [ ] **Step 1: Add import**

```typescript
import { t } from '@/i18n';
```

- [ ] **Step 2: Replace all hardcoded strings**

```typescript
containerEl.createEl('h3', { text: t('settings.prompts.title') });
text: t('settings.prompts.desc')
const addBtn = actionRow.createEl('button', { text: t('settings.prompts.addBtn') });
emptyDiv.setText(t('settings.prompts.empty'));
const table = createTable(containerEl, [
    t('settings.prompts.tableHeaders.name'),
    t('settings.prompts.tableHeaders.contentPreview'),
    t('settings.prompts.tableHeaders.created'),
    t('settings.prompts.tableHeaders.updated'),
    t('settings.prompts.tableHeaders.enabled'),
    t('settings.prompts.tableHeaders.actions')
]);
createStatusIndicator(statusHost, prompt.enabled ? 'success' : 'warning', prompt.enabled ? t('settings.prompts.status.enabled') : t('settings.prompts.status.disabled'));
const editBtn = actionsCell.createEl('button', { text: t('settings.prompts.actions.edit') });
const toggleBtn = actionsCell.createEl('button', { text: prompt.enabled ? t('settings.prompts.actions.disable') : t('settings.prompts.actions.enable') });
const deleteBtn = actionsCell.createEl('button', { text: t('settings.prompts.actions.delete') });
if (await showConfirm(app, t('settings.prompts.confirm.delete', { name: prompt.name })))
```

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -10
git add src/presentation/components/tabs/prompts-tab.ts
git commit -m "feat(i18n): migrate prompts-tab strings"
```

---

## Task 12: Migrate `tools-tab.ts`, `rag-tab.ts`, `websearch-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/tools-tab.ts`
- Modify: `src/presentation/components/tabs/rag-tab.ts`
- Modify: `src/presentation/components/tabs/websearch-tab.ts`

- [ ] **Step 1: Migrate `tools-tab.ts`**

Add `import { t } from '@/i18n';`.

Replace header + sub-tab strings:

```typescript
containerEl.createEl('h3', { text: t('settings.tools.title') });
text: t('settings.tools.desc')

const tabDefs: Array<{ slug: ToolsSubTab; label: string }> = [
    { slug: 'built-in', label: t('settings.tools.subTabs.builtIn') },
    { slug: 'mcp', label: t('settings.tools.subTabs.mcp') },
    { slug: 'openapi', label: t('settings.tools.subTabs.openapi') },
    { slug: 'cli', label: t('settings.tools.subTabs.cli') }
];
```

- [ ] **Step 2: Migrate `rag-tab.ts`**

Add `import { t } from '@/i18n';`.

```typescript
containerEl.createEl('h3', { text: t('settings.rag.title') });
text: t('settings.rag.desc')

const subTabs = [
    { id: 'overview', label: t('settings.rag.subTabs.overview'), icon: '🏠' },
    { id: 'chunking', label: t('settings.rag.subTabs.chunking'), icon: '📄' },
    { id: 'search', label: t('settings.rag.subTabs.search'), icon: '🔍' },
    { id: 'filters', label: t('settings.rag.subTabs.filters'), icon: '🗂️' },
    { id: 'advanced', label: t('settings.rag.subTabs.advanced'), icon: '⚙️' },
    { id: 'websearch', label: t('settings.rag.subTabs.websearch'), icon: '🌐' }
];
```

- [ ] **Step 3: Migrate `websearch-tab.ts`**

Add `import { t } from '@/i18n';`.

```typescript
containerEl.createEl('h3', { text: t('settings.websearch.title') });
text: t('settings.websearch.desc')

addSubheading(t('settings.websearch.generalBehavior'));

const providerOptions: Array<{ value: string; label: string }> = [
    { value: 'duckduckgo', label: t('settings.websearch.providers.duckduckgo') },
    { value: 'google',     label: t('settings.websearch.providers.google') },
    { value: 'bing',       label: t('settings.websearch.providers.bing') },
    { value: 'serpapi',    label: t('settings.websearch.providers.serpapi') },
    { value: 'tavily',     label: t('settings.websearch.providers.tavily') },
    { value: 'searxng',    label: t('settings.websearch.providers.searxng') },
    { value: 'brave',      label: t('settings.websearch.providers.brave') },
    { value: 'yahoo',      label: t('settings.websearch.providers.yahoo') },
    { value: 'yandex',     label: t('settings.websearch.providers.yandex') },
    { value: 'qwant',      label: t('settings.websearch.providers.qwant') },
    { value: 'mojeek',     label: t('settings.websearch.providers.mojeek') }
];
```

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -10
git add src/presentation/components/tabs/tools-tab.ts src/presentation/components/tabs/rag-tab.ts src/presentation/components/tabs/websearch-tab.ts
git commit -m "feat(i18n): migrate tools, rag, websearch tab strings"
```

---

## Task 13: Migrate `quickactions-tab.ts` and `usage-tab.ts`

**Files:**
- Modify: `src/presentation/components/tabs/quickactions-tab.ts`
- Modify: `src/presentation/components/tabs/usage-tab.ts`

- [ ] **Step 1: Migrate `quickactions-tab.ts`**

Add `import { t } from '@/i18n';`.

```typescript
containerEl.createEl('h3', { text: t('settings.quickActions.title') });
text: t('settings.quickActions.desc')

new Setting(containerEl)
    .setName(t('settings.quickActions.actionPrefix.name'))
    .setDesc(t('settings.quickActions.actionPrefix.desc'))
    .addText(text => text
        .setPlaceholder(t('settings.quickActions.actionPrefix.placeholder'))
        // ...
    );

summary.createSpan({
    text: t('settings.quickActions.count', {
        count: plugin.settings.quickActions.length,
        enabled: enabledCount
    })
});

const addBtn = actionsRow.createEl('button', { text: t('settings.quickActions.addBtn') });
```

- [ ] **Step 2: Migrate `usage-tab.ts`**

Add `import { t } from '@/i18n';`.

```typescript
containerEl.createEl('h3', { text: t('settings.usage.title') });
text: t('settings.usage.desc')
containerEl.createEl('p', { text: t('settings.usage.notAvailable') });

const rangeConfig: Array<{ range: Range; label: string; subLabel: string }> = [
    { range: 'today', label: t('settings.usage.ranges.today'), subLabel: t('settings.usage.ranges.today') },
    { range: 'week',  label: t('settings.usage.ranges.week'),  subLabel: t('settings.usage.ranges.week') },
    { range: 'month', label: t('settings.usage.ranges.month'), subLabel: t('settings.usage.ranges.month') },
    { range: 'all',   label: t('settings.usage.ranges.all'),   subLabel: t('settings.usage.ranges.all') },
];
```

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -10
git add src/presentation/components/tabs/quickactions-tab.ts src/presentation/components/tabs/usage-tab.ts
git commit -m "feat(i18n): migrate quickactions and usage tab strings"
```

---

## Task 14: Migrate chat components

**Files:**
- Modify: `src/presentation/components/chat/chat-header.component.ts`
- Modify: `src/presentation/components/chat/chat-input.component.ts`

- [ ] **Step 1: Migrate `chat-header.component.ts`**

Add `import { t } from '@/i18n';`.

```typescript
// Breadcrumb
historyBtn.createSpan({ text: t('chat.conversations'), cls: 'chat-action-text' });
historyBtn.setAttr('title', t('chat.toggleConversationsTitle'));
this.conversationTitleEl = breadcrumb.createSpan({ text: t('chat.currentConversation'), cls: 'chat-breadcrumb-current' });

// Action buttons
newLink.createSpan({ text: t('chat.new'), cls: 'chat-action-text' });
settingsLink.createSpan({ text: t('chat.settings'), cls: 'chat-action-text' });
settingsLink.setAttr('title', t('chat.openSettingsTitle'));

// Mode / Prompt / Agent labels
modeGroup.createSpan({ text: t('chat.mode'), cls: 'chat-label' });
this.promptSelectorGroup.createSpan({ text: t('chat.prompt'), cls: 'chat-label' });
this.agentSelectorGroup.createSpan({ text: t('chat.agent'), cls: 'chat-label' });

// Mode selector options
this.modeSelector.createEl('option', { value: 'chat', text: t('chat.modeOptions.chat') });
this.modeSelector.createEl('option', { value: 'agent', text: t('chat.modeOptions.agent') });

// Prompt selector
this.promptSelector.createEl('option', { value: '', text: t('chat.noSystemPrompt') });

// Agent selector empty
this.agentSelector.createEl('option', { value: '', text: t('chat.noAgentsAvailable') });
```

- [ ] **Step 2: Migrate `chat-input.component.ts`**

Add `import { t } from '@/i18n';`.

```typescript
// Textarea placeholder
this.textarea = editorWrapper.createEl('textarea', {
    attr: {
        placeholder: t('chat.placeholder'),
        rows: '1'
    }
});

// Send button aria label
this.sendBtn.setAttribute('aria-label', t('chat.sendAriaLabel'));

// Send hint
this.sendHint.setText(t('chat.sendHintPrefix'));
this.sendHint.createEl('kbd', { text: t('chat.sendHintKey') });
this.sendHint.appendText(t('chat.sendHintSuffix'));

// Stop button
this.stopBtn.createSpan({ text: t('chat.stop') });

// Header action: Add reference
this.createHeaderActionButton(actionsContainer, {
    icon: 'paperclip',
    label: t('chat.addReference'),
    tooltip: t('chat.addReferenceTooltip'),
    onClick: () => this.callbacks.onShowReferenceMenu()
}).addClass('is-link');
```

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -10
git add src/presentation/components/chat/chat-header.component.ts src/presentation/components/chat/chat-input.component.ts
git commit -m "feat(i18n): migrate chat component strings"
```

---

## Task 15: Migrate modals + `main.ts` notices

**Files:**
- Modify: `src/presentation/components/modals/confirm-modal.ts`
- Modify: `src/presentation/components/modals/agent-edit-modal.ts`
- Modify: `main.ts`

- [ ] **Step 1: Migrate `confirm-modal.ts`**

Add `import { t } from '@/i18n';`.

```typescript
const cancelBtn = buttonContainer.createEl('button', { text: t('modals.confirm.cancel') });
const confirmBtn = buttonContainer.createEl('button', {
    text: t('modals.confirm.confirm'),
    cls: 'mod-warning'
});
```

- [ ] **Step 2: Migrate `agent-edit-modal.ts`**

Add `import { t } from '@/i18n';`.

```typescript
contentEl.createEl('h2', { text: t('modals.agentEdit.title') });

new Setting(contentEl).setName(t('modals.agentEdit.icon.name')).setDesc(t('modals.agentEdit.icon.desc'))
new Setting(contentEl).setName(t('modals.agentEdit.description.name')).setDesc(t('modals.agentEdit.description.desc'))

// model strategy dropdown options
dropdown.addOption('default', t('modals.agentEdit.modelStrategy.options.default'))
dropdown.addOption('chat-view', t('modals.agentEdit.modelStrategy.options.chatView'))
dropdown.addOption('fixed', t('modals.agentEdit.modelStrategy.options.fixed'))
dropdown.addOption('', t('modals.agentEdit.modelStrategy.noModels'))

// Create new prompt option
dropdown.addOption('__custom__', t('modals.agentEdit.systemPrompt.createNew'))

new Setting(contentEl).setName(t('modals.agentEdit.systemPrompt.promptName.name')).setDesc(t('modals.agentEdit.systemPrompt.promptName.desc'))
new Setting(contentEl).setName(t('modals.agentEdit.systemPrompt.promptContent.name')).setDesc(t('modals.agentEdit.systemPrompt.promptContent.desc'))

contentEl.createEl('h3', { text: t('modals.agentEdit.capabilities') })
contentEl.createEl('h3', { text: t('modals.agentEdit.memory.title') })
contentEl.createEl('p', { text: t('modals.agentEdit.memory.notice') })
contentEl.createEl('h3', { text: t('modals.agentEdit.tools.title') })

new Setting(contentEl).setName(t('modals.agentEdit.tools.builtIn.name')).setDesc(t('modals.agentEdit.tools.builtIn.desc'))
new Setting(contentEl).setName(t('modals.agentEdit.tools.cli.name')).setDesc(t('modals.agentEdit.tools.cli.desc'))
new Setting(contentEl).setName(t('modals.agentEdit.tools.cli.name')).setDesc(t('modals.agentEdit.tools.cli.noTools'))

contentEl.createEl('h3', { text: t('modals.agentEdit.mcp.title') })
empty.setText(t('modals.agentEdit.mcp.noServers'))

new Notice(t('modals.agentEdit.notices.promptRequired'))
```

- [ ] **Step 3: Migrate `main.ts` notices**

Add `import { t } from './src/i18n';` near the other `src/i18n` import (already added in Task 5 — only one import needed).

Locate the ExplainTextModal handler (around line 672–742) and replace:

```typescript
// BEFORE:
new Notice('Please configure an LLM provider in settings first');
new Notice('Please select a default model in settings');
new Notice(`No valid provider configuration found for model: ${modelId}`);
const loadingNotice = new Notice('Processing...', 0);
new Notice('Text updated successfully');
new Notice(`Error: ${errorMsg}`);

// AFTER:
new Notice(t('notices.noProvider'));
new Notice(t('notices.noModel'));
new Notice(t('notices.noValidProvider', { modelId }));
const loadingNotice = new Notice(t('notices.processing'), 0);
new Notice(t('notices.textUpdated'));
new Notice(t('notices.error', { message: errorMsg }));
```

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -10
git add src/presentation/components/modals/confirm-modal.ts src/presentation/components/modals/agent-edit-modal.ts main.ts
git commit -m "feat(i18n): migrate modals and main.ts notice strings"
```

---

## Task 16: Lint, full build, deploy

- [ ] **Step 1: Run lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no errors or warnings.  
If lint errors appear: fix them, then re-run lint.

- [ ] **Step 2: Run unit tests**

```bash
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: all tests pass including the 3 new i18n tests.

- [ ] **Step 3: Final build**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds, `main.js` generated.

- [ ] **Step 4: Deploy to local Obsidian**

```bash
node scripts/deploy.js --local
```

Expected: Plugin files copied to local Obsidian vault.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete i18n implementation - en/zh support via i18next"
```
