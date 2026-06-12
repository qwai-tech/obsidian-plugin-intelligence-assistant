import type { App } from 'obsidian';
import { AgentEngineLoop } from '@/application/agents/agent-engine-loop';
import { HistoryCompactor } from '@/application/agents/history-compactor';
import { AgentSenseService } from '@/application/agents/agent-sense-service';
import { WebSearchService } from '@/application/services/web-search-service';
import { InMemoryStateStore } from '@/vendor/agent-engine-core/state';
import { ProviderFactory } from '@/infrastructure/llm/provider-factory';
import { createTestAgent } from '@/test-support/test-utils';
import type { Message } from '@/types/core/conversation';
import type { AgentLoopOptions, AgentLoopCallbacks } from '@/application/agents/types';
import { buildHarnessToolRegistry } from './build-tool-registry';
import { createFakeRagManager } from './fake-rag';
import { DEFAULT_MOCK_LLM_PORT, mockLLM } from './mock-llm-harness';

const MOCK_MODEL = 'mock-model';
const MOCK_BASE_URL = `http://127.0.0.1:${DEFAULT_MOCK_LLM_PORT}/v1`;

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolName: string;
  success: boolean;
  output: string;
}

export interface MissionOutcome {
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  finalMessage?: Message;
  error?: Error;
  /**
   * Number of LLM turns (agent iterations) — the count of streaming chat
   * completion requests the agent actually made to the model. This is the
   * efficiency signal the budget oracle (assertWithinBudget) reasons about.
   * A one-tool trajectory = 2 turns (tool turn + final turn).
   */
  steps: number;
  /** Number of tool invocations the agent made (distinct from agent turns). */
  toolCallCount: number;
}

export interface RunMissionInput {
  app: App;
  userMessage: string;
  autonomousWrite?: boolean;
  enabledTools?: string[];
  timeoutMs?: number;
  toolAccess?: { sources: Record<string, 'all' | string[]> };
  abortAfterToolCalls?: number;
  enableRAG?: boolean;
  ragResults?: import('./fake-rag').FakeRagResult[];
  extraToolSources?: import('@/application/tools/tool-source').ToolSource[];
  maxSteps?: number;
}

/**
 * Stub RAGManager: RAG is disabled for harness missions (enableRAG unset), so
 * AgentSenseService never reaches `query`. The methods below are a safe,
 * empty-result surface in case anything probes readiness.
 */
function stubRagManager(): unknown {
  return {
    isReady: () => false,
    query: async () => [],
    search: async () => [],
    getRelevantContext: async () => '',
  };
}

/**
 * Stub HTTP client for WebSearchService. Web search is disabled for harness
 * missions (enableWebSearch unset), so `search` is never invoked — but the
 * service still needs a client shaped object at construction time.
 */
function stubHttpClient(): unknown {
  return {
    get: async () => ({}),
    post: async () => ({}),
  };
}

export async function runAgentMission(input: RunMissionInput): Promise<MissionOutcome> {
  const { app, userMessage, autonomousWrite = false, enabledTools, timeoutMs = 15_000 } = input;
  const toolRegistry = await buildHarnessToolRegistry(app, enabledTools, input.extraToolSources);
  const ragManager = (input.ragResults ? createFakeRagManager(input.ragResults) : stubRagManager()) as never;

  const loop = new AgentEngineLoop({
    app,
    toolRegistry: toolRegistry as never,
    senseService: new AgentSenseService(app, ragManager),
    historyCompactor: new HistoryCompactor(),
    webSearchService: new WebSearchService({ enabled: false } as never, stubHttpClient() as never),
    ragManager,
    agentRunStateStore: new InMemoryStateStore(),
    createProvider: () => {
      const config = { provider: 'custom' as const, apiKey: 'test-key', baseUrl: MOCK_BASE_URL };
      return { provider: ProviderFactory.createProvider(config as never), providerId: 'custom' };
    },
    defaultModel: MOCK_MODEL,
  });

  const outcome: MissionOutcome = { toolCalls: [], toolResults: [], steps: 0, toolCallCount: 0 };
  const options: AgentLoopOptions = {
    model: MOCK_MODEL,
    mode: 'agent',
    agents: [
      createTestAgent({
        id: 'harness-agent',
        name: 'Harness Agent',
        maxSteps: input.maxSteps ?? 25,
        autonomousWrite,
        // Grant the agent the full builtin tool source so resolveForAgent
        // surfaces every loaded builtin (e.g. read_file) to the LLM request.
        // The builtin source registers under key `${kind}:${id}` = 'builtin:builtin'.
        toolAccess: input.toolAccess ?? { sources: { 'builtin:builtin': 'all' } },
      }),
    ],
    agentId: 'harness-agent',
    enableRAG: input.enableRAG ?? false,
  } as AgentLoopOptions;
  const messages: Message[] = [{ role: 'user', content: userMessage }];

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      outcome.error = outcome.error ?? new Error(`Mission timed out after ${timeoutMs}ms`);
      resolve();
    }, timeoutMs);
    const callbacks: AgentLoopCallbacks = {
      checkAbort:
        input.abortAfterToolCalls === undefined
          ? undefined
          : () => outcome.toolCallCount >= (input.abortAfterToolCalls as number),
      onChunk: () => undefined,
      onToolCall: (toolName, args) => {
        outcome.toolCallCount += 1;
        outcome.toolCalls.push({ toolName, args });
      },
      onToolResult: (toolName, success, output) => {
        outcome.toolResults.push({ toolName, success, output });
      },
      onThought: () => undefined,
      onComplete: (finalMessage) => {
        outcome.finalMessage = finalMessage;
        clearTimeout(timer);
        resolve();
      },
      onError: (error) => {
        outcome.error = error;
        clearTimeout(timer);
        resolve();
      },
    };
    void loop.execute(messages, options, callbacks);
  });

  // Derive the real agent-turn count from the mock call log: count the streaming
  // chat-completion requests the agent actually issued (one per LLM turn). This
  // mirrors the filter the harness tests use. Robust to an empty/absent log.
  try {
    const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
    const calls = await mockLLM.getCalls();
    outcome.steps = calls.filter(
      (c) => c.path === CHAT_COMPLETIONS_PATH && (c.body as { stream?: boolean } | null)?.stream === true,
    ).length;
  } catch {
    // Leave steps at 0 if the call log is unavailable.
  }

  return outcome;
}
