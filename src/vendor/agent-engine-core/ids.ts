import { randomUUID } from "node:crypto";

export type Clock = {
  now(): string;
};

export type IdGenerator = {
  nextId(): string;
};

export function createDefaultClock(): Clock {
  return {
    now: () => new Date().toISOString()
  };
}

export function createRandomIdGenerator(prefix = "id"): IdGenerator {
  return {
    nextId: () => `${prefix}-${randomUUID()}`
  };
}

export function createIncrementingIdGenerator(prefix = "id"): IdGenerator {
  let next = 1;

  return {
    nextId: () => `${prefix}-${next++}`
  };
}
