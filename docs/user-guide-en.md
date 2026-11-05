# User guide — 0.1.0

[中文](user-guide-zh.md) · [README](../README.md) · [Version and validation status](releases/0.1.0.md)

## Set up a model

Open **Settings → Intelligence Assistant → LLM**. The Providers subtab configures a connection; the Models subtab manages discovered/enabled models and defaults.

1. Choose the appropriate provider. For an OpenAI-compatible gateway, choose Custom and enter its base URL.
2. Select a credential from Obsidian's Keychain. Some local/custom services accept no key; that depends on the service.
3. Test the connection and inspect the returned models. Check that the chosen model is enabled and supports the feature you need.
4. Select a default chat model. For RAG, select a suitable embedding model separately.
5. Send a short real chat request before starting a large task.

Connection discovery, ordinary chat, tool calling, image input and embeddings are different capabilities. A successful model-list request does not verify all of them. Two connections can expose the same wire model name; check the provider label as well as the model name.

Provider types in this version are OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, Ollama, SAP AI Core and Custom. Actual model availability belongs to the configured service, not the plugin's provider label.

### SAP AI Core

Store the complete Service Key JSON in Obsidian's Keychain and select that secret in the SAP provider. Set a resource group (normally `default`). The AI API URL is obtained from `serviceurls.AI_API_URL` unless you supply an override. Test the connection to discover running deployments, then select a supported deployment/model. Old Service Key values migrate to secret references; settings previously deleted cannot be reconstructed.

SAP is implemented but was not called against a live tenant during this release preparation. Ollama was excluded from the current live acceptance run. Neither is certified by the Manifold results in the [validation record](releases/0.1.0.md).

## Settings navigation

| Top-level Tab | Purpose |
|---|---|
| General | Plugin version, default chat model, titles/icons and notifications |
| LLM | Providers and models |
| MCP | Configure, connect and inspect MCP servers |
| Tools | Built-in, MCP, OpenAPI and CLI tool sources |
| RAG | Indexing, retrieval, filters, grading and Web search |
| Prompts | Reusable system prompts |
| Agents | Agent presets, model strategy, permissions, budgets, memory and writes |
| Quick actions | Reusable actions for the editor/chat workflow |
| Usage | Recorded model/request usage |

Use the Tab buttons or their keyboard navigation. General settings also retain the host's searchable controls. Subtabs share the same saved configuration; MCP appearing under Tools does not create a separate server configuration.

## Chat, references and images

Use the ribbon or command palette to open AI chat. Select a model and use Chat mode for ordinary conversation. Add note/folder references when you want their content included. Image attachments require a model/service that accepts image input. Removing an attachment affects the pending request, not the original file.

Copy, Save and Insert actions operate on the actual reply. Check the destination and active editor before inserting or saving. Provider errors, output limits and Stop can leave an incomplete reply; its existence in the conversation is not a completion certificate.

## Agents and writes

An Agent combines a system prompt, model strategy, enabled tools, budgets and optional knowledge features. The four specialist presets are configurations for a selected Agent, not four parallel workers.

Model strategies:

- **Default:** use the configured default model.
- **Chat view:** follow the model selected in the chat view.
- **Fixed:** use the Agent's own model selection.

Choose a model that supports tool calling. OpenAI-compatible, Anthropic, Gemini and Ollama adapters implement their corresponding native tool protocols; there is no general automatic text-parser fallback for an arbitrary non-tool model.

Built-in vault-write tools return proposals. With Autonomous write off, review and apply the proposal card. A pending proposal is not a saved file. With Autonomous write on for the Agent and an approved host task, supported proposals can be applied during execution, allowing later tools to use the saved files. A phrase in a prompt does not grant that setting or new permissions. Failed auto-application can leave a manual proposal for review.

Configured CLI, MCP and HTTP tools may perform effects directly. Their effects are not converted into built-in vault proposals merely because an Agent calls them. These integrations run with the access of their process/service; only add trusted definitions and grant the tools needed for the task.

### Built-in tools

| Tool | Purpose |
|---|---|
| `read_file` | Read a vault file |
| `write_file` | Propose replacing file contents |
| `list_files` | List files in the vault |
| `search_files` | Search vault content/files |
| `create_note` | Propose a new Markdown note |
| `append_to_note` | Propose appending to a note |
| `update_properties` | Propose updating note properties |
| `read_canvas` | Read Canvas data |
| `update_canvas` | Propose updating Canvas data |
| `read_pdf` | Extract PDF text through the host's PDF support |
| `find_notes_by_tag` | Find tagged notes |
| `resolve_link` | Resolve a note link |
| `make_link` | Construct an Obsidian link |

Tool availability is the intersection of globally enabled sources/tools, Agent permissions and recognized task restrictions. Move/delete support in internal proposal types is not a registered built-in move/delete tool. PDF text extraction does not promise OCR of scanned images.

## Stop and Continue

1. Click **Stop** during an Agent run.
2. Inspect the tool trace and actual files, especially for external operations whose result is uncertain.
3. Send `Continue.` in the same conversation. The same procedure works after reloading Obsidian.

The host retains the original goal, recognized tool restrictions, bounded successful-work evidence and pending/uncertain actions. Re-reading an earlier source does not itself move the unfinished-work boundary backward. Current-run counts and previous-run counts have separate scopes.

Continuation is a new run using saved evidence. It is not automatic journal replay, a guarantee of semantic completion, or a guarantee that an interrupted external mutation ran exactly once. When evidence has been truncated, sources changed, or an external call is uncertain, inspect the actual state before repeating work.

For a restriction, use plain top-level text with exact tool names, for example `Use only read_file;` or `No tools.`. `Only use the read_file tool.` is also recognized. The grammar is deliberately limited; unsupported explicit restrictive syntax fails closed. Quoted examples, blockquotes and fenced notes are data, not permission grants. A separate new task starts a new restriction scope.

For large tasks, set appropriate Agent step/output budgets and require observable outputs. Provider limits can truncate generation; a reasoning model may spend part of its output budget on reasoning. The plugin does not silently raise budgets or disable thinking to turn an incomplete response into a success.

## RAG, memory and Web search

**RAG:** choose an embedding model, configure included/excluded content and build the index under RAG. The index is local, but embedding requests use the chosen service. Enabling incremental embedding allows later file events to update it. Rebuild when changing embedding models or indexing rules as appropriate. Retrieval/context limits and optional model grading constrain what reaches a request; citations are evidence links, not a guarantee the answer is correct.

**Memory:** each Agent selects none, short-term or long-term. None prevents memory retrieval and writes for that Agent's run; it does not delete already stored memory. Short-term memory stays in the current plugin session; long-term memory is persisted. Enabled memory can add model or embedding calls. Review the configured retention and memory mode.

**Web search:** configure it under **RAG → Web search**. Backends are Google, Bing, SerpAPI, Tavily, SearXNG, Brave, Qwant and Mojeek. Some require keys or a server endpoint; query heuristics can decide not to search. Availability and third-party access restrictions vary. Older DuckDuckGo/Yahoo/Yandex selections migrate to SearXNG and need a working SearXNG endpoint; they are not current backends.

## Data storage and credentials

The plugin directory is `<vault-config>/plugins/intelligence-assistant/`, usually under `.obsidian`:

- `data.json`: current settings document, including configuration, provider definitions, prompts and Agents; credential values handled by SecretStorage are stripped before persistence.
- `data/conversations/`: saved conversations, including content and execution metadata.
- `data/agent-runs/`: JSONL event journals; inspectable records, not a crash-recovery replay engine.
- Other `data/` subdirectories: model/MCP caches, usage records, memory and RAG index data, according to configuration.
- `data.json.bak`: the previous settings document saved before replacement.

Legacy `config/user/settings.json` and older repository-style settings files are migrated to the current document and removed after successful persistence. Preserve application data when replacing the three plugin binaries during an upgrade.

Obsidian SecretStorage holds provider/API keys, SAP Service Keys, supported Web search credential fields and OpenAPI authentication values; settings keep their secret names. Secret availability on another device is separate from syncing configuration files. CLI/MCP environment settings and other arbitrary configuration fields are not automatically secret-managed. Inspect/redact settings before sharing them.

Prompts, included notes/images, retrieved context and enabled memory can reach the selected model provider. Embedding text reaches the embedding service; Web search receives a query derived from the original input. External tools receive their arguments and may have their own storage, network and filesystem effects. Local conversation/index files are not encrypted by this plugin. Other enabled Obsidian plugins share the host environment.

## Troubleshooting

| Symptom | Check |
|---|---|
| Connection succeeds but no usable model | Provider URL, authentication, discovered/enabled models and required model capability |
| Empty or truncated response | Actual service error/finish reason, output budget, model reasoning use, context size and provider limits |
| A file is missing after a tool call | Whether the result was a pending proposal, an applied result, or an error; inspect the actual path |
| Agent cannot call a tool | Global source state, Agent permissions, exact task restriction and current binding after a source reload |
| Continue repeats or reports uncertain work | Read the trace and artifact state; omitted evidence or uncertain external effects require verification |
| Search fails | Selected backend credentials/endpoint and provider-side restrictions; Qwant's keyless route returned 403 in an earlier audit |
| Need a reproducible bug report | Record plugin/Obsidian version, provider/model, task, steps and redacted logs; exclude secrets and private note contents |
