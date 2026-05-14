import { beforeEach, describe, expect, it } from "vitest";
import {
  startRealtimeServerControl,
  type RealtimeSidebandSocket
} from "../src/agent";
import { resetDb } from "../src/domain/db";

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
    for (const handler of this.handlers.get(eventName) ?? []) handler(...args);
  }
}

describe("Realtime server confirmation context", () => {
  beforeEach(() => {
    resetDb();
  });

  it("captures confirmation from the latest user transcript turn", async () => {
    const socket = new FakeSidebandSocket();
    let now = new Date("2026-05-11T10:00:00Z");
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_confirm_123456",
      now: () => now,
      socketFactory: () => socket
    });

    await emitFunctionCall(socket, "lookup_customer", "call_lookup", {
      customer_id: "CUS_001"
    });
    await emitFunctionCall(socket, "create_change_set", "call_create", {
      change_set_id: "cs_realtime_confirm",
      operations: [{
        type: "pause_dates",
        dates: ["2026-05-18"],
        reason: "customer_requested"
      }]
    });
    now = new Date("2026-05-11T10:01:00Z");
    await emitFunctionCall(socket, "preview_change_set", "call_preview", {
      change_set_id: "cs_realtime_confirm"
    });
    expect(functionOutputs(socket).at(-1)).toMatchObject({
      ok: true,
      data: {
        confirmation_challenge: {
          phrase: "Confirm pause delivery."
        }
      }
    });
    now = new Date("2026-05-11T10:02:00Z");
    socket.emit("message", JSON.stringify({
      item_id: "item_confirm_turn",
      transcript: "Confirm pause delivery.",
      type: "conversation.item.input_audio_transcription.completed"
    }));
    await emitFunctionCall(socket, "capture_confirmation", "call_confirm", {
      change_set_id: "cs_realtime_confirm"
    });

    const confirmation = functionOutputs(socket).find((output) => {
      return output.ok && output.data?.confirmation_id;
    });
    expect(confirmation).toMatchObject({
      ok: true,
      data: {
        change_set_id: "cs_realtime_confirm",
        confirmation_source: "realtime_user_turn",
        source_user_turn_id: "item_confirm_turn",
        transcript_excerpt: "Confirm pause delivery."
      }
    });
  });

  it("rejects generic yes for Realtime confirmations after preview", async () => {
    const socket = new FakeSidebandSocket();
    let now = new Date("2026-05-11T10:00:00Z");
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_generic_confirm_123456",
      now: () => now,
      socketFactory: () => socket
    });

    await emitFunctionCall(socket, "lookup_customer", "call_lookup", {
      customer_id: "CUS_001"
    });
    await emitFunctionCall(socket, "create_change_set", "call_create", {
      change_set_id: "cs_generic_confirm",
      operations: [{
        type: "pause_dates",
        dates: ["2026-05-18"],
        reason: "customer_requested"
      }]
    });
    now = new Date("2026-05-11T10:01:00Z");
    await emitFunctionCall(socket, "preview_change_set", "call_preview", {
      change_set_id: "cs_generic_confirm"
    });
    now = new Date("2026-05-11T10:02:00Z");
    socket.emit("message", JSON.stringify({
      item_id: "item_generic_yes",
      transcript: "Yes.",
      type: "conversation.item.input_audio_transcription.completed"
    }));
    await emitFunctionCall(socket, "capture_confirmation", "call_confirm", {
      change_set_id: "cs_generic_confirm"
    });

    expect(functionOutputs(socket).at(-1)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIRMATION_NOT_EXPLICIT",
        message: "Confirmation must match the server confirmation phrase: \"Confirm pause delivery.\""
      }
    });
  });

  it("rejects a stale confirmation turn spoken before preview", async () => {
    const socket = new FakeSidebandSocket();
    let now = new Date("2026-05-11T10:00:00Z");
    startRealtimeServerControl({
      apiKey: "sk-server-secret",
      callId: "rtc_stale_confirm_123456",
      now: () => now,
      socketFactory: () => socket
    });

    await emitFunctionCall(socket, "lookup_customer", "call_lookup", {
      customer_id: "CUS_001"
    });
    now = new Date("2026-05-11T10:00:30Z");
    socket.emit("message", JSON.stringify({
      item_id: "item_identity_yes",
      transcript: "Yes.",
      type: "conversation.item.input_audio_transcription.completed"
    }));
    await emitFunctionCall(socket, "create_change_set", "call_create", {
      change_set_id: "cs_stale_confirm",
      operations: [{
        type: "pause_dates",
        dates: ["2026-05-18"],
        reason: "customer_requested"
      }]
    });
    now = new Date("2026-05-11T10:01:00Z");
    await emitFunctionCall(socket, "preview_change_set", "call_preview", {
      change_set_id: "cs_stale_confirm"
    });
    now = new Date("2026-05-11T10:02:00Z");
    await emitFunctionCall(socket, "capture_confirmation", "call_confirm", {
      change_set_id: "cs_stale_confirm"
    });

    expect(functionOutputs(socket).at(-1)).toMatchObject({
      ok: false,
      error: {
        code: "CONFIRMATION_NOT_EXPLICIT",
        message: "Confirmation must come from a user turn after preview."
      }
    });
  });
});

async function emitFunctionCall(
  socket: FakeSidebandSocket,
  toolName: string,
  callId: string,
  args: unknown
): Promise<void> {
  socket.emit("message", JSON.stringify({
    response: {
      output: [{
        arguments: JSON.stringify(args),
        call_id: callId,
        name: toolName,
        type: "function_call"
      }]
    },
    type: "response.done"
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function functionOutputs(socket: FakeSidebandSocket): Array<{
  data?: Record<string, unknown>;
  error?: Record<string, unknown>;
  ok: boolean;
}> {
  return socket.sent.flatMap((message) => {
    const parsed = JSON.parse(message) as {
      item?: { output?: string; type?: string };
      type?: string;
    };
    if (
      parsed.type !== "conversation.item.create" ||
      parsed.item?.type !== "function_call_output" ||
      !parsed.item.output
    ) {
      return [];
    }
    return [JSON.parse(parsed.item.output) as {
      data?: Record<string, unknown>;
      error?: Record<string, unknown>;
      ok: boolean;
    }];
  });
}
