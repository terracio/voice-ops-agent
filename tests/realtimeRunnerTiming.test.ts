import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForRealtimeTurnComplete } from "../src/agent/realtimeRunnerTiming";
import type { RealtimeSessionLike } from "../src/agent/realtimeRunnerTypes";

class TimingSession implements RealtimeSessionLike {
  readonly close = vi.fn();
  readonly connect = vi.fn(async () => undefined);
  readonly sendAudio = vi.fn();
  readonly sendMessage = vi.fn();
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  on(eventName: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(...args);
    }
  }
}

describe("Realtime runner timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a quiet window after a terminal event", async () => {
    vi.useFakeTimers();
    const session = new TimingSession();
    const completion = waitForRealtimeTurnComplete({
      session,
      quietMs: 100,
      timeoutMs: 1_000
    });
    let settled = false;
    completion.then(() => {
      settled = true;
    });

    session.emit("transport_event", { type: "response.done" });
    await vi.advanceTimersByTimeAsync(90);
    expect(settled).toBe(false);

    session.emit("transport_event", { type: "response.created" });
    await vi.advanceTimersByTimeAsync(90);
    expect(settled).toBe(false);

    session.emit("agent_tool_start");
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);

    session.emit("agent_tool_end");
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);

    session.emit("transport_event", { type: "response.done" });
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(completion).resolves.toBe("completed");
  });

  it("stays bounded when no terminal event arrives", async () => {
    vi.useFakeTimers();
    const session = new TimingSession();
    const completion = waitForRealtimeTurnComplete({
      session,
      quietMs: 100,
      timeoutMs: 1_000
    });

    session.emit("transport_event", { type: "response.created" });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(completion).resolves.toBe("timed_out");
  });
});
