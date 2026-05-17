import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRealtimeCallIdFromLocation } from "../src/realtime/browser/webrtcController";
import {
  createHarness,
  FakeStream,
  FakeTrack,
  sdpResponse
} from "./support/realtimeWebrtcHarness";

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

  it("requests exactly one initial audio greeting after the data channel opens", async () => {
    const { controller, pc } = createHarness();
    const greetingEvents: string[] = [];
    controller.subscribe((event) => {
      if (event.type === "greeting-requested") greetingEvents.push(event.type);
    });

    await controller.start();
    pc.dataChannel.onmessage?.({
      data: JSON.stringify({ type: "response.done" })
    } as MessageEvent<string>);

    const sent = pc.dataChannel.sentMessages.map((message) =>
      JSON.parse(message) as {
        response?: {
          instructions?: string;
          output_modalities?: string[];
          tool_choice?: string;
          tools?: unknown[];
        };
        type?: string;
      }
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      response: {
        instructions:
          "Greet the caller as MealPlan, then ask how you can help today.",
        output_modalities: ["audio"],
        tool_choice: "none",
        tools: []
      },
      type: "response.create"
    });
    expect(greetingEvents).toEqual(["greeting-requested"]);
  });

  it("keeps startup connected when the optional initial greeting send fails", async () => {
    const { controller, localTrack, pc } = createHarness({
      dataChannelSendError: new Error("greeting send failed")
    });
    const greetingEvents: string[] = [];
    const states: string[] = [];
    controller.subscribe((event) => {
      if (event.type === "greeting-requested") greetingEvents.push(event.type);
      if (event.type === "state") states.push(event.state);
    });

    await controller.start();

    expect(states).toEqual(["connecting", "listening"]);
    expect(controller.state).toBe("listening");
    expect(controller.callId).toBe("rtc_test_123");
    expect(greetingEvents).toEqual([]);
    expect(pc.dataChannel.sentMessages).toEqual([]);
    expect(localTrack.stopped).toBe(false);
    expect(pc.closed).toBe(false);
    expect(pc.dataChannel.closed).toBe(false);
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
    expect(pc.dataChannel.sentMessages).toEqual([]);
    expect(localTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
  });

  it("does not request a greeting when the data channel fails before opening", async () => {
    const { controller, fetchImpl, pc } = createHarness({
      dataChannelReadyState: "connecting"
    });

    const startPromise = controller.start();
    for (let step = 0; step < 5 && fetchImpl.mock.calls.length === 0; step += 1) {
      await Promise.resolve();
    }
    pc.dataChannel.onerror?.({} as Event);

    await expect(startPromise).rejects.toThrow("before opening");
    expect(controller.state).toBe("error");
    expect(pc.dataChannel.sentMessages).toEqual([]);
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

  it("does not treat Realtime API error events as fatal browser state", async () => {
    const { controller, pc } = createHarness();
    const states: string[] = [];
    const messages: unknown[] = [];
    controller.subscribe((event) => {
      if (event.type === "state") states.push(event.state);
      if (event.type === "message") messages.push(event.message);
    });
    await controller.start();

    pc.dataChannel.onmessage?.({
      data: JSON.stringify({
        type: "error",
        error: {
          code: "invalid_request_error",
          message: "Tool output was rejected."
        }
      })
    } as MessageEvent<string>);

    expect(controller.state).toBe("listening");
    expect(controller.callId).toBe("rtc_test_123");
    expect(states).toEqual(["connecting", "listening"]);
    expect(messages).toContainEqual(expect.objectContaining({
      type: "error"
    }));
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

  it("cleans up media and peer resources on data channel errors", async () => {
    const { audioElement, controller, localTrack, pc } = createHarness();
    const remoteTrack = new FakeTrack();
    const remoteStream = new FakeStream([remoteTrack]);
    await controller.start();
    pc.emitRemoteTrack(remoteTrack, remoteStream);

    pc.dataChannel.onerror?.({} as Event);

    expect(controller.state).toBe("error");
    expect(controller.callId).toBeUndefined();
    expect(localTrack.stopped).toBe(true);
    expect(remoteTrack.stopped).toBe(true);
    expect(pc.closed).toBe(true);
    expect(pc.dataChannel.closed).toBe(true);
    expect(audioElement.srcObject).toBeNull();
  });

  it("keeps browser controller imports free of server-only modules", () => {
    const source = [
      "../src/realtime/browser/webrtcController.ts",
      "../src/realtime/browser/webrtcEvents.ts"
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("realtimeTools");
    expect(source).not.toContain("../domain/");
    expect(source).not.toContain("../tools/");
  });
});
