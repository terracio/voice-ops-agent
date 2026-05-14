import { ChangeSetPreviewSchema } from "../domain/changeSetPreview";
import { getAuditEventsByRunId, getChangeSet, getConfirmation } from "../domain/db";
import type { ChangeSet, PolicyResult, ToolResult, ToolRisk } from "../domain/schema";
import { REALTIME_EVIDENCE_SCHEMA_VERSION, RealtimeEvidenceSnapshotSchema, type RealtimeEvidenceSnapshot, type ToolEvidenceItem } from "./realtimeEvidence";
import {
  applyToolResult,
  asRecord,
  auditEvidence,
  changeSetEvidence,
  confirmationEvidence,
  diffEvidenceItems,
  failedPolicyResult,
  parseResultChangeSet,
  parseResultConfirmation,
  policyEvidence,
  policyResultsFromAudit,
  realtimeEventEvidence,
  stageForTool,
  startedToolEvidence,
  stringValue,
  timestamp,
  transcriptEvidence
} from "./realtimeEvidenceBuilders";
import { realtimeEventLabel } from "./realtimeEventLabels";

type EvidenceState = {
  audit_event_ids: Set<string>;
  call_id: string;
  policy_keys: Set<string>;
  run_id: string;
  sequence: number;
  snapshot: RealtimeEvidenceSnapshot;
  tool_call_ids: Set<string>;
};

type ToolRecordOptions = {
  callId: string;
  input: unknown;
  now?: () => Date;
  risk: ToolRisk;
  toolCallId: string;
  toolName: string;
};

const evidenceByCallId = ((globalThis as typeof globalThis & {
  __mealplanRealtimeEvidenceByCallId?: Map<string, EvidenceState>;
}).__mealplanRealtimeEvidenceByCallId ??= new Map<string, EvidenceState>());

export function resetRealtimeEvidenceStore(): void {
  evidenceByCallId.clear();
}

export function beginRealtimeEvidenceRun(options: {
  callId: string;
  now?: () => Date;
  runId: string;
}): RealtimeEvidenceSnapshot {
  const existing = evidenceByCallId.get(options.callId);
  if (existing) return snapshot(existing);

  const generatedAt = timestamp(options.now);
  const state: EvidenceState = {
    audit_event_ids: new Set(),
    call_id: options.callId,
    policy_keys: new Set(),
    run_id: options.runId,
    sequence: 0,
    snapshot: RealtimeEvidenceSnapshotSchema.parse({
      schema_version: REALTIME_EVIDENCE_SCHEMA_VERSION,
      call_id: options.callId,
      run_id: options.runId,
      status: "active",
      generated_at: generatedAt
    }),
    tool_call_ids: new Set()
  };
  evidenceByCallId.set(options.callId, state);
  recordRealtimeEvidenceEvent({
    callId: options.callId,
    eventType: "server_control.started",
    label: "Server evidence capture started",
    now: options.now
  });
  return snapshot(state);
}

export function getRealtimeEvidenceSnapshot(
  callId: string
): RealtimeEvidenceSnapshot | undefined {
  const state = evidenceByCallId.get(callId);
  return state ? snapshot(state) : undefined;
}

export function finishRealtimeEvidenceRun(options: {
  callId: string;
  now?: () => Date;
  status: "ended" | "error";
}): void {
  const state = evidenceByCallId.get(options.callId);
  if (!state) return;
  if (state.snapshot.status === "error" && options.status === "ended") {
    touch(state, options.now);
    return;
  }
  state.snapshot.status = options.status;
  touch(state, options.now);
}

export function recordRealtimeEvidenceEvent(options: {
  callId: string;
  eventType: string;
  label: string;
  now?: () => Date;
  severity?: "info" | "warning" | "error";
}): void {
  const state = evidenceByCallId.get(options.callId);
  if (!state) return;
  state.snapshot.realtime_events.push(realtimeEventEvidence({
    createdAt: timestamp(options.now),
    eventType: options.eventType,
    evidenceId: nextId(state, "evt"),
    label: options.label,
    severity: options.severity
  }));
  touch(state, options.now);
}

export function recordRealtimeTransportEvidence(options: {
  callId: string;
  event: unknown;
  now?: () => Date;
}): void {
  const state = evidenceByCallId.get(options.callId);
  const event = asRecord(options.event);
  if (!state || !event) return;

  const eventType = stringValue(event.type) ?? "unknown";
  recordRealtimeEvidenceEvent({
    callId: options.callId,
    eventType,
    label: realtimeEventLabel(event),
    now: options.now,
    severity: eventType.includes("error") ? "error" : "info"
  });

  const transcript = transcriptEvidence({
    createdAt: timestamp(options.now),
    event,
    eventType,
    evidenceId: nextId(state, "tr"),
    turnId: stringValue(event.item_id) ?? stringValue(event.response_id) ?? nextId(state, "turn")
  });
  if (transcript) state.snapshot.transcript.push(transcript);
}

export function recordRealtimeToolStart(options: ToolRecordOptions): void {
  const state = evidenceByCallId.get(options.callId);
  if (!state || state.tool_call_ids.has(options.toolCallId)) return;

  state.tool_call_ids.add(options.toolCallId);
  state.snapshot.tools.push(startedToolEvidence({
    createdAt: timestamp(options.now),
    evidenceId: nextId(state, "tool"),
    input: options.input,
    risk: options.risk,
    toolCallId: options.toolCallId,
    toolName: options.toolName
  }));
  touch(state, options.now);
}

export function recordRealtimeToolResult(
  options: ToolRecordOptions & { result: ToolResult<unknown>; runId: string }
): void {
  const state = evidenceByCallId.get(options.callId);
  if (!state) return;

  const item = findTool(state, options) ?? addMissingTool(state, options);
  applyToolResult(item, options.result);
  captureResultEvidence(state, options);
  syncAuditEvidence(state, options.runId, options.now);
  touch(state, options.now);
}

function captureResultEvidence(
  state: EvidenceState,
  options: ToolRecordOptions & { result: ToolResult<unknown> }
): void {
  const failedPolicy = failedPolicyResult(options.result);
  if (failedPolicy) {
    addPolicy(state, failedPolicy, `tool:${options.toolCallId}`, {
      stage: stageForTool(options.toolName),
      toolCallId: options.toolCallId,
      now: options.now
    });
    return;
  }

  const changeSet = parseResultChangeSet(options.result);
  if (changeSet) upsertChangeSet(state, changeSet, options.now);

  const confirmation = parseResultConfirmation(options.result);
  if (confirmation) upsertConfirmation(state, confirmation, options.now);

  const preview = options.result.ok
    ? ChangeSetPreviewSchema.safeParse(options.result.data)
    : undefined;
  if (preview?.success) {
    const saved = getChangeSet(preview.data.change_set_id);
    if (saved) upsertChangeSet(state, saved, options.now);
    preview.data.policy_results.forEach((result) => {
      addPolicy(state, result, `preview:${preview.data.change_set_id}`, {
        stage: "preview",
        toolCallId: options.toolCallId,
        now: options.now
      });
    });
  }
}

function syncAuditEvidence(
  state: EvidenceState,
  runId: string,
  now?: () => Date
): void {
  for (const event of getAuditEventsByRunId(runId)) {
    if (!state.audit_event_ids.has(event.event_id)) {
      state.audit_event_ids.add(event.event_id);
      state.snapshot.audit_events.push(auditEvidence({
        createdAt: timestamp(now),
        event
      }));
    }
    if (event.change_set_id) {
      const changeSet = getChangeSet(event.change_set_id);
      if (changeSet) upsertChangeSet(state, changeSet, now);
    }
    const confirmationId = stringValue(event.details.confirmation_id);
    if (confirmationId) {
      const confirmation = getConfirmation(confirmationId);
      if (confirmation) upsertConfirmation(state, confirmation, now);
    }
    policyResultsFromAudit(event).forEach((result) => {
      addPolicy(state, result, `audit:${event.event_id}`, {
        stage: stageForTool(event.tool_name),
        now
      });
    });
  }
}

function upsertChangeSet(
  state: EvidenceState,
  changeSet: ChangeSet,
  now?: () => Date
): void {
  upsertById(state.snapshot.change_sets, changeSetEvidence({
    changeSet,
    createdAt: timestamp(now)
  }), "change_set_id");
  diffEvidenceItems({ changeSet, createdAt: timestamp(now) }).forEach((diff) => {
    upsertById(state.snapshot.diffs, diff, "evidence_id");
  });
}

function upsertConfirmation(
  state: EvidenceState,
  confirmation: Parameters<typeof confirmationEvidence>[0]["confirmation"],
  now?: () => Date
): void {
  upsertById(state.snapshot.confirmations, confirmationEvidence({
    confirmation,
    createdAt: timestamp(now)
  }), "evidence_id");
}

function addPolicy(
  state: EvidenceState,
  result: PolicyResult,
  sourceKey: string,
  options: {
    now?: () => Date;
    stage: ReturnType<typeof stageForTool>;
    toolCallId?: string;
  }
): void {
  const key = `${sourceKey}:${result.policy_id}:${options.stage}`;
  if (state.policy_keys.has(key)) return;
  state.policy_keys.add(key);
  state.snapshot.policies.push(policyEvidence({
    createdAt: timestamp(options.now),
    evidenceId: `policy_${state.policy_keys.size}`,
    result,
    stage: options.stage,
    toolCallId: options.toolCallId
  }));
}

function findTool(
  state: EvidenceState,
  options: Pick<ToolRecordOptions, "toolCallId">
): ToolEvidenceItem | undefined {
  return state.snapshot.tools.find((item) => {
    return item.tool_call_id === options.toolCallId;
  });
}

function addMissingTool(
  state: EvidenceState,
  options: ToolRecordOptions
): ToolEvidenceItem {
  const item = startedToolEvidence({
    createdAt: timestamp(options.now),
    evidenceId: nextId(state, "tool"),
    input: options.input,
    risk: options.risk,
    toolCallId: options.toolCallId,
    toolName: options.toolName
  });
  state.snapshot.tools.push(item);
  return item;
}

function upsertById<TItem extends Record<string, unknown>>(
  list: TItem[],
  item: TItem,
  key: keyof TItem
): void {
  const index = list.findIndex((candidate) => candidate[key] === item[key]);
  if (index === -1) {
    list.push(item);
  } else {
    list[index] = item;
  }
}

function touch(state: EvidenceState, now?: () => Date): void {
  state.snapshot.generated_at = timestamp(now);
}

function nextId(state: EvidenceState, prefix: string): string {
  state.sequence += 1;
  return `${prefix}_${state.call_id}_${String(state.sequence).padStart(4, "0")}`;
}

function snapshot(state: EvidenceState): RealtimeEvidenceSnapshot {
  return RealtimeEvidenceSnapshotSchema.parse(structuredClone(state.snapshot));
}
