import { describe, expect, it } from "vitest";
import { createBrowserRingbackTone } from "../src/realtime/browser/ringback";

class FakeAudioParam {
  value = 0;

  linearRampToValueAtTime(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number) {
    this.value = value;
  }
}

class FakeNode {
  connected = false;
  disconnected = false;

  connect() {
    this.connected = true;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeOscillator extends FakeNode {
  frequency = new FakeAudioParam();
  started = false;
  stopped = false;
  type: OscillatorType = "sine";

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  closed = false;
  currentTime = 0;
  destination = {};
  readonly gain = new FakeGain();
  readonly oscillators: FakeOscillator[] = [];
  resumed = false;

  async close() {
    this.closed = true;
  }

  createGain() {
    return this.gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  async resume() {
    this.resumed = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}

describe("browser ringback tone", () => {
  it("starts generated local audio and stops all resources", () => {
    const context = new FakeAudioContext();
    const ringback = createBrowserRingbackTone({
      audioContextFactory: () => context
    });

    ringback.start();
    ringback.start();

    expect(context.gain.connected).toBe(true);
    expect(context.gain.gain.value).toBeGreaterThan(0);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.value))
      .toEqual([440, 480]);
    expect(context.oscillators.every((oscillator) => oscillator.started)).toBe(true);

    ringback.stop();
    ringback.stop();

    expect(context.gain.gain.value).toBe(0);
    expect(context.gain.disconnected).toBe(true);
    expect(context.oscillators.every((oscillator) => oscillator.stopped)).toBe(true);
    expect(context.closed).toBe(true);
  });

  it("fails silently when browser audio setup is unavailable", () => {
    const ringback = createBrowserRingbackTone({
      audioContextFactory: () => {
        throw new Error("audio unavailable");
      }
    });

    expect(() => ringback.start()).not.toThrow();
    expect(() => ringback.stop()).not.toThrow();
  });
});
