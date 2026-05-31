# AgentEngine core vendor snapshot

This directory vendors `@agent-engine/core` until the upstream package is formally published and adopted as a normal dependency.

- Source: `/Users/chengqing/Projects/github/agent-kernel/packages/core/src`
- Upstream commit: `76b1186477be7d7e08b0972d0c72ebd6da8dabc9`
- Package version: `0.1.0`
- Runtime dependency mirrored in this repo: `ajv`
- Local adjustment: relative `.js` import/export specifiers were normalized so `ts-jest` can resolve the vendored TypeScript sources.
- Local adjustment: `Array.prototype.at()` calls were replaced with ES2020-compatible index access for the plugin build target.

Application code should not import this directory directly. Import through:

```ts
import { createAgentEngine } from '@/application/agents/kernel/agent-engine-core';
```

When the upstream package is available, replace the shim export with:

```ts
export * from '@agent-engine/core';
```
