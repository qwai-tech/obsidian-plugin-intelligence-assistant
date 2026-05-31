import type { JsonValue } from "./contracts";

export type AgentKernelErrorCode =
  | "INVALID_ACTION"
  | "POLICY_DENIED"
  | "TOOL_NOT_FOUND"
  | "SCHEMA_VALIDATION_FAILED"
  | "STATE_VERSION_CONFLICT"
  | "STATE_LOCK_TIMEOUT"
  | "RUN_NOT_FOUND"
  | "RUN_CONTEXT_MISMATCH";

export class AgentKernelError extends Error {
  public readonly code: AgentKernelErrorCode;
  public readonly details?: JsonValue;

  constructor(code: AgentKernelErrorCode, message: string, details?: JsonValue) {
    super(message);
    this.name = "AgentKernelError";
    this.code = code;
    this.details = details;
  }
}
