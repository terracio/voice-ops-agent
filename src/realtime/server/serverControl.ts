import { createRequire } from "node:module";
import { z } from "zod";
import type { ToolRegistry } from "../../tools/registry";
import type { ToolResult } from "../../domain/schema";
import { createMealPlanToolRegistry } from "../../tools/mealplanRegistry";
import { applyRealtimeToolResultToSessionState, applyRealtimeTranscriptEventToSessionState, buildRealtimeToolContext, createRealtimeSessionState, createRealtimeToolContextBase } from "./sessionState";
import { createServerRealtimeSessionUpdate } from "./browserSession";
import { resolveRealtimeSidebandUrl } from "./sidebandUrl";
import { mealPlanRealtimeTools } from "../config/tools";
import { beginRealtimeEvidenceRun, finishRealtimeEvidenceRun, recordRealtimeEvidenceEvent, recordRealtimeToolResult, recordRealtimeToolStart, recordRealtimeTransportEvidence } from "../../evidence";

export const RealtimeCallIdSchema = z.string().regex(/^rtc_[A-Za-z0-9_-]{6,}$/);

export type RealtimeServerControlStatus = "connecting";

export type RealtimeServerControlResponse = {
  call_id: string;
  control_id: string;
  server_controls: {
    function_outputs: "server_side_only";
    mode: "sideband";
    tool_count: number;
    tools: "server_side_only";
  };
  status: RealtimeServerControlStatus;
};

export type RealtimeSidebandSocket = {
  close?: () => void;
  on: (eventName: string, handler: (...args: unknown[]) => void) => void;
  send: (data: string) => void;
};

export type RealtimeSidebandSocketFactory = (url: string, options: { headers: Record<string, string> }) => RealtimeSidebandSocket;

type FunctionCall = {
  arguments: unknown;
  call_id: string;
  name: string;
};

type ActiveControl = {
  call_id: string;
  control_id: string;
  processed_function_call_ids: Set<string>;
  socket: RealtimeSidebandSocket;
};

const activeControls = new Map<string, ActiveControl>();
const nodeRequire = createRequire(import.meta.url);

export class RealtimeServerControlError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_CALL_ID" | "MISSING_OPENAI_API_KEY" | "SIDEBAND_OPEN_FAILED",
    readonly status: number
  ) {
    super(message);
  }
}

function defaultSocketFactory(url: string, options: { headers: Record<string, string> }): RealtimeSidebandSocket {
  process.env.WS_NO_BUFFER_UTIL ??= "1";
  const { WebSocket } = nodeRequire("ws") as typeof import("ws");
  return new WebSocket(url, options);
}

function resolveApiKey(apiKey?: string): string {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new RealtimeServerControlError(
      "Missing OPENAI_API_KEY for Realtime server control.",
      "MISSING_OPENAI_API_KEY",
      500
    );
  }
  return trimmed;
}

function parseCallId(callId: unknown): string {
  const parsed = RealtimeCallIdSchema.safeParse(callId);
  if (!parsed.success) {
    throw new RealtimeServerControlError(
      "Invalid Realtime call_id. Expected an rtc_... identifier.",
      "INVALID_CALL_ID",
      400
    );
  }
  return parsed.data;
}

function normalizeToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFunctionCalls(event: unknown): FunctionCall[] {
  if (!isRecord(event)) return [];
  if (
    event.type !== "response.done" ||
    !isRecord(event.response) ||
    !Array.isArray(event.response.output)
  ) {
    return [];
  }

  return event.response.output
    .filter((item): item is Record<string, unknown> => {
      return isRecord(item) && item.type === "function_call";
    })
    .flatMap((item) => {
      if (
        typeof item.name !== "string" ||
        typeof item.call_id !== "string"
      ) {
        return [];
      }
      return [{
        name: item.name,
        call_id: item.call_id,
        arguments: item.arguments
      }];
    });
}

function controlResponse(control: Pick<ActiveControl, "call_id" | "control_id">): RealtimeServerControlResponse {
  return {
    call_id: control.call_id,
    control_id: control.control_id,
    status: "connecting",
    server_controls: {
      mode: "sideband",
      tools: "server_side_only",
      function_outputs: "server_side_only",
      tool_count: mealPlanRealtimeTools.length
    }
  };
}

function clearActiveControl(callId: string, socket: RealtimeSidebandSocket): void {
  if (activeControls.get(callId)?.socket === socket) {
    activeControls.delete(callId);
  }
}

async function executeFunctionCall(options: {
  call: FunctionCall;
  registry: ToolRegistry;
  toolContext: ReturnType<typeof buildRealtimeToolContext>;
}): Promise<ToolResult<unknown>> {
  return options.registry.execute(options.call.name, {
    modelArgs: normalizeToolInput(options.call.arguments),
    context: options.toolContext
  });
}

function sendFunctionCallResult(
  socket: RealtimeSidebandSocket,
  callId: string,
  result: ToolResult<unknown>
): void {
  socket.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result)
    }
  }));
  socket.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
}

export function startRealtimeServerControl(options: {
  apiKey?: string;
  callId: unknown;
  now?: () => Date;
  registry?: ToolRegistry;
  sidebandUrl?: unknown;
  socketFactory?: RealtimeSidebandSocketFactory;
}): RealtimeServerControlResponse {
  const callId = parseCallId(options.callId);
  const existingControl = activeControls.get(callId);
  if (existingControl) {
    return controlResponse(existingControl);
  }

  const apiKey = resolveApiKey(options.apiKey ?? process.env.OPENAI_API_KEY);
  const socketFactory = options.socketFactory ?? defaultSocketFactory;
  const controlId = `rt_control_${callId}`;
  const registry = options.registry ?? createMealPlanToolRegistry();
  const processedFunctionCallIds = new Set<string>();
  const sessionState = createRealtimeSessionState();
  const now = options.now ?? (() => new Date());
  const runId = `browser_${callId}`;
  const toolContextBase = createRealtimeToolContextBase({
    lastUserMessage: "Browser realtime session.",
    now,
    runId,
    sessionId: callId,
    userTurnId: `${callId}_turn`
  });

  let socket: RealtimeSidebandSocket;
  try {
    socket = socketFactory(
      resolveRealtimeSidebandUrl({ callId, sidebandUrl: options.sidebandUrl }),
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch {
    throw new RealtimeServerControlError(
      "Unable to open Realtime sideband control connection.",
      "SIDEBAND_OPEN_FAILED",
      502
    );
  }

  beginRealtimeEvidenceRun({ callId, runId, now });
  socket.on("open", () => {
    recordRealtimeEvidenceEvent({
      callId,
      eventType: "sideband.open",
      label: "Realtime sideband opened",
      now
    });
    socket.send(JSON.stringify(createServerRealtimeSessionUpdate()));
  });
  socket.on("error", (error) => {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    recordRealtimeEvidenceEvent({
      callId,
      eventType: "sideband.error",
      label: `Realtime sideband error${detail}`,
      now,
      severity: "error"
    });
    finishRealtimeEvidenceRun({ callId, now, status: "error" });
    clearActiveControl(callId, socket);
  });
  socket.on("close", () => {
    recordRealtimeEvidenceEvent({
      callId,
      eventType: "sideband.close",
      label: "Realtime sideband closed",
      now
    });
    finishRealtimeEvidenceRun({ callId, now, status: "ended" });
    clearActiveControl(callId, socket);
  });
  socket.on("message", (rawMessage) => {
    const parsed = parseRealtimeSocketMessage(rawMessage);
    recordRealtimeTransportEvidence({ callId, event: parsed, now });
    applyRealtimeTranscriptEventToSessionState({
      event: parsed,
      fallbackTurnId: `${callId}_turn`,
      now,
      state: sessionState
    });
    for (const call of extractFunctionCalls(parsed)) {
      if (processedFunctionCallIds.has(call.call_id)) {
        continue;
      }
      processedFunctionCallIds.add(call.call_id);
      const modelArgs = normalizeToolInput(call.arguments);
      const risk = registry.get(call.name)?.risk ?? "read";
      recordRealtimeToolStart({
        callId,
        input: modelArgs,
        now,
        risk,
        toolCallId: call.call_id,
        toolName: call.name
      });

      const toolContext = buildRealtimeToolContext({
        base: toolContextBase,
        now,
        state: sessionState
      });
      void executeFunctionCall({ call, registry, toolContext }).then(
        (result) => {
          recordRealtimeToolResult({
            callId,
            input: modelArgs,
            now,
            result,
            risk,
            runId,
            toolCallId: call.call_id,
            toolName: call.name
          });
          applyRealtimeToolResultToSessionState({
            result,
            state: sessionState,
            toolContext,
            toolName: call.name
          });
          sendFunctionCallResult(socket, call.call_id, result);
        }
      ).catch((error: unknown) => {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
        recordRealtimeEvidenceEvent({
          callId,
          eventType: "tool.execution_error",
          label: `Realtime tool execution failed${detail}`,
          now,
          severity: "error"
        });
      });
    }
  });

  const control = {
    call_id: callId,
    control_id: controlId,
    processed_function_call_ids: processedFunctionCallIds,
    socket
  };
  activeControls.set(callId, control);
  return controlResponse(control);
}

export function getRealtimeServerControl(callId: string): ActiveControl | undefined {
  return activeControls.get(callId);
}

function parseRealtimeSocketMessage(rawMessage: unknown): unknown {
  const text = typeof rawMessage === "string" ? rawMessage : rawMessage instanceof Buffer ? rawMessage.toString("utf8") : undefined;
  if (!text) return rawMessage;
  try {
    return JSON.parse(text);
  } catch {
    return rawMessage;
  }
}
