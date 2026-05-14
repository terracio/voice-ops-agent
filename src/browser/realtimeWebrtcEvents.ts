import { z } from "zod";

export const DEFAULT_REALTIME_SESSION_ENDPOINT = "/api/realtime/session";
export const DEFAULT_REALTIME_CONTROL_ENDPOINT = "/api/realtime/control";
export const REALTIME_EVENTS_CHANNEL = "oai-events";

export type RealtimeWebrtcControllerState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "tool-running"
  | "waiting-for-confirmation"
  | "ended"
  | "error";

export type RealtimeWebrtcControllerEvent =
  | {
      previousState: RealtimeWebrtcControllerState;
      state: RealtimeWebrtcControllerState;
      type: "state";
    }
  | { callId: string; type: "call-id" }
  | { message: unknown; type: "message" }
  | { error: Error; type: "error" }
  | { muted: boolean; type: "muted" }
  | { stream: MediaStream; type: "remote-stream" };

export type RealtimeWebrtcControllerListener = (
  event: RealtimeWebrtcControllerEvent
) => void;

export const RealtimeSessionResponseSchema = z.object({
  client_secret: z.object({ value: z.string().min(1) }).passthrough(),
  transport: z.object({
    calls_url: z.string().min(1),
    type: z.literal("webrtc")
  }).passthrough()
}).passthrough();

export function normalizeRealtimeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function parseRealtimeCallIdFromLocation(
  location: string | null
): string | null {
  if (!location) return null;
  return location.match(/(?:^|[/=])(rtc_[A-Za-z0-9_-]+)/)?.[1] ?? null;
}

export function parseRealtimeMessageData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

export function stateFromRealtimeBrowserEvent(
  message: unknown
): RealtimeWebrtcControllerState | undefined {
  if (!isRecord(message)) return undefined;
  const type = stringValue(message.type);
  const item = isRecord(message.item) ? message.item : undefined;
  const itemType = stringValue(item?.type);
  const itemName = stringValue(item?.name);
  const marker = `${type} ${itemType} ${itemName}`.toLowerCase();

  if (type === "error" || type.endsWith(".error")) return "error";
  if (
    marker.includes("waiting_for_confirmation") ||
    marker.includes("waiting-for-confirmation") ||
    marker.includes("confirmation.required") ||
    marker.includes("changeset.preview") ||
    marker.includes("change_set.preview")
  ) {
    return "waiting-for-confirmation";
  }
  if (marker.includes("function_call") || marker.includes("tool")) {
    return "tool-running";
  }
  if (
    type === "response.created" ||
    type.includes("audio.delta") ||
    type.includes("audio_transcript.delta")
  ) {
    return "speaking";
  }
  if (type === "response.done" || type === "response.audio.done") {
    return "listening";
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
