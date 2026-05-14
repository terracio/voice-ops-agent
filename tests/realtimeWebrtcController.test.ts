import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeWebrtcController,
  parseRealtimeCallIdFromLocation
} from "../src/browser/realtimeWebrtcController";

class FakeTrack {
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
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
  constructor(public readyState: RTCDataChannelState = "open") {}

  close() {
    this.closed = true;
    this.readyState = "closed";
    this.onclose?.();
  }
}

class FakePeerConnection {
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

function sdpResponse(location?: string, init: {
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

function createHarness(options: {
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

describe("Realtime WebRTC browser controller", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses rtc call ids from Realtime Location headers", () => {
    expect(
      parseRealtimeCallIdFromLocation(
        "https://api.openai.com/v1/realtime/calls/rtc_abc123?x=1"
      )
    ).toBe("rtc_abc123");
    expect(parseRealtimeCallIdFromLocation("/calls/not-a-call")).toBeNull();
  });

  it("starts a WebRTC session through the server-mediated SDP exchange", async () => {
    const { controller, fetchImpl, pc } = createHarness();
    const states: string[] = [];
    controller.subscribe((event) => {
      if (event.type === "state") states.push(event.state);
    });

    await controller.start();
    const calls = fetchImpl.mock.calls as unknown as [
      RequestInfo | URL,
      RequestInit | undefined
    ][];

    expect(states).toEqual(["connecting", "listening"]);
    expect(controller.callId).toBe("rtc_test_123");
    expect(controller.state).toBe("listening");
    expect(pc.addedTracks).toHaveLength(1);
    expect(pc.dataChannel.label).toBe("oai-events");
    expect(pc.localDescription?.type).toBe("offer");
    expect(pc.remoteDescription).toEqual({
      sdp: "v=0\r\ns=openai-answer",
      type: "answer"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0]?.[0]).toBe("/api/realtime/call");
    expect(calls[0]?.[1]).toMatchObject({
      body: "v=0\r\ns=mealplan-test",
      headers: {
        "Content-Type": "application/sdp"
      },
      method: "POST"
    });
  });

  it("cleans up when the server SDP response misses a call id", async () => {
    const { controller, fetchImpl, localTrack, pc } = createHarness({
      location: "/v1/realtime/calls/nope"
    });

    await expect(controller.start()).rejects.toThrow("Realtime call id");

    expect(controller.state).toBe("error");
    expect(controller.callId).toBeUndefined();
    expect(localTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(pc.dataChannel.closed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cleans up when the server SDP exchange fails", async () => {
    const { controller, fetchImpl, localTrack, pc } = createHarness({
      callOk: false
    });

    await expect(controller.start()).rejects.toThrow("SDP exchange failed");

    expect(controller.state).toBe("error");
    expect(localTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(pc.dataChannel.closed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("includes server SDP exchange error details", async () => {
    const { controller } = createHarness({
      callResponse: Promise.resolve(new Response(
        "{\"message\":\"OpenAI rejected the SDP offer\"}",
        { status: 502, statusText: "Bad Gateway" }
      ))
    });

    await expect(controller.start()).rejects.toThrow(
      "OpenAI rejected the SDP offer"
    );
  });

  it("does not reactivate when stopped during async start", async () => {
    let resolveCall!: (response: Response) => void;
    const callResponse = new Promise<Response>((resolve) => {
      resolveCall = resolve;
    });
    const { controller, fetchImpl, localTrack, pc } = createHarness({
      callResponse
    });

    const startPromise = controller.start();
    for (let step = 0; step < 5 && fetchImpl.mock.calls.length === 0; step += 1) {
      await Promise.resolve();
    }
    expect(fetchImpl).toHaveBeenCalledWith("/api/realtime/call", expect.anything());
    controller.stop();
    resolveCall(sdpResponse("/v1/realtime/calls/rtc_test_123"));

    await expect(startPromise).rejects.toThrow("start was cancelled");
    expect(controller.state).toBe("ended");
    expect(localTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps ended state when stopped while waiting for the data channel", async () => {
    const { controller, fetchImpl, localTrack, pc } = createHarness({
      dataChannelReadyState: "connecting"
    });

    const startPromise = controller.start();
    for (let step = 0; step < 5 && fetchImpl.mock.calls.length === 0; step += 1) {
      await Promise.resolve();
    }

    controller.stop();

    await expect(startPromise).rejects.toThrow("start was cancelled");
    expect(controller.state).toBe("ended");
    expect(localTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
  });

  it("mutes local audio tracks without closing the active session", async () => {
    const { controller, fetchImpl, localTrack, pc } = createHarness();
    await controller.start();

    controller.setMuted(true);
    expect(localTrack.enabled).toBe(false);
    controller.setMuted(false);

    expect(localTrack.enabled).toBe(true);
    expect(pc.closed).toBe(false);
    expect(pc.dataChannel.closed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps Realtime data channel messages into UI states", async () => {
    const { controller, pc } = createHarness();
    const states: string[] = [];
    controller.subscribe((event) => {
      if (event.type === "state") states.push(event.state);
    });
    await controller.start();

    pc.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "response.audio.delta" })
    } as MessageEvent<string>);
    pc.dataChannel.onmessage?.({
      data: JSON.stringify({
        item: { type: "function_call" },
        type: "conversation.item.created"
      })
    } as MessageEvent<string>);
    pc.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "change_set.preview" })
    } as MessageEvent<string>);
    pc.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "response.done" })
    } as MessageEvent<string>);

    expect(states).toEqual([
      "connecting",
      "listening",
      "speaking",
      "tool-running",
      "waiting-for-confirmation",
      "listening"
    ]);
  });

  it("stops data channel, peer connection, media tracks, and remote audio", async () => {
    const { audioElement, controller, localTrack, pc } = createHarness();
    const remoteTrack = new FakeTrack();
    const remoteStream = new FakeStream([remoteTrack]);
    await controller.start();
    pc.emitRemoteTrack(remoteTrack, remoteStream);

    controller.stop();

    expect(controller.state).toBe("ended");
    expect(controller.callId).toBeUndefined();
    expect(localTrack.stopped).toBe(true);
    expect(remoteTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(pc.dataChannel.closed).toBe(true);
    expect(audioElement.srcObject).toBeNull();
  });

  it("keeps browser controller imports free of server-only modules", () => {
    const source = [
      "../src/browser/index.ts",
      "../src/browser/realtimeWebrtcController.ts",
      "../src/browser/realtimeWebrtcEvents.ts"
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("realtimeTools");
    expect(source).not.toContain("../domain/");
    expect(source).not.toContain("../tools/");
  });
});
