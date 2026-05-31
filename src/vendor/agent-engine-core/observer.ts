import type { AgentEvent } from "./contracts";

export type Observer = {
  emit(event: AgentEvent): Promise<void>;
};

function cloneEvent(event: AgentEvent): AgentEvent {
  return structuredClone(event);
}

export class NoopObserver implements Observer {
  async emit(_event: AgentEvent): Promise<void> {
    return Promise.resolve();
  }
}

export class InMemoryObserver implements Observer {
  readonly #events: AgentEvent[] = [];

  get events(): AgentEvent[] {
    return this.#events.map(cloneEvent);
  }

  async emit(event: AgentEvent): Promise<void> {
    this.#events.push(cloneEvent(event));
  }
}

export class ConsoleObserver implements Observer {
  async emit(event: AgentEvent): Promise<void> {
    console.info(JSON.stringify(event));
  }
}
