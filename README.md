# Intelligence Assistant for Obsidian

Transform any vault into an AI-native workspace. The Intelligence Assistant plugin delivers a fast chat interface, configurable agents, MCP tool integrations, and workflow automation so you can reason over notes, trigger actions, and build repeatable processes without leaving Obsidian.

## Feature Highlights

- **Modern Chat View** – Switch between Chat and Agent modes, choose prompts or agents inline, and see provider/model badges plus token usage as you converse.
- **Context-Rich Replies** – Optional RAG layer powered by the vault vector store (`data/vector_store/notes.json`) with on/off indicators and tooltips that explain the current index.
- **Custom Agents & MCP** – Define reusable agents (stored in `data/agents/`) with tool permissions, memory options, and MCP server access. Cached MCP tool catalogs live under `data/cache/mcp-tools/` for instant reuse.
- **Workflow Automation** *(Beta)* – Visual workflows, executions, and logs are saved in `data/workflow/`, enabling multi-step AI procedures that you can rerun or audit later.
- **Seamless Persistence** – Conversations remember their model, prompt/agent, temperature, token cap, and retrieval flags so reopening a thread restores the exact configuration.

## Quick Start

### Community Plugin Install (recommended)
1. Open **Settings → Community plugins** inside Obsidian.
2. Browse for **“Intelligence Assistant”** and install it.
3. Enable the plugin.

### Manual Install
1. Download the latest release archive.
2. Extract it into `<vault>/.obsidian/plugins/intelligence-assistant`.
3. Reload Obsidian or toggle the plugin off/on.

### Requirements
- Obsidian v0.15.0 or later.
- Node.js 18+ with npm if you plan to build from source.
- API keys for whichever LLM providers you intend to use (OpenAI, Anthropic, Google, DeepSeek, Ollama, SAP AI Core, etc.).

## Chat Experience

1. Launch the view via the ribbon bubble icon or command palette.
2. Use the top rows to pick a mode (Chat vs Agent), select a prompt/agent, and choose the model, temperature, and max tokens.
3. Compose messages with reference attachments, optional image uploads, and quick toggles for RAG or Web search.
4. Assistant bubbles always show the provider + model used, and token usage is displayed in the footer as lightweight annotations (excluded when copying chat content).
5. The `Insert to Notes` action lets you drop responses directly into the active file.

## Web Search Providers

Configure web search under **Settings → Intelligence Assistant → Web Search** to give the assistant access to current information. The tab now exposes:

- A provider picker that spans DuckDuckGo, Google Custom Search, Bing, SerpAPI, Tavily, SearXNG, Brave Search, Yahoo, Yandex, Qwant, and Mojeek.
- Locale controls (language + country/market), result freshness, and optional allow/deny lists to keep answers focused on trusted domains.
- Provider-specific credentials including the shared API key, Google CSE ID, custom SerpAPI/SearXNG endpoints, and dedicated keys for Tavily, Brave, Qwant, or Mojeek.

Fill only the fields required by your chosen provider—the UI describes what each option powers and settings persist per vault.

## Agents, Workflows, and Data Layout

```
data/
├── agents/                 # Agent index + JSON definitions
├── prompts/                # Prompt index + JSON definitions
├── workflow/               # Workflows and per-run execution logs
├── vector_store/notes.json # Vault embeddings for RAG
├── llm-providers.json      # Saved provider credentials/config
├── mcp-servers.json        # Registered MCP servers
└── cache/
    ├── llm_models.json     # Cached provider model catalogs
    └── mcp-tools/          # Cached tool manifests per MCP server
```

Provider and workflow metadata now live exclusively in `data/`, keeping `config/user/settings.json` lean and user-editable.

## Development

```bash
npm install          # install dependencies
npm run dev          # development build + watcher (see scripts/config for target vault)
npm run lint         # ESLint over src/
npm run type-check   # tsc --noEmit
npm run test         # Jest suite
npm run build        # production bundle
```

### Task Completion Rule

After every task, run `npm run lint` and `npm run build`. Do not consider the work done until both commands succeed and any new issues are resolved.

Additional helpers: `npm run dev:hot`, `npm run dev:watch`, and `npm run build:production` for advanced workflows.

## Documentation

- Docs index: [docs/README.md](docs/README.md)
- Architecture overview (EN): [docs/architecture/overview-en.md](docs/architecture/overview-en.md)
- Architecture overview (中文): [docs/architecture/overview-zh.md](docs/architecture/overview-zh.md)
- API reference: [docs/reference/api.md](docs/reference/api.md)
- Project structure: [docs/reference/project-structure.md](docs/reference/project-structure.md)

Contributions, issues, and feature requests are welcome—feel free to open a PR or discussion with your ideas.
