import { EMPTY_VOICE_CONSOLE_EVIDENCE, type EvidenceToolItem, type VoiceConsoleEvidenceState } from "../evidence/voiceConsoleEvidence";
import { buildVoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import type { EvidenceChangeSetDiffItem } from "../evidence/voiceConsoleStructuredEvidence";
import { latestChangeSet, currentChangeSetBlocker } from "../state/voiceConsoleChangeSetStatus";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import { elapsedCallMs } from "../state/voiceConsoleTiming";
import { buildConversationTimelineModel } from "../state/voiceConversationTimeline";
import { displayUnknown, formatElapsed, recordValue, stringValue } from "../state/voiceConsoleViewModelFormat";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "ended" | "error";
export type CallControlAction = "call" | "hang_up" | "mute" | "unmute" | "reset";
export interface LiveCallViewModel {
  connection: {
    status: ConnectionStatus;
    isMuted: boolean;
  };
  elapsedLabel: string;
  cost: {
    isAvailable: boolean;
    label: string;
  };
  agentAudioStatus: {
    callerState: "idle" | "speaking" | "muted" | "unavailable";
    agentState: "ready" | "listening" | "thinking" | "speaking" | "tooling";
    callerPhone?: string;
  };
  speech: {
    caller: { status: "live" | "idle"; text: string };
    agent: { status: "live" | "idle"; text: string };
  };
  timeline: {
    callerSegments: Array<{ startPct: number; widthPct: number }>;
    agentSegments: Array<{ startPct: number; widthPct: number }>;
  };
  actionBanner: {
    type: "waiting" | "running" | "blocked" | "escalated" | "ready";
    title: string;
    description: string;
    label?: string;
  };
  customer: {
    status: "unknown" | "pending" | "confirmed" | "uncertain";
    name?: string;
    id?: string;
    plan?: string;
    riskFlags?: Array<{ label: string; status: "good" | "warning" | "error" }>;
  };
  changeSet: {
    isActive: boolean;
    operationType?: string;
    date?: string;
    beforeState?: string;
    afterState?: string;
    changeSetId?: string;
    stateVersion?: string;
    requiresConfirmation?: boolean;
  } | null;
  tools: Array<{
    id: string;
    name: string;
    policyId?: string;
    risk?: string;
    status: "queued" | "running" | "completed" | "blocked" | "failed" | "waiting";
    summary?: string;
    elapsedTime?: string;
  }>;
  policy: {
    statusText: string;
    subText?: string;
  };
}
export function buildPrototypeLiveCallViewModel(options: {
  evidence?: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
}): LiveCallViewModel {
  const evidence = options.evidence ?? EMPTY_VOICE_CONSOLE_EVIDENCE;
  const elapsedMs = elapsedCallMs(options.state.callTiming);
  const transcript = buildVoiceTranscriptState(evidence.transcript);
  const changeSet = latestChangeSet(evidence.changeSets ?? []);
  const diffs = (evidence.diffs ?? []).filter((diff) =>
    diff.changeSetId === changeSet?.changeSetId
  );
  const customer = customerSummary(evidence, options.state.customerContext);

  return {
    actionBanner: actionBanner(options.state, evidence, changeSet !== undefined, customer.status),
    agentAudioStatus: audioStatus(options.state, evidence),
    changeSet: changeSet ? changeSetPreview(changeSet, diffs) : null,
    connection: {
      status: connectionStatus(options.state),
      isMuted: options.state.sessionStatus === "connected" && options.state.isMuted
    },
    cost: costSummary(evidence),
    customer,
    elapsedLabel: formatElapsed(elapsedMs),
    policy: policySummary(evidence, changeSet !== undefined, customer.status),
    speech: {
      agent: {
        status: options.state.sessionStatus === "connected" ? "live" : "idle",
        text: transcript.currentAgentText
      },
      caller: {
        status: options.state.sessionStatus === "connected" ? "live" : "idle",
        text: transcript.currentCallerText
      }
    },
    timeline: timelineSummary(options.state, transcript.history, elapsedMs),
    tools: evidence.tools.map(toolRow)
  };
}

function connectionStatus(state: VoiceConsoleState): ConnectionStatus {
  if (currentRealtimeError(state)) return "error";
  if (state.sessionStatus === "connecting") return "connecting";
  if (state.sessionStatus === "connected") return "connected";
  return state.callTiming.endedAtMs ? "ended" : "disconnected";
}

function currentRealtimeError(state: VoiceConsoleState): VoiceConsoleState["events"][number] | undefined {
  return state.events[0]?.tone === "error" ? state.events[0] : undefined;
}
function costSummary(evidence: VoiceConsoleEvidenceState): LiveCallViewModel["cost"] {
  const total = evidence.cost?.totalUsd;
  return {
    isAvailable: evidence.cost?.estimateStatus !== "unavailable" && total !== undefined,
    label: evidence.cost?.totalLabel ?? (typeof total === "number" ? `$${total.toFixed(2)}` : "--")
  };
}
function audioStatus(
  state: VoiceConsoleState,
  evidence: VoiceConsoleEvidenceState
): LiveCallViewModel["agentAudioStatus"] {
  return {
    agentState: agentState(state.agentMode),
    callerPhone: callerPhone(evidence),
    callerState: callerState(state)
  };
}
function callerState(state: VoiceConsoleState): LiveCallViewModel["agentAudioStatus"]["callerState"] {
  if (state.sessionStatus !== "connected") return "unavailable";
  return state.isMuted ? "muted" : "speaking";
}
function agentState(mode: VoiceConsoleState["agentMode"]): LiveCallViewModel["agentAudioStatus"]["agentState"] {
  if (mode === "listening") return "listening";
  if (mode === "speaking") return "speaking";
  if (mode === "tool-running") return "tooling";
  if (mode === "waiting-for-confirmation") return "thinking";
  return "ready";
}
function callerPhone(evidence: VoiceConsoleEvidenceState): string | undefined {
  const lookup = latestToolData(evidence.tools, "lookup_customer");
  const candidates = Array.isArray(lookup?.candidates) ? lookup.candidates : [];
  const candidate = recordValue(candidates[0]);
  const last4 = stringValue(candidate?.phone_last4);
  return last4 ? `Phone ending ${last4}` : undefined;
}
function customerSummary(
  evidence: VoiceConsoleEvidenceState,
  fallback: string
): LiveCallViewModel["customer"] {
  const confirmed = latestToolData(evidence.tools, "confirm_customer_identity");
  const stateRead = latestToolData(evidence.tools, "get_customer_state");
  const lookup = latestToolData(evidence.tools, "lookup_customer");
  const customer = recordValue(stateRead?.customer);
  const plan = recordValue(stateRead?.plan);

  if (confirmed) {
    return {
      id: stringValue(confirmed.customer_id) ?? stringValue(customer?.customer_id),
      name: stringValue(confirmed.name) ?? stringValue(customer?.name),
      plan: stringValue(plan?.plan_name),
      riskFlags: riskFlags(customer, latestToolData(evidence.tools, "get_payment_status")),
      status: "confirmed"
    };
  }

  const candidate = recordValue(Array.isArray(lookup?.candidates) ? lookup.candidates[0] : undefined);
  if (candidate) {
    return {
      name: stringValue(candidate.name),
      riskFlags: [{ label: "Writes", status: "warning" }],
      status: lookup?.identity_status === "uncertain" ? "uncertain" : "pending"
    };
  }

  return { name: fallback, status: "unknown" };
}
function riskFlags(
  customer?: Record<string, unknown>,
  payment?: Record<string, unknown>
): Array<{ label: string; status: "good" | "warning" | "error" }> {
  const flags: Array<{ label: string; status: "good" | "warning" | "error" }> = [];
  if (Array.isArray(customer?.allergies) && customer.allergies.length > 0) {
    flags.push({ label: "Allergy", status: "warning" });
  }
  const paymentStatus = stringValue(payment?.payment_status);
  if (paymentStatus === "failed" || paymentStatus === "past_due") {
    flags.push({ label: "Payment", status: "error" });
  }
  return flags;
}
function timelineSummary(
  state: VoiceConsoleState,
  turns: ReturnType<typeof buildVoiceTranscriptState>["history"],
  elapsedMs: number
): LiveCallViewModel["timeline"] {
  const timeline = buildConversationTimelineModel({
    callStartedAtMs: state.callTiming.startedAtMs,
    elapsedMs,
    turns
  });
  const duration = Math.max(timeline.durationMs, 1);
  return {
    agentSegments: toPercentSegments(timeline.lanes.find((lane) => lane.actor === "agent")?.segments ?? [], duration),
    callerSegments: toPercentSegments(timeline.lanes.find((lane) => lane.actor === "caller")?.segments ?? [], duration)
  };
}
function toPercentSegments(
  segments: Array<{ endOffsetMs: number; startOffsetMs: number }>,
  duration: number
) {
  return segments.map((segment) => ({
    startPct: Math.min(99, Math.max(0, (segment.startOffsetMs / duration) * 100)),
    widthPct: Math.min(100, Math.max(2, ((segment.endOffsetMs - segment.startOffsetMs) / duration) * 100))
  }));
}
function changeSetPreview(
  changeSet: NonNullable<VoiceConsoleEvidenceState["changeSets"]>[number],
  diffs: EvidenceChangeSetDiffItem[]
): NonNullable<LiveCallViewModel["changeSet"]> {
  const operation = recordValue(changeSet.operations[0]);
  const diff = diffs[0];
  const expected = changeSet.expectedStateVersion;
  return {
    afterState: afterState(operation, diff),
    beforeState: beforeState(operation, diff),
    changeSetId: changeSet.changeSetId,
    date: operationDate(operation, diff),
    isActive: ["draft", "previewed", "blocked"].includes(changeSet.status),
    operationType: operationType(operation),
    requiresConfirmation: ["draft", "previewed", "blocked"].includes(changeSet.status),
    stateVersion: expected === undefined
      ? changeSet.status
      : `${expected} -> ${expected + 1}${changeSet.status === "previewed" ? " pending" : ""}`
  };
}

function operationType(operation?: Record<string, unknown>): string {
  const type = stringValue(operation?.type);
  if (type === "pause_dates") return "Pause delivery";
  if (type === "resume_dates") return "Resume delivery";
  if (type === "create_payment_followup") return "Create payment follow-up";
  if (type === "update_customization") return "Update customization";
  return "Change pending";
}

function operationDate(
  operation?: Record<string, unknown>,
  diff?: EvidenceChangeSetDiffItem
): string | undefined {
  const dates = Array.isArray(operation?.dates) ? operation.dates : [];
  const [date] = dates.flatMap((value) => typeof value === "string" ? [value] : []);
  return date ?? (diff?.field.includes("date") ? displayUnknown(diff.after) : undefined);
}

function beforeState(operation?: Record<string, unknown>, diff?: EvidenceChangeSetDiffItem): string | undefined {
  if (operation?.type === "pause_dates") return "active";
  if (operation?.type === "resume_dates") return "paused";
  return diff ? displayUnknown(diff.before) : undefined;
}

function afterState(operation?: Record<string, unknown>, diff?: EvidenceChangeSetDiffItem): string | undefined {
  if (operation?.type === "pause_dates") return "paused";
  if (operation?.type === "resume_dates") return "active";
  return diff ? displayUnknown(diff.after) : undefined;
}

function actionBanner(
  state: VoiceConsoleState,
  evidence: VoiceConsoleEvidenceState,
  hasChangeSet: boolean,
  customerStatus: LiveCallViewModel["customer"]["status"]
): LiveCallViewModel["actionBanner"] {
  const runningTool = [...evidence.tools].reverse().find((tool) => tool.status === "started");
  const changeSet = latestChangeSet(evidence.changeSets ?? []);
  const blocker = currentChangeSetBlocker(changeSet);
  const realtimeError = currentRealtimeError(state);
  if (realtimeError) {
    return { type: "blocked", title: realtimeError.title, description: realtimeError.detail, label: "Realtime error" };
  }
  if (runningTool) {
    return { type: "running", title: `Running ${runningTool.name}`, description: runningTool.summary ?? "Server tool is running." };
  }
  if (blocker) {
    return { type: blocker.severity === "escalate" ? "escalated" : "blocked", title: `Blocked by ${blocker.policyId}`, description: blocker.message };
  }
  if (hasChangeSet && changeSetPreview(changeSet!, evidence.diffs ?? []).requiresConfirmation) {
    return { type: "waiting", title: "Waiting for explicit confirmation", description: "Preview shown. No state has been committed.", label: "Confirmation required" };
  }
  if (state.sessionStatus === "disconnected") {
    return { type: "ready", title: state.callId ? "Call ended" : "Ready", description: state.callId ? "Call history remains visible until reset." : "Waiting for call to start." };
  }
  if (customerStatus !== "confirmed") {
    return { type: "waiting", title: "Waiting for identifier", description: "Confirm identity before private reads or writes.", label: "Identity required" };
  }
  return { type: "ready", title: "Ready for next action", description: "Agent can handle authorized read or preview work." };
}

function policySummary(
  evidence: VoiceConsoleEvidenceState,
  hasChangeSet: boolean,
  customerStatus: LiveCallViewModel["customer"]["status"]
): LiveCallViewModel["policy"] {
  const changeSet = latestChangeSet(evidence.changeSets ?? []);
  const blocker = currentChangeSetBlocker(changeSet);
  if (blocker) return { statusText: `Blocked by ${blocker.policyId}`, subText: blocker.message };
  if (hasChangeSet && changeSetPreview(changeSet!, evidence.diffs ?? []).requiresConfirmation) {
    return {
      statusText: "Policies passed: identity, date, locked-date, preview.",
      subText: "Commit blocked until confirmation."
    };
  }
  if (customerStatus !== "confirmed") {
    return { statusText: "Private reads and writes require confirmed identity." };
  }
  return { statusText: "No deterministic policy blockers in current evidence." };
}

function toolRow(tool: EvidenceToolItem): LiveCallViewModel["tools"][number] {
  return {
    elapsedTime: tool.at,
    id: tool.id,
    name: tool.name,
    policyId: tool.policyId ?? tool.toolError?.policyId,
    risk: tool.risk,
    status: tool.status === "started" ? "running" : tool.status === "ok" ? "completed" : tool.status === "blocked" ? "blocked" : "failed",
    summary: tool.summary ?? tool.toolError?.message
  };
}

function latestToolData(
  tools: EvidenceToolItem[],
  toolName: string
): Record<string, unknown> | undefined {
  const tool = [...tools].reverse().find((item) => item.name === toolName && item.status === "ok");
  return recordValue(recordValue(tool?.outputData, "data"));
}
