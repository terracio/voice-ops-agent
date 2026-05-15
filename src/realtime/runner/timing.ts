import type {
  RealtimeRunnerStatus,
  RealtimeSessionLike
} from "./types";

export type RealtimeTurnCompletionOptions = {
  quietMs?: number;
  session: RealtimeSessionLike;
  timeoutMs: number;
};

const TERMINAL_EVENT_TYPES = new Set(["response.done", "turn_done"]);

export function waitForRealtimeTurnComplete(
  options: RealtimeTurnCompletionOptions
): Promise<Exclude<RealtimeRunnerStatus, "skipped">> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let terminalObserved = false;
    const quietMs = options.quietMs ?? 0;
    const timeoutTimer = setTimeout(() => finish("timed_out"), options.timeoutMs);

    function clearQuietTimer(): void {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = undefined;
    }

    function finish(status: Exclude<RealtimeRunnerStatus, "skipped">): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearQuietTimer();
      resolve(status);
    }

    function markActivity(eventType?: string): void {
      if (settled) return;
      if (eventType === "error") {
        finish("failed");
        return;
      }
      if (terminalObserved) clearQuietTimer();
      if (eventType === "response.created" || eventType === "agent_tool_start") {
        terminalObserved = false;
      }
      if (eventType && TERMINAL_EVENT_TYPES.has(eventType)) {
        terminalObserved = true;
      }
      if (!terminalObserved) return;
      if (quietMs <= 0) {
        finish("completed");
        return;
      }
      quietTimer = setTimeout(() => finish("completed"), quietMs);
    }

    options.session.on("transport_event", (event) => {
      if (typeof event !== "object" || event === null || !("type" in event)) {
        markActivity();
        return;
      }
      markActivity(String(event.type));
    });
    options.session.on("agent_tool_start", () => markActivity("agent_tool_start"));
    options.session.on("agent_tool_end", () => markActivity("agent_tool_end"));
    options.session.on("error", () => finish("failed"));
  });
}
