import { describe, expect, it, vi } from "vitest";
import {
  createRealtimeWebrtcController,
  REALTIME_MIC_CONSTRAINTS
} from "../src/browser/realtimeWebrtcController";

class FakeTrack {
  enabled = true;
  stop() {}
}

class FakeStream {
  private readonly track = new FakeTrack();
  getAudioTracks() {
    return [this.track] as unknown as MediaStreamTrack[];
  }
  getTracks() {
    return [this.track] as unknown as MediaStreamTrack[];
  }
}

class FakePeerConnection {
  addTrack() {
    return {} as RTCRtpSender;
  }
  close() {}
  createDataChannel() {
    return { close() {}, readyState: "open" } as RTCDataChannel;
  }
  async createOffer() {
    return { sdp: "v=0\r\ns=test-offer", type: "offer" } as const;
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
}

describe("Realtime WebRTC audio capture", () => {
  it("requests browser echo cancellation for assistant speaker playback", async () => {
    const getUserMedia = vi.fn(async () => new FakeStream() as unknown as MediaStream);
    const controller = createRealtimeWebrtcController({
      fetchImpl: vi.fn(async () => sdpResponse()),
      mediaDevices: { getUserMedia },
      peerConnectionFactory: () =>
        new FakePeerConnection() as unknown as RTCPeerConnection
    });

    await controller.start();

    expect(getUserMedia).toHaveBeenCalledWith(REALTIME_MIC_CONSTRAINTS);
    expect(REALTIME_MIC_CONSTRAINTS).toMatchObject({
      audio: {
        autoGainControl: { ideal: true },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true }
      }
    });
  });
});

function sdpResponse(): Response {
  return new Response("v=0\r\ns=openai-answer", {
    headers: { Location: "/v1/realtime/calls/rtc_audio_constraints" },
    status: 201,
    statusText: "Created"
  });
}
