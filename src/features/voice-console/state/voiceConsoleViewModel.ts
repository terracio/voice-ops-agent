import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  formatEvidenceStatus,
  type EvidenceToolItem,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import type {
  EvidenceChangeSetDiffItem,
  EvidenceChangeSetItem,
  EvidencePolicyItem
} from "../evidence/voiceConsoleStructuredEvidence";
import { buildVoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import {
  type AgentMode,
  type VoiceConsoleState
} from "./voiceConsoleController";
import { elapsedCallMs } from "./voiceConsoleTiming";
import {
  arrayValue,
  costStatusLabel,
  displayUnknown,
  formatElapsed,
  operationLabel,
  recordValue,
  stringValue,
  titleCase
} from "./voiceConsoleViewModelFormat";

export type LiveCallConnectionState =
  | "ready"
  | "connecting"
  | "connected"
  | "ended"
  | "error";
export type LiveCallTone = "neutral" | "pending" | "success" | "warning" | "error";
export type LiveCallIdentityStatus =
  | "unknown"
  | "pending"
  | "confirmed"
  | "uncertain";

export type LiveCallToolRow = {
  at: string;
  id: string;
  name: string;
  resultLabel: string;
  risk: string;
  status: "queued" | "running" | "completed" | "blocked" | "failed" | "waiting";
};

export type LiveCallSpeechSlot = {
  speaker: "caller" | "agent";
  status: string;
  text: string;
};

export type LiveCallViewModel = {
  actionBanner: { detail: string; label: string; tone: LiveCallTone };
  agentAudioStatus: "ready" | "listening" | "thinking" | "speaking" | "tooling";
  changeSet?: {
    changeSetId: string;
    confirmationRequired: boolean;
    diffRows: { after: string; before: string; field: string }[];
    operationLabel: string;
    stateVersionLabel: string;
    statusLabel: string;
  };
  connection: {
    label: string;
    state: LiveCallConnectionState;
    tone: LiveCallTone;
  };
  cost: { label: string; status: string };
  customer: {
    detail: string;
    identityStatus: LiveCallIdentityStatus;
    name?: string;
    plan?: string;
    riskFlags: string[];
    summaryLabel: string;
  };
  elapsedLabel: string;
  policy: { detail: string; label: string; tone: LiveCallTone };
  speech: {
    agent: LiveCallSpeechSlot;
    caller: LiveCallSpeechSlot;
    timeline: { at: string; id: string; speaker: "caller" | "agent"; text: string }[];
  };
  tools: LiveCallToolRow[];
};

export function buildLiveCallViewModel(options: {
  evidence?: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
}): LiveCallViewModel {
  const evidence = options.evidence ?? EMPTY_VOICE_CONSOLE_EVIDENCE;
  const transcript = buildVoiceTranscriptState(evidence.transcript);
  const connection = connectionState(options.state);
  const tools = evidence.tools.map(toToolRow);
  const customer = customerSummary(evidence, options.state);
  const changeSet = changeSetSummary(evidence.changeSets ?? [], evidence.diffs ?? []);
  const policy = policySummary(evidence.policies ?? [], customer.identityStatus, changeSet);

  return {
    actionBanner: actionBanner(options.state, tools, customer.identityStatus, policy),
    agentAudioStatus: agentAudioStatus(options.state.agentMode),
    changeSet,
    connection,
    cost: costSummary(evidence),
    customer,
    elapsedLabel: formatElapsed(elapsedCallMs(options.state.callTiming)),
    policy,
    speech: {
      agent: {
        speaker: "agent",
        status: agentSpeechStatus(options.state.agentMode),
        text: transcript.currentAgentText
      },
      caller: {
        speaker: "caller",
        status: callerSpeechStatus(options.state),
        text: transcript.currentCallerText
      },
      timeline: transcript.history.flatMap((turn) =>
        turn.actor === "system"
          ? []
          : [{
            at: turn.at,
            id: turn.id,
            speaker: turn.actor === "assistant" ? "agent" : "caller",
            text: turn.text
          }]
      )
    },
    tools
  };
}

function connectionState(state: VoiceConsoleState): LiveCallViewModel["connection"] {
  const error = state.events.find((event) => event.tone === "error");
  if (error) return { label: "Error", state: "error", tone: "error" };
  if (state.sessionStatus === "connecting") {
    return { label: "Connecting", state: "connecting", tone: "pending" };
  }
  if (state.sessionStatus === "connected") {
    return { label: "Connected", state: "connected", tone: "success" };
  }
  if (state.callTiming.endedAtMs) {
    return { label: "Ended", state: "ended", tone: "neutral" };
  }
  return { label: "Ready", state: "ready", tone: "neutral" };
}

function costSummary(evidence: VoiceConsoleEvidenceState) {
  const cost = evidence.cost;
  if (!cost) return { label: "$0.00", status: "No usage yet" };
  if (cost.totalLabel) return { label: cost.totalLabel, status: costStatusLabel(cost.estimateStatus) };
  return { label: "Unavailable", status: cost.unavailableReasons[0] ?? "Cost unavailable" };
}

function customerSummary(
  evidence: VoiceConsoleEvidenceState,
  state: VoiceConsoleState
): LiveCallViewModel["customer"] {
  const confirmed = latestToolData(evidence.tools, "confirm_customer_identity");
  const stateRead = latestToolData(evidence.tools, "get_customer_state");
  const lookup = latestToolData(evidence.tools, "lookup_customer");
  const payment = latestToolData(evidence.tools, "get_payment_status");
  const customer = recordValue(recordValue(stateRead, "customer"));
  const plan = recordValue(recordValue(stateRead, "plan"));

  if (confirmed) {
    const name = stringValue(confirmed.name) ?? stringValue(customer?.name);
    return {
      detail: stringValue(confirmed.customer_id) ?? stringValue(customer?.customer_id) ?? "Confirmed customer",
      identityStatus: "confirmed",
      name,
      plan: stringValue(plan?.plan_name),
      riskFlags: riskFlags(customer, payment),
      summaryLabel: name ? `Confirmed: ${name}` : "Identity confirmed"
    };
  }

  const candidates = arrayValue(lookup?.candidates);
  const candidate = recordValue(candidates[0]);
  if (candidate) {
    const name = stringValue(candidate.name);
    return {
      detail: "Lookup candidate requires explicit caller confirmation.",
      identityStatus: "pending",
      name,
      riskFlags: ["Private reads blocked", "Writes blocked"],
      summaryLabel: name ? `Pending confirmation: ${name}` : "Pending confirmation"
    };
  }

  if (stringValue(lookup?.identity_status) === "uncertain") {
    return {
      detail: "Clarify identity before private reads or writes.",
      identityStatus: "uncertain",
      riskFlags: ["Private reads blocked", "Writes blocked"],
      summaryLabel: "Identity uncertain"
    };
  }

  return {
    detail: state.customerContext,
    identityStatus: "unknown",
    riskFlags: ["Private reads blocked", "Writes blocked"],
    summaryLabel: "No customer identified"
  };
}

function changeSetSummary(
  changeSets: EvidenceChangeSetItem[],
  diffs: EvidenceChangeSetDiffItem[]
): LiveCallViewModel["changeSet"] | undefined {
  const changeSet = latestChangeSet(changeSets);
  if (!changeSet) return undefined;
  const relatedDiffs = diffs.filter((diff) => diff.changeSetId === changeSet.changeSetId);
  return {
    changeSetId: changeSet.changeSetId,
    confirmationRequired: ["draft", "previewed", "blocked"].includes(changeSet.status),
    diffRows: relatedDiffs.map((diff) => ({
      after: displayUnknown(diff.after),
      before: displayUnknown(diff.before),
      field: diff.field
    })),
    operationLabel: operationLabel(changeSet.operations[0]),
    stateVersionLabel: changeSet.expectedStateVersion === undefined
      ? "State version unavailable"
      : `State v${changeSet.expectedStateVersion}`,
    statusLabel: titleCase(changeSet.status)
  };
}

function policySummary(
  policies: EvidencePolicyItem[],
  identityStatus: LiveCallIdentityStatus,
  changeSet: LiveCallViewModel["changeSet"]
): LiveCallViewModel["policy"] {
  const blocked = [...policies].reverse().find((policy) => !policy.result.passed);
  if (blocked) {
    return {
      detail: blocked.result.message,
      label: `Blocked by ${blocked.policyId}`,
      tone: blocked.result.severity === "escalate" ? "error" : "warning"
    };
  }
  if (identityStatus !== "confirmed") {
    return {
      detail: "Private reads and writes require confirmed identity.",
      label: "Identity policy active",
      tone: "pending"
    };
  }
  if (changeSet?.confirmationRequired) {
    return {
      detail: "Commit remains blocked until explicit confirmation is captured server-side.",
      label: "Confirmation required",
      tone: "pending"
    };
  }
  return { detail: "No deterministic policy blockers in current evidence.", label: "Policies passed", tone: "success" };
}

function actionBanner(
  state: VoiceConsoleState,
  tools: LiveCallToolRow[],
  identityStatus: LiveCallIdentityStatus,
  policy: LiveCallViewModel["policy"]
): LiveCallViewModel["actionBanner"] {
  const activeTool = [...tools].reverse().find((tool) => tool.status === "running");
  if (policy.tone === "error" || policy.tone === "warning") return policy;
  if (activeTool) return { detail: activeTool.resultLabel, label: `Running ${activeTool.name}`, tone: "pending" };
  if (state.agentMode === "waiting-for-confirmation") {
    return { detail: "Server must capture explicit caller confirmation before commit.", label: "Waiting for confirmation", tone: "pending" };
  }
  if (identityStatus !== "confirmed") return { detail: "Ask for customer ID, phone, or name, then confirm identity.", label: "Waiting for identifier", tone: "pending" };
  return { detail: "Agent can handle authorized read or preview work.", label: "Ready for next action", tone: "success" };
}

function toToolRow(item: EvidenceToolItem): LiveCallToolRow {
  return {
    at: item.at,
    id: item.id,
    name: item.name,
    resultLabel: item.summary ?? formatEvidenceStatus(item.status),
    risk: item.risk,
    status: toolStatus(item.status)
  };
}

function latestToolData(tools: EvidenceToolItem[], toolName: string): Record<string, unknown> | undefined {
  const tool = [...tools].reverse().find((item) => item.name === toolName && item.status === "ok");
  return recordValue(recordValue(tool?.outputData, "data"));
}

function riskFlags(customer?: Record<string, unknown>, payment?: Record<string, unknown>): string[] {
  const flags: string[] = [];
  if (arrayValue(customer?.allergies).length > 0) flags.push("Allergy risk");
  const paymentStatus = stringValue(payment?.payment_status);
  if (paymentStatus === "failed" || paymentStatus === "past_due") flags.push(`Payment ${paymentStatus.replace("_", " ")}`);
  return flags;
}

function latestChangeSet(changeSets: EvidenceChangeSetItem[]) {
  return [...changeSets].reverse().find((changeSet) =>
    ["draft", "previewed", "confirmed", "blocked"].includes(changeSet.status)
  ) ?? changeSets.at(-1);
}

function agentAudioStatus(mode: AgentMode): LiveCallViewModel["agentAudioStatus"] {
  if (mode === "listening") return "listening";
  if (mode === "speaking") return "speaking";
  if (mode === "tool-running") return "tooling";
  if (mode === "waiting-for-confirmation") return "thinking";
  return "ready";
}

function agentSpeechStatus(mode: AgentMode): string {
  if (mode === "speaking") return "speaking";
  if (mode === "tool-running") return "tooling";
  if (mode === "waiting-for-confirmation") return "waiting";
  return mode === "listening" ? "listening" : "ready";
}

function callerSpeechStatus(state: VoiceConsoleState): string {
  if (state.sessionStatus !== "connected") return "unavailable";
  return state.isMuted ? "muted" : "idle";
}

function toolStatus(status: EvidenceToolItem["status"]): LiveCallToolRow["status"] {
  if (status === "started") return "running";
  if (status === "ok") return "completed";
  if (status === "blocked") return "blocked";
  return "failed";
}
