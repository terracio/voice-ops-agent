export type RingbackTone = {
  start(): void;
  stop(): void;
};

export type RingbackToneFactory = () => RingbackTone;

type RingbackAudioParam = {
  value: number;
  linearRampToValueAtTime?: (value: number, endTime: number) => void;
  setValueAtTime?: (value: number, startTime: number) => void;
};

type RingbackAudioNode = {
  connect(destination: unknown): void;
  disconnect?(): void;
};

type RingbackOscillator = RingbackAudioNode & {
  frequency: RingbackAudioParam;
  start(): void;
  stop(): void;
  type: OscillatorType;
};

type RingbackGain = RingbackAudioNode & {
  gain: RingbackAudioParam;
};

type RingbackAudioContext = {
  close?: () => Promise<void>;
  createGain(): RingbackGain;
  createOscillator(): RingbackOscillator;
  currentTime: number;
  destination: unknown;
  resume?: () => Promise<void>;
};

export type BrowserRingbackToneOptions = {
  audioContextFactory?: () => RingbackAudioContext;
};

const RINGBACK_GAIN = 0.045;
const RINGBACK_OFF_MS = 3200;
const RINGBACK_ON_MS = 1800;

export function createBrowserRingbackTone(
  options: BrowserRingbackToneOptions = {}
): RingbackTone {
  return new BrowserRingbackTone(options);
}

class BrowserRingbackTone implements RingbackTone {
  private context?: RingbackAudioContext;
  private gain?: RingbackGain;
  private oscillators: RingbackOscillator[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: BrowserRingbackToneOptions) {}

  start(): void {
    if (this.context) return;

    try {
      const context = this.options.audioContextFactory?.() ?? createAudioContext();
      if (!context) return;

      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);

      const oscillators = [440, 480].map((frequency) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });

      this.context = context;
      this.gain = gain;
      this.oscillators = oscillators;
      void context.resume?.().catch(() => undefined);
      this.scheduleCadence(true);
    } catch {
      this.stop();
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.setToneEnabled(false);
    this.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
        oscillator.disconnect?.();
      } catch {
        // Ringback is best-effort UI feedback.
      }
    });
    this.oscillators = [];
    this.gain?.disconnect?.();
    const context = this.context;
    this.context = undefined;
    this.gain = undefined;
    void context?.close?.().catch(() => undefined);
  }

  private scheduleCadence(enabled: boolean): void {
    this.setToneEnabled(enabled);
    this.timer = setTimeout(
      () => this.scheduleCadence(!enabled),
      enabled ? RINGBACK_ON_MS : RINGBACK_OFF_MS
    );
  }

  private setToneEnabled(enabled: boolean): void {
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain) return;
    const value = enabled ? RINGBACK_GAIN : 0;
    gain.gain.setValueAtTime?.(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime?.(value, context.currentTime + 0.03);
    gain.gain.value = value;
  }
}

function createAudioContext(): RingbackAudioContext | null {
  const constructors = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    globalThis.AudioContext ?? constructors.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  return new AudioContextConstructor() as unknown as RingbackAudioContext;
}
