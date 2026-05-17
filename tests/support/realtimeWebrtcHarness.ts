import { vi } from "vitest";
import { createRealtimeWebrtcController } from "../../src/realtime/browser/webrtcController";

export class FakeTrack {
  enabled = true;
  stopped = false;

  stop() {
    this.stopped = true;
  }
}

export class FakeStream {
  constructor(private readonly tracks: FakeTrack[]) {}

  getTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }

  getAudioTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }
}

class FakeDataChannel {
  closed = false;
  label = "oai-events";
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  readonly sentMessages: string[] = [];

  constructor(public readyState: RTCDataChannelState = "open") {}

  close() {
    this.closed = true;
    this.readyState = "closed";
    this.onclose?.();
  }

  send(data: string) {
    this.sentMessages.push(data);
  }
}

export class FakePeerConnection {
  closed = false;
  readonly dataChannel: FakeDataChannel;
  readonly addedTracks: MediaStreamTrack[] = [];
  localDescription?: RTCSessionDescriptionInit;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  remoteDescription?: RTCSessionDescriptionInit;

  constructor(dataChannelReadyState: RTCDataChannelState = "open") {
    this.dataChannel = new FakeDataChannel(dataChannelReadyState);
  }

  addTrack(track: MediaStreamTrack, _stream: MediaStream) {
    this.addedTracks.push(track);
    return {} as RTCRtpSender;
  }

  close() {
    this.closed = true;
  }

  createDataChannel(label: string) {
    this.dataChannel.label = label;
    return this.dataChannel as unknown as RTCDataChannel;
  }

  async createOffer() {
    return { sdp: "v=0\r\ns=mealplan-test", type: "offer" } as const;
  }

  emitRemoteTrack(track: FakeTrack, stream: FakeStream) {
    this.ontrack?.({
      streams: [stream as unknown as MediaStream],
      track: track as unknown as MediaStreamTrack
    } as unknown as RTCTrackEvent);
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
}

export function sdpResponse(location?: string, init: {
  ok?: boolean;
  status?: number;
  statusText?: string;
} = {}) {
  const headers = new Headers();
  if (location) headers.set("Location", location);
  return {
    headers,
    json: async () => ({}),
    ok: init.ok ?? true,
    status: init.status ?? 201,
    statusText: init.statusText ?? "Created",
    text: async () => "v=0\r\ns=openai-answer"
  } as Response;
}

export function createHarness(options: {
  callOk?: boolean;
  callResponse?: Promise<Response>;
  dataChannelReadyState?: RTCDataChannelState;
  location?: string;
} = {}) {
  const localTrack = new FakeTrack();
  const localStream = new FakeStream([localTrack]);
  const pc = new FakePeerConnection(options.dataChannelReadyState);
  const audioElement = { autoplay: false, srcObject: null } as HTMLAudioElement;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/realtime/call") {
      if (options.callResponse) return options.callResponse;
      return sdpResponse(
        options.location ?? "/v1/realtime/calls/rtc_test_123",
        options.callOk === false
          ? { ok: false, status: 502, statusText: "Bad Gateway" }
          : {}
      );
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const controller = createRealtimeWebrtcController({
    fetchImpl,
    mediaDevices: {
      getUserMedia: vi.fn(async () => localStream as unknown as MediaStream)
    },
    peerConnectionFactory: () => pc as unknown as RTCPeerConnection,
    remoteAudioElement: audioElement
  });

  return { audioElement, controller, fetchImpl, localTrack, pc };
}
