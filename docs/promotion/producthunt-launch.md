# ProductHunt Launch Kit — Intelligence Assistant for Obsidian

---

## Tagline (60 characters max, English)

```
AI Agents that read your notes, search the web, and run code — right inside Obsidian.
```

**Fallback options:**
- "Turn Obsidian into an AI-native workspace. Agents, MCP, RAG, CLI."
- "Give Obsidian AI superpowers: agents, tools, web search, and RAG."
- "Your notes, now AI-navigable. Agents + tools inside Obsidian."

---

## Description (260 characters max)

```
Intelligence Assistant transforms Obsidian into an AI workspace. Chat with 8 LLM providers, deploy configurable agents with native function calling, connect MCP servers, search the web, run CLI commands, index notes with RAG — all without leaving your vault. 46 languages. Open source.
```

---

## Topics / Tags

```
obsidian, ai, llm, agent, mcp, productivity, developer-tools, open-source, note-taking, automation
```

---

## Thumbnail Ideas

- **Primary**: A clean split-screen showing the Obsidian plugin UI on one side (chat view with agent execution trace visible) and a resulting note/action on the other side. Dark theme preferred (matches Obsidian aesthetics).
- **Alternative**: The Intelligence Assistant logo/icon centered on a dark background, with subtle tech-inspired geometric elements.

---

## Gallery Images (suggest 5–6)

1. **Chat View** — Streaming conversation with model badge, token usage, and tool call execution trace cards visible.
2. **Agent Settings** — The agent configuration panel showing model strategy, tool permissions, MCP server access.
3. **MCP Inspector** — The built-in MCP debugging tool showing server connections and live tool testing.
4. **CLI Tools** — The preset picker with 27+ macOS/Linux presets (grep, curl, python, safari, etc.).
5. **Web Search & RAG** — Settings panels showing provider selection, filters, and embedding configuration.
6. **Quick Actions** — Right-click context menu showing AI-powered actions on selected text.

---

## First Comment (The "Maker's Story")

paste as the first comment immediately after launch:

---

Hey ProductHunt! 👋

I'm the maker of Intelligence Assistant — an Obsidian plugin that brings AI agents, tools, and knowledge retrieval directly into your local note-taking workflow.

**Why I built this**

I've been an Obsidian power user for years. Like many of you, my vault grew into a second brain — thousands of interconnected notes, ideas, research threads. But the gap between "having knowledge" and "using knowledge" kept getting wider. I'd know I wrote something about a topic somewhere, but finding it and synthesizing it was manual work.

At the same time, I was using ChatGPT/Claude more and more for research and coding. The constant alt-tabbing between Obsidian and a browser-based chat was breaking my flow state. Copy-pasting content back and forth felt absurd in 2024.

So I asked: what if the AI lived *inside* the notes? What if it could read my vault, search the web for context, run commands on my machine, and write results back — all as first-class Obsidian operations?

**What makes it different**

Most "[app] + ChatGPT" plugins are thin wrappers around a chat API. Intelligence Assistant is built from the ground up as an AI orchestration layer:

1. **Agent Architecture** — Not just Q&A. Define agents with custom tool permissions, model strategies, and capability toggles. Agent mode runs multi-step loops: think → call tools → observe → decide next step.

2. **Native Function Calling** — OpenAI/DeepSeek/OpenRouter use the native tools API. Automatic fallback for models that don't support it.

3. **MCP (Model Context Protocol)** — One of the first Obsidian plugins to deeply integrate Anthropic's open protocol for connecting LLMs to external tools. Connect any MCP server, tools auto-register in agent loops. Built-in inspector for live testing.

4. **CLI Tools** — This is where it gets powerful. Define shell commands as agent-callable tools. 27 presets for common operations (grep, curl, python, jq, open, pbcopy, etc.). The agent can search your notes, fetch web data, run analysis scripts, and write results back — autonomously.

5. **RAG with Real Embeddings** — Not a keyword search. Actual vector embeddings from OpenAI/Google/DeepSeek/Ollama, with configurable chunking strategies and grading thresholds.

6. **Web Search** — 9 providers, auto-trigger for time-sensitive queries, locale and freshness controls.

**By the numbers**
- 8 LLM providers (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, OpenRouter, SAP AI Core, custom OpenAI-compatible)
- 46 languages, auto-detected from Obsidian settings
- 27 CLI presets
- 9 web search providers
- Open source (MIT)

**What's next**

Working on memory/persistence across conversations, multi-agent collaboration, and deeper OS-level automation.

Would love to hear how you're using AI with your notes — and what tools you'd want an agent inside Obsidian to have. Happy to answer any questions about the architecture or Obsidian plugin development!

---

## Media / Snippet (for social sharing)

```
🚀 Intelligence Assistant — AI agents inside Obsidian

🧠 Chat with 8 LLM providers
🤖 Configurable agents with tool permissions
🔌 MCP server integration + built-in inspector
⌨️ 27 CLI presets — grep, curl, python, safari, and more
📚 RAG with real embeddings over your vault
🌍 Web search (9 providers)
📡 OpenAPI → auto-generated tools
🌐 46 languages

Open source · Obsidian community plugin
```

---

## Launch Checklist

- [ ] Thumbnail (GIF or static, 635×380 recommended)
- [ ] 5–6 gallery screenshots at 1270×760
- [ ] First comment ready in clipboard
- [ ] Tagline finalized
- [ ] Topics selected (max 5 on free tier)
- [ ] Maker profile updated
- [ ] Social media draft posts ready (Twitter/X, Reddit r/ObsidianMD, Chinese social media)
- [ ] GitHub repo README clean and up-to-date
- [ ] Reply to every comment within first 4 hours
