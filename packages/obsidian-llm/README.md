# @qwai/obsidian-llm

Multi-provider LLM client for Obsidian plugins — plus a hub contract so plugins
can share one provider configuration instead of each shipping their own.

Providers: OpenAI (and any OpenAI-compatible gateway), Anthropic, Google,
DeepSeek, OpenRouter, Ollama, SAP AI Core.

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
buffered non-streaming request and synthesise the chunks. Because that lives
behind an interface, the providers themselves contain no environment-specific
code — pass `createFetchHttpPort()` in Node or a fake in tests.

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
has no method that returns an `LLMConfig`, an `apiKey`, or a `serviceKey`.
Callers get an `ILLMProvider`: they can spend the user's quota (unavoidable, and
consented to by installing the plugin) but cannot walk off with the key.

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

## License

MIT
