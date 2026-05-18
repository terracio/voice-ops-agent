import type {
  EvidenceChangeSetItem,
  EvidencePolicyResult
} from "../evidence/voiceConsoleStructuredEvidence";

export type CurrentChangeSetBlocker = Pick<
  EvidencePolicyResult,
  "message" | "policyId" | "severity"
>;

export function latestChangeSet(
  changeSets: EvidenceChangeSetItem[]
): EvidenceChangeSetItem | undefined {
  return changeSets.at(-1);
}

export function currentChangeSetBlocker(
  changeSet: EvidenceChangeSetItem | undefined
): CurrentChangeSetBlocker | undefined {
  if (!changeSet || ["committed", "confirmed"].includes(changeSet.status)) {
    return undefined;
  }
  const failed = [...changeSet.policyResults].reverse().find((result) =>
    !result.passed && result.severity !== "info"
  );
  if (failed) return failed;
  const [policyId] = changeSet.blockingPolicyIds;
  return policyId
    ? {
      message: "Current ChangeSet is blocked by policy.",
      policyId,
      severity: "block"
    }
    : undefined;
}
