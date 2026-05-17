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
  issueRealtimeEvidenceSession,
  RealtimeEvidenceSnapshotSchema,
  resetRealtimeEvidenceSessionStore,
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

function evidenceRequest(options: { callId?: string; evidenceToken?: string } = {}): Request {
  const url = new URL("http://localhost/api/realtime/evidence");
  if (options.callId) url.searchParams.set("call_id", options.callId);
  const headers = new Headers();
  if (options.evidenceToken) {
    headers.set("Cookie", `realtime_evidence_session=${encodeURIComponent(options.evidenceToken)}`);
  }
  return new Request(url, { headers });
}

describe("GET /api/realtime/evidence", () => {
  beforeEach(() => {
    resetDb();
    resetRealtimeEvidenceStore();
    resetRealtimeEvidenceSessionStore();
    vi.restoreAllMocks();
  });

  function createSession(callId: string): string {
    return issueRealtimeEvidenceSession({ callId });
  }

  it("rejects missing call IDs", async () => {
    const response = await handleRealtimeEvidenceRequest(evidenceRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.error).toBe("missing_or_invalid_call_id");
  });

  it("returns 404 for unknown calls", async () => {
    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({
        callId: "rtc_unknown_123456",
        evidenceToken: createSession("rtc_unknown_123456")
      })
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
      transcript: "My customer ID is cus 001.",
      usage: {
        type: "tokens",
        input_tokens: 30,
        input_token_details: {
          audio_tokens: 30,
          text_tokens: 0
        },
        output_tokens: 8,
        total_tokens: 38
      }
    }));
    socket.emit("message", JSON.stringify({
      type: "response.function_call_arguments.delta",
      call_id: "call_lookup_customer",
      delta: "{\"customer_id\":\"cus_001\""
    }));
    socket.emit("message", JSON.stringify({
      type: "response.done",
      response: {
        model: "gpt-realtime-2",
        output: [{
          type: "function_call",
          name: "lookup_customer",
          call_id: "call_lookup_customer",
          arguments: JSON.stringify({ customer_id: "cus_001" })
        }],
        usage: {
          total_tokens: 170,
          input_tokens: 120,
          output_tokens: 50,
          input_token_details: {
            text_tokens: 100,
            audio_tokens: 20,
            cached_tokens: 50,
            cached_tokens_details: {
              text_tokens: 50,
              audio_tokens: 0
            }
          },
          output_token_details: {
            text_tokens: 10,
            audio_tokens: 40
          }
        }
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({
        callId: "rtc_evidence_123456",
        evidenceToken: createSession("rtc_evidence_123456")
      })
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
    expect(parsed.cost_telemetry).toMatchObject({
      estimate_status: "available",
      model: "gpt-realtime-2",
      source_event_count: 2,
      total_usd: 0.00451,
      transcription_model: "gpt-realtime-whisper"
    });
    expect(parsed.cost_telemetry?.raw_usage_events).toHaveLength(2);
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
      evidenceRequest({
        callId: "rtc_error_123456",
        evidenceToken: createSession("rtc_error_123456")
      })
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
      evidenceRequest({
        callId: "rtc_api_error_123456",
        evidenceToken: createSession("rtc_api_error_123456")
      })
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

  it("rejects evidence reads without the active call cookie", async () => {
    beginRealtimeEvidenceRun({
      callId: "rtc_cookie_required_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      runId: "browser_rtc_cookie_required_123456"
    });

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({ callId: "rtc_cookie_required_123456" })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("missing_realtime_session");
  });

  it("rejects evidence reads when the cookie call differs", async () => {
    beginRealtimeEvidenceRun({
      callId: "rtc_cookie_bound_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      runId: "browser_rtc_cookie_bound_123456"
    });

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({
        callId: "rtc_cookie_bound_123456",
        evidenceToken: createSession("rtc_other_123456")
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("forbidden_realtime_evidence_access");
  });

  it("rejects forged cookie values that reuse public call IDs", async () => {
    beginRealtimeEvidenceRun({
      callId: "rtc_forged_cookie_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      runId: "browser_rtc_forged_cookie_123456"
    });

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({
        callId: "rtc_forged_cookie_123456",
        evidenceToken: "rtc_forged_cookie_123456"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("forbidden_realtime_evidence_access");
  });

  it("allows evidence reads with server-issued evidence tokens", async () => {
    beginRealtimeEvidenceRun({
      callId: "rtc_valid_token_123456",
      now: () => new Date("2026-05-14T09:00:00.000Z"),
      runId: "browser_rtc_valid_token_123456"
    });

    const response = await handleRealtimeEvidenceRequest(
      evidenceRequest({
        callId: "rtc_valid_token_123456",
        evidenceToken: createSession("rtc_valid_token_123456")
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(RealtimeEvidenceSnapshotSchema.safeParse(body).success).toBe(true);
  });
});
