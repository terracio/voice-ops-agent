import {
  toChangeSetItem,
  toDiffItem,
  toPolicyItem,
  type EvidenceChangeSetDiffItem,
  type EvidenceChangeSetItem,
  type EvidencePolicyItem
} from "./voiceConsoleStructuredEvidence";

export type EvidencePollStatus = "idle" | "loading" | "ready" | "error";
export type EvidenceToolStatus = "started" | "ok" | "blocked" | "error";

export type EvidenceTranscriptItem = {
  actor: "assistant" | "system" | "user";
  at: string;
  id: string;
  kind: string;
  text: string;
  turnId: string;
};

export type EvidenceToolItem = {
  at: string;
  id: string;
  input?: string;
  inputData?: unknown;
  name: string;
  output?: string;
  outputData?: unknown;
  policyId?: string;
  risk: string;
  status: EvidenceToolStatus;
  summary?: string;
  toolError?: { code?: string; message?: string; policyId?: string };
};

export type EvidenceRealtimeItem = {
  at: string;
  eventType: string;
  id: string;
  label: string;
  severity: "error" | "info" | "warning";
};

export type EvidenceCostLineItem = {
  amountLabel: string;
  amountUsd?: number;
  category: "input_transcription" | "speech_to_speech";
  id: string;
  label: string;
  quantityLabel: string;
};

export type EvidenceCostTelemetry = {
  estimateStatus: "available" | "partial" | "unavailable";
  flags: string[];
  lineItems: EvidenceCostLineItem[];
  model: string;
  pricingLastVerifiedAt: string;
  sourceEventCount: number;
  totalLabel?: string;
  totalUsd?: number;
  transcriptionModel: string;
  unavailableReasons: string[];
};

export type VoiceConsoleEvidenceState = {
  changeSets?: EvidenceChangeSetItem[];
  cost?: EvidenceCostTelemetry;
  diffs?: EvidenceChangeSetDiffItem[];
  errorMessage?: string;
  events: EvidenceRealtimeItem[];
  lastUpdated?: string;
  policies?: EvidencePolicyItem[];
  status: EvidencePollStatus;
  tools: EvidenceToolItem[];
  transcript: EvidenceTranscriptItem[];
};

export const EMPTY_VOICE_CONSOLE_EVIDENCE: VoiceConsoleEvidenceState = {
  changeSets: [],
  diffs: [],
  events: [],
  policies: [],
  status: "idle",
  tools: [],
  transcript: []
};

export function evidenceLoadingState(): VoiceConsoleEvidenceState {
  return { ...EMPTY_VOICE_CONSOLE_EVIDENCE, status: "loading" };
}

export function evidenceErrorState(message: string): VoiceConsoleEvidenceState {
  return { ...EMPTY_VOICE_CONSOLE_EVIDENCE, errorMessage: message, status: "error" };
}

export function toVoiceConsoleEvidenceState(
  payload: unknown
): VoiceConsoleEvidenceState {
  const record = isRecord(payload) ? payload : {};
  return {
    changeSets: arrayValue(record.change_sets).map(toChangeSetItem),
    cost: toCostTelemetry(record.cost_telemetry),
    diffs: arrayValue(record.diffs).map(toDiffItem),
    events: arrayValue(record.realtime_events).map(toRealtimeItem),
    lastUpdated: displayTime(record.generated_at),
    policies: arrayValue(record.policies).map(toPolicyItem),
    status: "ready",
    tools: arrayValue(record.tools).map(toToolItem),
    transcript: arrayValue(record.transcript).map(toTranscriptItem)
  };
}

export function formatEvidenceStatus(status: EvidenceToolStatus): string {
  if (status === "started") return "Pending";
  if (status === "ok") return "OK";
  if (status === "blocked") return "Blocked";
  return "Error";
}

function toTranscriptItem(value: unknown, index: number): EvidenceTranscriptItem {
  const item = isRecord(value) ? value : {};
  const source = isRecord(item.source) ? item.source : {};
  return {
    actor: actorValue(item.actor),
    at: displayTime(item.created_at),
    id: stringValue(item.evidence_id) ?? `transcript-${index}`,
    kind: stringValue(item.transcript_kind) ?? "realtime_transcript",
    text: stringValue(item.text) ?? "",
    turnId: stringValue(item.turn_id) ?? stringValue(source.turn_id) ?? `turn-${index}`
  };
}

function toToolItem(value: unknown, index: number): EvidenceToolItem {
  const item = isRecord(value) ? value : {};
  const toolError = isRecord(item.tool_error) ? item.tool_error : undefined;
  return {
    at: displayTime(item.created_at),
    id: stringValue(item.evidence_id) ?? stringValue(item.tool_call_id) ?? `tool-${index}`,
    input: compactJson(item.input),
    inputData: item.input,
    name: stringValue(item.tool_name) ?? "unknown_tool",
    output: compactJson(item.output),
    outputData: item.output,
    policyId: stringValue(toolError?.policy_id),
    risk: stringValue(item.risk) ?? "unknown",
    status: toolStatus(item.status),
    summary: stringValue(item.result_summary) ?? stringValue(toolError?.message),
    toolError: toolError
      ? {
        code: stringValue(toolError.code),
        message: stringValue(toolError.message),
        policyId: stringValue(toolError.policy_id)
      }
      : undefined
  };
}

function toRealtimeItem(value: unknown, index: number): EvidenceRealtimeItem {
  const item = isRecord(value) ? value : {};
  return {
    at: displayTime(item.created_at),
    eventType: stringValue(item.event_type) ?? "unknown",
    id: stringValue(item.evidence_id) ?? `event-${index}`,
    label: stringValue(item.label) ?? "Realtime event",
    severity: severityValue(item.severity)
  };
}

function toCostTelemetry(value: unknown): EvidenceCostTelemetry | undefined {
  const item = isRecord(value) ? value : undefined;
  if (!item) return undefined;
  const totalUsd = numberValue(item.total_usd);
  return {
    estimateStatus: costStatus(item.estimate_status),
    flags: arrayValue(item.flags).flatMap(stringArrayItem),
    lineItems: arrayValue(item.line_items).map(toCostLineItem),
    model: stringValue(item.model) ?? "unknown",
    pricingLastVerifiedAt: stringValue(item.pricing_last_verified_at) ?? "unknown",
    sourceEventCount: numberValue(item.source_event_count) ?? 0,
    totalLabel: totalUsd === undefined ? undefined : formatUsd(totalUsd),
    totalUsd,
    transcriptionModel: stringValue(item.transcription_model) ?? "unknown",
    unavailableReasons: arrayValue(item.unavailable_reasons).flatMap(stringArrayItem)
  };
}

function toCostLineItem(value: unknown, index: number): EvidenceCostLineItem {
  const item = isRecord(value) ? value : {};
  const amountUsd = numberValue(item.amount_usd);
  return {
    amountLabel: amountUsd === undefined ? "unavailable" : formatUsd(amountUsd),
    amountUsd,
    category: costCategory(item.category),
    id: `${stringValue(item.code) ?? "cost"}-${index}`,
    label: stringValue(item.label) ?? "Usage",
    quantityLabel: quantityLabel(item.quantity, item.unit)
  };
}

function displayTime(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "--:--:--";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function compactJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function actorValue(value: unknown): EvidenceTranscriptItem["actor"] {
  return value === "assistant" || value === "system" || value === "user"
    ? value
    : "system";
}

function toolStatus(value: unknown): EvidenceToolStatus {
  return value === "ok" || value === "blocked" || value === "error" || value === "started"
    ? value
    : "error";
}

function severityValue(value: unknown): EvidenceRealtimeItem["severity"] {
  return value === "warning" || value === "error" ? value : "info";
}

function costStatus(value: unknown): EvidenceCostTelemetry["estimateStatus"] {
  return value === "available" || value === "partial" ? value : "unavailable";
}

function costCategory(value: unknown): EvidenceCostLineItem["category"] {
  return value === "input_transcription" ? value : "speech_to_speech";
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayItem(value: unknown): string[] {
  const item = stringValue(value);
  return item ? [item] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}


function formatUsd(value: number): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

function quantityLabel(quantity: unknown, unit: unknown): string {
  const value = numberValue(quantity);
  const unitText = stringValue(unit) ?? "units";
  if (value === undefined) return unitText;
  if (unitText === "minutes") return `${value.toFixed(3)} min`;
  return `${Math.round(value).toLocaleString("en-US")} tokens`;
}
