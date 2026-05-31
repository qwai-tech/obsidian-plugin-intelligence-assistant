import type { ApprovalRequest, HostContext, Principal } from "./contracts";

export type ApprovalSubmission = {
  runId: string;
  request: ApprovalRequest;
  host: HostContext;
};

export type ApprovalResolution = {
  approvalId: string;
  decision: "approved" | "rejected";
  approver: Principal;
  reason?: string;
  resolvedAt: string;
};

export type PendingApproval = ApprovalSubmission & {
  submittedAt: string;
};

export type ApprovalProvider = {
  submit(input: ApprovalSubmission): Promise<void>;
};

export type ApprovalStore = ApprovalProvider & {
  pending(approvalId: string): Promise<PendingApproval | undefined>;
  resolve(input: ApprovalResolution): Promise<void>;
  resolution(approvalId: string): Promise<ApprovalResolution | undefined>;
};

export type InMemoryApprovalStoreOptions = {
  clock?: () => string;
};

export class InMemoryApprovalStore implements ApprovalStore {
  readonly #clock: () => string;
  readonly #pending = new Map<string, PendingApproval>();
  readonly #resolutions = new Map<string, ApprovalResolution>();

  constructor(options: InMemoryApprovalStoreOptions = {}) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  async submit(input: ApprovalSubmission): Promise<void> {
    this.#pending.set(input.request.id, {
      runId: input.runId,
      request: structuredClone(input.request),
      host: structuredClone(input.host),
      submittedAt: this.#clock()
    });
  }

  async pending(approvalId: string): Promise<PendingApproval | undefined> {
    const pending = this.#pending.get(approvalId);
    return pending === undefined ? undefined : structuredClone(pending);
  }

  async resolve(input: ApprovalResolution): Promise<void> {
    this.#pending.delete(input.approvalId);
    this.#resolutions.set(input.approvalId, structuredClone(input));
  }

  async resolution(approvalId: string): Promise<ApprovalResolution | undefined> {
    const resolution = this.#resolutions.get(approvalId);
    return resolution === undefined ? undefined : structuredClone(resolution);
  }
}
