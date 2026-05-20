import type {
  EvidenceChangeSetItem,
  EvidencePolicyResult
} from "../evidence/voiceConsoleStructuredEvidence";

export type CurrentChangeSetBlocker = Pick<
  EvidencePolicyResult,
  "message" | "policyId" | "severity"
>;

const VISIBLE_CHANGE_SET_STATUSES = ["blocked", "previewed", "draft", "confirmed"];

export function visibleChangeSet(
  changeSets: EvidenceChangeSetItem[]
): EvidenceChangeSetItem | undefined {
  const latestById = new Map<string, EvidenceChangeSetItem>();
  changeSets.forEach((changeSet) => {
    latestById.set(changeSet.changeSetId, changeSet);
  });

  const latest = [...latestById.values()];
  for (const status of VISIBLE_CHANGE_SET_STATUSES) {
    const match = latest.filter((changeSet) => changeSet.status === status).at(-1);
    if (match) return match;
  }
  return latest.at(-1);
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
