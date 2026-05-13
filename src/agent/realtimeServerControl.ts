import WebSocket from "ws";
import { z } from "zod";
import type { ToolRegistry } from "../tools/registry";
import type { ToolResult } from "../domain/schema";
import { createMealPlanToolRegistry } from "../tools/mealplanRegistry";
import {
  applyRealtimeToolResultToSessionState,
  buildRealtimeToolContext,
  createRealtimeSessionState,
  createRealtimeToolContextBase
} from "./realtimeSessionState";
import {
  createServerRealtimeSessionUpdate,
  type ServerRealtimeSessionUpdate
} from "./realtimeBrowserSession";
import { mealPlanRealtimeTools } from "./realtimeTools";

export const OPENAI_REALTIME_SIDEBAND_URL =
  "wss://api.openai.com/v1/realtime";

export const RealtimeCallIdSchema = z
  .string()
  .regex(/^rtc_[A-Za-z0-9_-]{6,}$/);

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

export type RealtimeSidebandSocketFactory = (
  url: string,
  options: { headers: Record<string, string> }
) => RealtimeSidebandSocket;

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

export class RealtimeServerControlError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_CALL_ID" | "MISSING_OPENAI_API_KEY" | "SIDEBAND_OPEN_FAILED",
    readonly status: number
  ) {
    super(message);
  }
}

function defaultSocketFactory(
  url: string,
  options: { headers: Record<string, string> }
): RealtimeSidebandSocket {
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
  if (event.type === "response.function_call_arguments.done") {
    if (
      typeof event.name !== "string" ||
      typeof event.call_id !== "string"
    ) {
      return [];
    }
    return [{
      name: event.name,
      call_id: event.call_id,
      arguments: event.arguments
    }];
  }

  const output =
    event.type === "response.done" &&
    isRecord(event.response) &&
    Array.isArray(event.response.output)
      ? event.response.output
      : event.type === "response.output_item.done" && isRecord(event.item)
        ? [event.item]
        : [];

  return output
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

function sendSessionUpdate(
  socket: RealtimeSidebandSocket,
  update: ServerRealtimeSessionUpdate
): void {
  socket.send(JSON.stringify(update));
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
  socket: RealtimeSidebandSocket;
  toolContext: ReturnType<typeof buildRealtimeToolContext>;
}): Promise<ToolResult<unknown>> {
  const result = await options.registry.execute(options.call.name, {
    modelArgs: normalizeToolInput(options.call.arguments),
    context: options.toolContext
  });

  options.socket.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: options.call.call_id,
      output: JSON.stringify(result)
    }
  }));
  options.socket.send(JSON.stringify({ type: "response.create" }));
  return result;
}

export function startRealtimeServerControl(options: {
  apiKey?: string;
  callId: unknown;
  now?: () => Date;
  registry?: ToolRegistry;
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
  const toolContextBase = createRealtimeToolContextBase({
    lastUserMessage: "Browser realtime session.",
    now,
    runId: `browser_${callId}`,
    sessionId: callId,
    userTurnId: `${callId}_turn`
  });

  let socket: RealtimeSidebandSocket;
  try {
    socket = socketFactory(
      `${OPENAI_REALTIME_SIDEBAND_URL}?call_id=${encodeURIComponent(callId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch {
    throw new RealtimeServerControlError(
      "Unable to open Realtime sideband control connection.",
      "SIDEBAND_OPEN_FAILED",
      502
    );
  }

  socket.on("open", () => {
    sendSessionUpdate(socket, createServerRealtimeSessionUpdate());
  });
  socket.on("error", () => {
    clearActiveControl(callId, socket);
  });
  socket.on("close", () => {
    clearActiveControl(callId, socket);
  });
  socket.on("message", (rawMessage) => {
    const parsed = parseRealtimeSocketMessage(rawMessage);
    for (const call of extractFunctionCalls(parsed)) {
      if (processedFunctionCallIds.has(call.call_id)) {
        continue;
      }
      processedFunctionCallIds.add(call.call_id);

      const toolContext = buildRealtimeToolContext({
        base: toolContextBase,
        state: sessionState
      });
      void executeFunctionCall({ call, registry, socket, toolContext }).then(
        (result) => {
          applyRealtimeToolResultToSessionState({
            result,
            state: sessionState,
            toolName: call.name
          });
        }
      );
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
  const text =
    typeof rawMessage === "string"
      ? rawMessage
      : rawMessage instanceof Buffer
        ? rawMessage.toString("utf8")
        : undefined;
  if (!text) return rawMessage;
  try {
    return JSON.parse(text);
  } catch {
    return rawMessage;
  }
}
