import { describe, expect, it } from "vitest";
import { waitForRealtimeDataChannelOpen } from "../src/browser/realtimeDataChannel";

class FakeDataChannel {
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly readyState: RTCDataChannelState) {}
}

describe("Realtime data channel handoff timing", () => {
  it("waits until the data channel is open before continuing", async () => {
    const channel = new FakeDataChannel("connecting");
    const wait = waitForRealtimeDataChannelOpen(
      channel as unknown as RTCDataChannel
    );

    channel.onopen?.(new Event("open"));

    await expect(wait).resolves.toBeUndefined();
  });

  it("rejects if the data channel closes before opening", async () => {
    const channel = new FakeDataChannel("connecting");
    const wait = waitForRealtimeDataChannelOpen(
      channel as unknown as RTCDataChannel
    );

    channel.onclose?.(new Event("close"));

    await expect(wait).rejects.toThrow("closed before opening");
  });

  it("rejects if the data channel never opens", async () => {
    const channel = new FakeDataChannel("connecting");
    const wait = waitForRealtimeDataChannelOpen(
      channel as unknown as RTCDataChannel,
      1
    );

    await expect(wait).rejects.toThrow("timed out before opening");
  });
});
