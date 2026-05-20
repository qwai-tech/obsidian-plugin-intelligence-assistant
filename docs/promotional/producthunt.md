# ProductHunt

## Launch Details

**Product Name:** Intelligence Assistant for Obsidian

**Tagline:** Full AI workspace inside your vault — chat, agents, RAG, MCP, and web search

**Topics:** Productivity, Artificial Intelligence, Note-taking, Developer Tools

---

## Description（产品页正文）

Intelligence Assistant transforms Obsidian into an AI-native workspace. Instead of switching between your notes app and multiple AI tools, everything lives in one place.

**Core capabilities:**

- **Multi-provider chat** — OpenAI, Claude, Gemini, DeepSeek, Ollama (local), OpenRouter. Streaming responses with token usage and model badges.
- **Agent mode** — ReAct loops with native function calling. Define reusable agents with custom prompts, tool permissions, and MCP server access.
- **Quick Actions** — Select text → right-click → Summarize / Explain / Fix Grammar / Improve / Expand. AI at your cursor, no chat window needed.
- **RAG over your vault** — Index your notes with a local vector store. AI answers cite your own content.
- **Web search** — 8 providers (Google, Bing, Brave, Tavily, and more) injected into conversations.
- **MCP integration** — Connect any Model Context Protocol server. Built-in inspector for live testing.
- **OpenAPI tools** — Point at any API spec; every endpoint becomes an agent-callable tool automatically.
- **CLI tools** — Wrap shell commands as agent tools with 25+ built-in presets.

Free. Desktop only. Open source.

→ Install via Obsidian Community Plugins: search "Intelligence Assistant"

---

## Maker's First Comment（创始人首条评论）

Hi Product Hunt! 👋

I built Intelligence Assistant because I was tired of context-switching between Obsidian and multiple AI tools every day — copying note content into ChatGPT, pasting answers back, switching to Perplexity for web searches. It broke my flow constantly.

I wanted one place where I could chat with AI, run agents, search my vault, pull in web context, and connect external tools — without ever leaving Obsidian.

The features I'm most excited about:

**Agent mode** — you can define specialized agents (researcher, editor, coder) each with their own prompts and tool permissions. The agent runs multi-step ReAct loops automatically.

**MCP integration** — connect any MCP server and its tools become immediately available to your agents. The ecosystem of MCP servers is growing fast and this makes Obsidian a surprisingly capable automation hub.

**RAG** — finally, an AI that knows what's actually in your second brain, not just the internet.

The plugin is free and open source. Local models via Ollama are fully supported for privacy-conscious users.

Would love feedback — especially on Agent and MCP workflows. AMA!

---

## Gallery Screenshots（建议截图顺序）

1. Chat view with model selector and streaming response
2. Agent mode executing a multi-step task with tool calls visible
3. RAG response showing note citations
4. Settings page showing multiple provider configurations
5. MCP Inspector interface
