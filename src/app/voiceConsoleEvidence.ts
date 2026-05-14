export type EvidencePollStatus = "idle" | "loading" | "ready" | "error";
export type EvidenceToolStatus = "started" | "ok" | "blocked" | "error";

export type EvidenceTranscriptItem = {
  actor: "assistant" | "system" | "user";
  at: string;
  id: string;
  kind: string;
  text: string;
};

export type EvidenceToolItem = {
  at: string;
  id: string;
  input?: string;
  name: string;
  output?: string;
  policyId?: string;
  risk: string;
  status: EvidenceToolStatus;
  summary?: string;
};

export type EvidenceRealtimeItem = {
  at: string;
  eventType: string;
  id: string;
  label: string;
  severity: "error" | "info" | "warning";
};

export type VoiceConsoleEvidenceState = {
  errorMessage?: string;
  events: EvidenceRealtimeItem[];
  lastUpdated?: string;
  status: EvidencePollStatus;
  tools: EvidenceToolItem[];
  transcript: EvidenceTranscriptItem[];
};

export const EMPTY_VOICE_CONSOLE_EVIDENCE: VoiceConsoleEvidenceState = {
  events: [],
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
    events: arrayValue(record.realtime_events).map(toRealtimeItem),
    lastUpdated: displayTime(record.generated_at),
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
  return {
    actor: actorValue(item.actor),
    at: displayTime(item.created_at),
    id: stringValue(item.evidence_id) ?? `transcript-${index}`,
    kind: stringValue(item.transcript_kind) ?? "realtime_transcript",
    text: stringValue(item.text) ?? ""
  };
}

function toToolItem(value: unknown, index: number): EvidenceToolItem {
  const item = isRecord(value) ? value : {};
  const toolError = isRecord(item.tool_error) ? item.tool_error : undefined;
  return {
    at: displayTime(item.created_at),
    id: stringValue(item.evidence_id) ?? stringValue(item.tool_call_id) ?? `tool-${index}`,
    input: compactJson(item.input),
    name: stringValue(item.tool_name) ?? "unknown_tool",
    output: compactJson(item.output),
    policyId: stringValue(toolError?.policy_id),
    risk: stringValue(item.risk) ?? "unknown",
    status: toolStatus(item.status),
    summary: stringValue(item.result_summary) ?? stringValue(toolError?.message)
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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
