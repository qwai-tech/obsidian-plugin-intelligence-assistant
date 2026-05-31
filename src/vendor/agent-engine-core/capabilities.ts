import type {
  CapabilityDescriptor,
  CapabilityRequirement,
  HostContext
} from "./contracts";

export type CapabilityQuery = {
  id?: string;
  kind?: string;
  version?: string;
};

export type CapabilityRegistry = {
  register(descriptor: CapabilityDescriptor): void;
  get(query: Required<CapabilityQuery>): CapabilityDescriptor | undefined;
  describe(query?: CapabilityQuery): CapabilityDescriptor[];
  resolve(input: CapabilityResolveInput): CapabilityResolveResult;
};

export type CapabilityResolveInput = {
  ids: string[];
  host?: HostContext;
};

export type CapabilityDenial = {
  id: string;
  reason: string;
};

export type CapabilityResolveResult = {
  capabilities: CapabilityDescriptor[];
  missing: string[];
  denied: CapabilityDenial[];
};

export class InMemoryCapabilityRegistry implements CapabilityRegistry {
  readonly #descriptors = new Map<string, CapabilityDescriptor>();

  register(descriptor: CapabilityDescriptor): void {
    this.#descriptors.set(capabilityKey(descriptor), cloneCapability(descriptor));
  }

  get(query: Required<CapabilityQuery>): CapabilityDescriptor | undefined {
    const descriptor = this.#descriptors.get(
      capabilityKey({
        id: query.id,
        kind: query.kind,
        version: query.version
      })
    );

    return descriptor ? cloneCapability(descriptor) : undefined;
  }

  describe(query: CapabilityQuery = {}): CapabilityDescriptor[] {
    return [...this.#descriptors.values()]
      .filter((descriptor) => query.id === undefined || descriptor.id === query.id)
      .filter((descriptor) => query.kind === undefined || descriptor.kind === query.kind)
      .filter(
        (descriptor) => query.version === undefined || descriptor.version === query.version
      )
      .map(cloneCapability);
  }

  resolve(input: CapabilityResolveInput): CapabilityResolveResult {
    const capabilities: CapabilityDescriptor[] = [];
    const missing: string[] = [];
    const denied: CapabilityDenial[] = [];
    const seen = new Set<string>();

    const visit = (requirement: CapabilityRequirement) => {
      const descriptor = this.#select(requirement);
      if (descriptor === undefined) {
        missing.push(requirement.version ? `${requirement.id}@${requirement.version}` : requirement.id);
        return;
      }

      const key = capabilityKey(descriptor);
      if (seen.has(key)) {
        return;
      }

      const denial = denialFor(descriptor, input.host);
      if (denial !== undefined) {
        denied.push(denial);
        return;
      }

      seen.add(key);
      capabilities.push(cloneCapability(descriptor));
      for (const dependency of descriptor.dependencies ?? []) {
        visit(dependency);
      }
    };

    for (const id of input.ids) {
      visit(parseCapabilityReference(id));
    }

    return { capabilities, missing, denied };
  }

  #select(requirement: CapabilityRequirement): CapabilityDescriptor | undefined {
    const candidates = [...this.#descriptors.values()]
      .filter((descriptor) => descriptor.id === requirement.id)
      .filter(
        (descriptor) => requirement.kind === undefined || descriptor.kind === requirement.kind
      )
      .filter(
        (descriptor) =>
          requirement.version === undefined || descriptor.version === requirement.version
      )
      .sort((a, b) => compareVersions(b.version, a.version));

    return candidates[0];
  }
}

function capabilityKey(
  descriptor: Pick<CapabilityDescriptor, "id" | "kind" | "version">
): string {
  return `${descriptor.kind}:${descriptor.id}@${descriptor.version}`;
}

function cloneCapability(descriptor: CapabilityDescriptor): CapabilityDescriptor {
  return structuredClone(descriptor);
}

function parseCapabilityReference(reference: string): CapabilityRequirement {
  const at = reference.lastIndexOf("@");
  if (at <= 0) {
    return { id: reference };
  }

  return {
    id: reference.slice(0, at),
    version: reference.slice(at + 1)
  };
}

function denialFor(
  descriptor: CapabilityDescriptor,
  host: HostContext | undefined
): CapabilityDenial | undefined {
  for (const credential of descriptor.requiredCredentials) {
    if (!host?.credentialRefs?.some((item) => item.id === credential.id)) {
      return {
        id: descriptor.id,
        reason: `missing_required_credential:${credential.id}`
      };
    }
  }

  for (const kind of descriptor.requiredEnvironmentKinds ?? []) {
    if (host?.environment?.kind !== kind) {
      return {
        id: descriptor.id,
        reason: `missing_required_environment:${kind}`
      };
    }
  }

  return undefined;
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return left.localeCompare(right);
}

function versionParts(version: string): number[] {
  return version.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}
