/**
 * Capability -> mission file map. The meta-test asserts every listed mission
 * file exists. Adding a capability without a mission (or renaming a mission
 * file) turns CI red — completeness is enforced, not assumed.
 */
export const COVERAGE_MANIFEST: Record<string, string> = {
  'read+autonomous-write': 'tests/missions/agent/m1-read-write.mission.test.ts',
  'large-multi-step-task': 'tests/missions/agent/m4-batch-rewrite.mission.test.ts',
  'permission-isolation': 'tests/missions/agent/m5-permission-isolation.mission.test.ts',
  'max-steps-budget': 'tests/missions/agent/m6-max-steps.mission.test.ts',
  'tool-error-recovery': 'tests/missions/agent/m7-tool-error-recovery.mission.test.ts',
  'stop-abort': 'tests/missions/agent/m8-stop.mission.test.ts',
  'rag-injection': 'tests/missions/agent/m2-rag-injection.mission.test.ts',
  'non-builtin-tool-source': 'tests/missions/agent/m-ext-tool-source.mission.test.ts',
};
