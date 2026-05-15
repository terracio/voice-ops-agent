import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startRealtimeServerControl,
  type RealtimeSidebandSocket
} from "../src/realtime/server/serverControl";
import {
  handleRealtimeEvidenceMutationRequest,
  handleRealtimeEvidenceRequest
} from "../src/app/api/realtime/evidence/handler";
import { resetDb } from "../src/domain/db";
import {
  beginRealtimeEvidenceRun,
  RealtimeEvidenceSnapshotSchema,
  resetRealtimeEvidenceStore
} from "../src/evidence";

class FakeSidebandSocket implements RealtimeSidebandSocket {
  readonly sent: string[] = [];
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(...args);
    }
  }
}

function evidenceRequest(callId?: string): Request {
  const url = new URL("http://localhost/api/realtime/evidence");
  if (callId) url.searchParams.set("call_id", callId);
  return new Request(url);
}

describe("GET /api/realtime/evidence", () => {
  beforeEach(() => {
    resetDb();
    resetRealtimeEvidenceStore();
    vi.restoreAllMocks();
  });

  it("rejects missing call IDs", async () => {
    const response = await handleRealtimeEvidenceRequest(evidenceRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error).toBe("missing_or_invalid_call_id");
  });

  it("returns 404 for unknown calls", async () => {
    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest("rtc_unknown_123456")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error).toBe("evidence_not_found");
  });

  it("keeps browser evidence in a process-wide store across route bundles", async () => {
    beginRealtimeEvidenceRun({
      callId: "rtc_global_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      runId: "browser_rtc_global_123456"
    });
    vi.resetModules();

    const { getRealtimeEvidenceSnapshot } = await import(
      "../src/evidence/realtimeEvidenceStore"
    );

    expect(getRealtimeEvidenceSnapshot("rtc_global_123456")).toMatchObject({
      call_id: "rtc_global_123456",
      run_id: "browser_rtc_global_123456",
      status: "active"
    });
  });

  it("returns validated server-owned evidence for a sideband tool call", async () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_evidence_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      socketFactory: () => socket
    });

    socket.emit("open");
    socket.emit("message", JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "turn_user_1",
      transcript: "My customer ID is cus 001."
    }));
    socket.emit("message", JSON.stringify({
      type: "response.function_call_arguments.delta",
      call_id: "call_lookup_customer",
      delta: "{\"customer_id\":\"cus_001\""
    }));
    socket.emit("message", JSON.stringify({
      type: "response.done",
      response: {
        output: [{
          type: "function_call",
          name: "lookup_customer",
          call_id: "call_lookup_customer",
          arguments: JSON.stringify({ customer_id: "cus_001" })
        }]
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest("rtc_evidence_123456")
    );
    const body = await response.json();
    const parsed = RealtimeEvidenceSnapshotSchema.parse(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0]).toMatchObject({
      tool_call_id: "call_lookup_customer",
      tool_name: "lookup_customer",
      status: "ok"
    });
    expect(parsed.audit_events).toHaveLength(1);
    expect(parsed.transcript[0]).toMatchObject({
      actor: "user",
      is_operational_source: false
    });
    expect(JSON.stringify(parsed.transcript)).not.toContain("customer_id");
    expect(JSON.stringify(body)).not.toContain("sk-server-secret");
  });

  it("preserves error status when a failed socket later closes", async () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_error_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      socketFactory: () => socket
    });

    socket.emit("error", new Error("sideband failed"));
    socket.emit("close");

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest("rtc_error_123456")
    );
    const body = await response.json();
    const parsed = RealtimeEvidenceSnapshotSchema.parse(body);

    expect(parsed.status).toBe("error");
    expect(parsed.realtime_events.map((event) => event.event_type)).toContain(
      "sideband.error"
    );
    expect(parsed.realtime_events).toContainEqual(expect.objectContaining({
      event_type: "sideband.error",
      label: "Realtime sideband error: sideband failed"
    }));
  });

  it("includes Realtime API error details in transport evidence", async () => {
    const socket = new FakeSidebandSocket();
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_api_error_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      socketFactory: () => socket
    });

    socket.emit("message", JSON.stringify({
      type: "error",
      error: {
        code: "invalid_request_error",
        message: "response.create rejected"
      }
    }));

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest("rtc_api_error_123456")
    );
    const body = await response.json();
    const parsed = RealtimeEvidenceSnapshotSchema.parse(body);

    expect(parsed.realtime_events).toContainEqual(expect.objectContaining({
      event_type: "error",
      label: "error: invalid_request_error: response.create rejected",
      severity: "error"
    }));
  });

  it("rejects browser mutation attempts", async () => {
    const response = await handleRealtimeEvidenceMutationRequest();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error).toBe("evidence_is_read_only");
  });
});
