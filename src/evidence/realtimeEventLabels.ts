import { asRecord, stringValue } from "./realtimeEvidenceBuilders";

export function realtimeEventLabel(event: Record<string, unknown>): string {
  const eventType = stringValue(event.type) ?? "unknown";
  if (eventType !== "error") return eventType;

  const error = asRecord(event.error);
  const code = stringValue(error?.code) ?? stringValue(error?.type);
  const message = stringValue(error?.message);
  const detail = [code, message].filter(Boolean).join(": ");
  return detail ? `error: ${detail}` : eventType;
}
