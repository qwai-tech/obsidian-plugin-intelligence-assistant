# Reddit

## Target Subreddits

- r/ObsidianMD (primary)
- r/selfhosted (for Ollama local model angle)
- r/productivity (broader audience)

---

## Post for r/ObsidianMD

**Title:** I built an Obsidian plugin that brings Chat, Agents, RAG, Web Search, and MCP tools into your vault — Intelligence Assistant [Free, v0.0.6]

---

**Body:**

Hey r/ObsidianMD,

I've been building Intelligence Assistant for a while and it's now live on the Community Plugin store.

**The problem I was solving:** I kept switching between Obsidian and multiple AI tools (ChatGPT, Perplexity, etc.), manually copying note context into AI prompts, then pasting answers back. It was slow and broke my flow constantly.

**What it does:**

🤖 **Multi-provider chat** — OpenAI, Anthropic, Gemini, DeepSeek, Ollama (local), OpenRouter, SAP AI Core. Switch provider and model from the chat header.

⚡ **Agent mode** — Full ReAct loop with native function calling (OpenAI) and automatic text-based fallback for other providers. Define reusable agents with custom system prompts, tool permissions, MCP access, and configurable max steps.

📚 **RAG over your vault** — Local vector store. Index your notes, ask questions, get answers that cite your actual content. Supports OpenAI, Google, Ollama, and DeepSeek embeddings.

✨ **Quick Actions** — Select any text in your vault, right-click, and trigger pre-built AI actions: Summarize, Explain, Fix Grammar, Improve Writing, Expand. Zero context-switching, instant results.

🌐 **Web Search** — 8 providers: Google CSE, Bing, Brave, SerpAPI, Tavily, SearXNG, Qwant, Mojeek. Configurable locale, freshness, and domain filters.

🔧 **MCP Integration** — Connect any stdio MCP server. Tool catalog cached at startup. Built-in MCP Inspector for live testing.

📡 **HTTP/OpenAPI Tools** — Point at any OpenAPI spec (local JSON or remote URL). Every path/verb pair becomes an agent tool automatically. Override base URL, inject auth headers.

⌨️ **CLI Tools** — Wrap shell commands as agent tools. Parameter templates, env vars, working directory, timeout, 25+ built-in presets.

**Install:**
Settings → Community Plugins → Browse → search **"Intelligence Assistant"**

**Notes:**
- Desktop only (Obsidian restriction)
- Requires Obsidian v1.7.2+
- All credentials stored per-vault

Happy to answer questions. It's early (v0.0.6) but the core features are solid. Feedback and bug reports are very welcome!

GitHub: github.com/qwai-tech/intelligence-assistant

---

## Post for r/selfhosted (Ollama angle)

**Title:** Built an Obsidian plugin with full Ollama support — local LLM chat, RAG, and Agent mode entirely on your own machine

**Body:**

For those who run Ollama locally and use Obsidian for notes — Intelligence Assistant now lets you use your local models directly inside Obsidian.

Local-first setup:
- **Chat:** use any Ollama model, streaming responses
- **RAG:** index your vault with Ollama embeddings, no external API calls
- **Agent mode:** multi-step tasks using your local model's function calling capability

Everything stays on your machine. No data leaves your vault.

Also supports OpenAI, Claude, Gemini etc. if you want cloud models — but the fully-local path is first-class.

Install via Obsidian Community Plugins: search "Intelligence Assistant"
