# @qwai/obsidian-llm

Multi-provider LLM client for Obsidian plugins — plus a hub contract so plugins
can share one provider configuration instead of each shipping their own.

Providers: OpenAI (and any OpenAI-compatible gateway), Anthropic, Google, SAP AI Core,
DeepSeek, OpenRouter, Ollama.

## Two problems, two mechanisms

Most Obsidian plugins that talk to an LLM re-implement the same three things:
a provider list, a settings tab, and a copy of the user's API keys. Sharing code
fixes the first two. It does **not** fix the third — bundles are per-plugin, so
the user still types the same key into every plugin they install.

So this package ships both:

| Problem | Mechanism |
| --- | --- |
| Every plugin re-writes provider clients, SSE parsing, CORS fallback | Bundle this package |
| The user enters the same API key in every plugin | Discover a **hub** at runtime |

## 1. Using it as a client

Register a transport once at startup, then create providers:

```ts
import {
  setDefaultHttpPort,
  createObsidianHttpPort,
  setDiagnosticsSink,
  ProviderFactory,
} from '@qwai/obsidian-llm';
import { Notice } from 'obsidian';

async onload() {
  setDefaultHttpPort(createObsidianHttpPort());
  setDiagnosticsSink(({ message }) => { new Notice(message); });

  const provider = ProviderFactory.createProvider({
    provider: 'openai',
    apiKey: '…',
  });

  await provider.streamChat(
    { model: 'openai:gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
    chunk => { if (chunk.content) console.log(chunk.content); },
  );
}
```

### Why a transport has to be injected

Obsidian needs **two** transports and neither does both jobs:

- `requestUrl` runs in the main process, so it bypasses browser CORS — which many
  OpenAI-compatible gateways require, since they send no CORS headers. But it
  buffers the whole response.
- `fetch` is the only way to get a live `ReadableStream` for token-by-token SSE,
  but a renderer-side request to a CORS-less endpoint is blocked outright.

`createObsidianHttpPort()` wires both up and translates a blocked request into
`StreamTransportUnavailableError`, which makes the providers fall back to a
buffered request for the same SSE endpoint. It validates the real event stream,
including finish reasons and trailing usage, and coalesces delivery to the caller.
It does not convert a streaming request into a non-stream JSON completion.
The providers contain no environment-specific transport code; pass
`createFetchHttpPort()` in Node.

## 2. Using a hub (shared configuration)

If a hub plugin is installed, use the user's existing providers and keys:

```ts
import { resolveLLM, describeResolveFailure } from '@qwai/obsidian-llm';

const result = resolveLLM(this.app, {
  pluginIds: ['intelligence-assistant'],
});

if (result.ok) {
  const provider = await result.hub.getProvider('openai:gpt-4o');
  // …use it; no key was ever handed over
} else {
  console.info(describeResolveFailure(result)); // fall back to own settings
}
```

Failure is a normal result, never an exception. Obsidian cannot express "this
plugin depends on that one": the hub may be uninstalled, disabled, loaded after
you, or a version you don't understand. `resolveLLM` returns a tagged result so
you degrade to your own configuration instead of crashing.

### The security rule

**A hub lends capability, never credentials.**

Obsidian has no permission model — anything a plugin exposes is reachable by
every other enabled plugin, including ones the user doesn't trust. So `LLMHub`
has no method that returns an `LLMConfig` or an `apiKey`.
ProviderFactory returns a frozen closure-backed `ILLMProvider` facade: callers
can use its operations, but the returned object exposes neither credentials nor
the raw transport/configuration. This is API encapsulation. It does not isolate
a plugin from other plugins in Obsidian's shared host, where revealed settings
and arbitrary host objects may already be reachable.

If you implement `LLMHub`, keep that invariant — and note that TypeScript's
`private` will not enforce it, since it is erased at compile time. Use a `#`
field or a closure for anything holding credentials.

## Message types

Providers speak `LLMMessage` — `role`, `content`, optional attachments, and the
few fields that actually reach the wire. That is deliberately narrower than a
typical app's message model (RAG sources, agent traces, rendering hints), because
a reusable provider can't depend on your domain types. A richer host type stays
structurally assignable, so you can pass your own messages straight through:

```ts
interface ChatRequest extends Omit<WireChatRequest, 'messages'> {
  messages: MyRichMessage[];
}
```

## Incomplete output and real verification

A provider-reported output limit or content filter rejects with `CompletionError`.
Its `usage`, `partialContent` and `partialReasoning` preserve genuine service
results; failed streams never emit a successful final chunk. Output budgets may
include reasoning, so a small `maxTokens` does not guarantee visible prose.
The client does not silently increase that budget, retry, or disable thinking.
An explicitly supplied `thinking: { type: "disabled" }` is forwarded by the
OpenAI-compatible adapter when the selected service supports it.

`tests/real/long-output-investigation.mjs` compares actual HTTP SSE with the
production provider and buffered-SSE stage. Set `IA_REAL_API_KEY` outside the
repository, `IA_REAL_BASE_URL`, `IA_REAL_MODEL`, `IA_LONG_MAX_TOKENS`, and
`IA_REAL_RESULTS`. Optional `IA_LONG_MODES=direct,plugin,buffered` selects paths;
`IA_EXPECT_LONG_COMPLETE=1` requires a final marker and at least 900 words.
`IA_LONG_THINKING=disabled` changes only that explicit experiment. The regression
long-prose test uses a 16,384-token test budget by default, separately configurable
with `IA_REAL_LONG_MAX_TOKENS`; application defaults are unchanged.

## License

MIT
