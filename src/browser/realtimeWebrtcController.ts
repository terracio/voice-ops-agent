import {
  DEFAULT_REALTIME_CALL_ENDPOINT,
  REALTIME_EVENTS_CHANNEL,
  normalizeRealtimeError,
  parseRealtimeCallIdFromLocation,
  parseRealtimeMessageData,
  stateFromRealtimeBrowserEvent,
  type RealtimeWebrtcControllerEvent,
  type RealtimeWebrtcControllerListener,
  type RealtimeWebrtcControllerState
} from "./realtimeWebrtcEvents";
import { waitForRealtimeDataChannelOpen } from "./realtimeDataChannel";

export {
  DEFAULT_REALTIME_CALL_ENDPOINT,
  REALTIME_EVENTS_CHANNEL,
  parseRealtimeCallIdFromLocation,
  stateFromRealtimeBrowserEvent,
  type RealtimeWebrtcControllerEvent,
  type RealtimeWebrtcControllerListener,
  type RealtimeWebrtcControllerState
} from "./realtimeWebrtcEvents";

export type RealtimeWebrtcController = {
  readonly callId: string | undefined;
  readonly muted: boolean;
  readonly remoteStream: MediaStream | undefined;
  readonly state: RealtimeWebrtcControllerState;
  reset(): void;
  setMuted(muted: boolean): void;
  start(): Promise<void>;
  stop(): void;
  subscribe(listener: RealtimeWebrtcControllerListener): () => void;
  toggleMuted(): boolean;
};

export type RealtimeWebrtcControllerOptions = {
  callEndpoint?: string;
  fetchImpl?: typeof fetch;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  peerConnectionFactory?: () => RTCPeerConnection;
  remoteAudioElement?: HTMLAudioElement;
};

const ACTIVE_STATES = new Set<RealtimeWebrtcControllerState>([
  "connecting",
  "listening",
  "speaking",
  "tool-running",
  "waiting-for-confirmation"
]);

class RealtimeStartCancelledError extends Error {
  constructor() {
    super("Realtime WebRTC session start was cancelled.");
  }
}

export function createRealtimeWebrtcController(
  options: RealtimeWebrtcControllerOptions = {}
): RealtimeWebrtcController {
  return new BrowserRealtimeWebrtcController(options);
}

class BrowserRealtimeWebrtcController implements RealtimeWebrtcController {
  private readonly callEndpoint: string;
  private dataChannel?: RTCDataChannel;
  private readonly fetchImpl: typeof fetch;
  private readonly listeners = new Set<RealtimeWebrtcControllerListener>();
  private localStream?: MediaStream;
  private readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  private mutedValue = false;
  private peerConnection?: RTCPeerConnection;
  private readonly peerConnectionFactory?: () => RTCPeerConnection;
  private realtimeCallId?: string;
  private readonly remoteAudioElement?: HTMLAudioElement;
  private remoteStreamValue?: MediaStream;
  private startGeneration = 0;
  private stateValue: RealtimeWebrtcControllerState = "idle";

  constructor(options: RealtimeWebrtcControllerOptions) {
    this.callEndpoint = options.callEndpoint ?? DEFAULT_REALTIME_CALL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    this.peerConnectionFactory = options.peerConnectionFactory;
    this.remoteAudioElement = options.remoteAudioElement;
  }

  get callId() {
    return this.realtimeCallId;
  }

  get muted() {
    return this.mutedValue;
  }

  get remoteStream() {
    return this.remoteStreamValue;
  }

  get state() {
    return this.stateValue;
  }

  reset(): void {
    this.startGeneration += 1;
    this.cleanupResources();
    this.setState("idle");
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.emit({ muted, type: "muted" });
  }

  async start(): Promise<void> {
    if (ACTIVE_STATES.has(this.stateValue)) {
      throw new Error("Realtime WebRTC session is already active.");
    }

    const generation = this.startGeneration + 1;
    this.startGeneration = generation;
    this.cleanupResources();
    this.setState("connecting");

    try {
      const mediaStream = await this.resolveMediaDevices().getUserMedia({
        audio: true
      });
      this.localStream = mediaStream;
      this.assertStartCurrent(generation);
      this.setMuted(this.mutedValue);

      const peerConnection = this.createPeerConnection();
      this.peerConnection = peerConnection;
      peerConnection.ontrack = (event) => this.handleRemoteTrack(event);

      const dataChannel =
        peerConnection.createDataChannel(REALTIME_EVENTS_CHANNEL);
      this.dataChannel = dataChannel;
      this.bindDataChannel(dataChannel);

      mediaStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream);
      });

      const offer = await peerConnection.createOffer();
      this.assertStartCurrent(generation);
      await peerConnection.setLocalDescription(offer);
      this.assertStartCurrent(generation);

      const answerResponse = await this.postOffer({
        offerSdp: offer.sdp ?? ""
      });
      this.assertStartCurrent(generation);
      const answerSdp = await answerResponse.text();
      const location = answerResponse.headers.get("Location");
      const callId = parseRealtimeCallIdFromLocation(location);
      if (!callId) {
        throw new Error("Realtime call id was missing from the SDP response.");
      }
      this.realtimeCallId = callId;
      this.emit({ callId, type: "call-id" });

      await peerConnection.setRemoteDescription({
        sdp: answerSdp,
        type: "answer"
      });
      await waitForRealtimeDataChannelOpen(dataChannel);
      this.assertStartCurrent(generation);
      this.setState("listening");
    } catch (error) {
      const normalized = normalizeRealtimeError(error);
      this.cleanupResources();
      if (generation !== this.startGeneration) {
        throw new RealtimeStartCancelledError();
      }
      if (normalized instanceof RealtimeStartCancelledError) {
        throw normalized;
      }
      this.setState("error");
      this.emit({ error: normalized, type: "error" });
      throw normalized;
    }
  }

  stop(): void {
    this.startGeneration += 1;
    this.cleanupResources();
    this.setState("ended");
  }

  subscribe(listener: RealtimeWebrtcControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toggleMuted(): boolean {
    const nextMuted = !this.mutedValue;
    this.setMuted(nextMuted);
    return nextMuted;
  }

  private bindDataChannel(dataChannel: RTCDataChannel): void {
    dataChannel.onclose = () => {
      if (ACTIVE_STATES.has(this.stateValue)) this.setState("ended");
    };
    dataChannel.onerror = () => {
      this.setState("error");
    };
    dataChannel.onmessage = (event) => {
      const message = parseRealtimeMessageData(event.data);
      this.emit({ message, type: "message" });
      const nextState = stateFromRealtimeBrowserEvent(message);
      if (nextState) this.setState(nextState);
    };
  }

  private assertStartCurrent(generation: number): void {
    if (generation !== this.startGeneration) {
      throw new RealtimeStartCancelledError();
    }
  }

  private cleanupResources(): void {
    this.realtimeCallId = undefined;
    const dataChannel = this.dataChannel;
    this.dataChannel = undefined;
    if (dataChannel && dataChannel.readyState !== "closed") dataChannel.close();

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = undefined;
    this.remoteStreamValue?.getTracks().forEach((track) => track.stop());
    this.remoteStreamValue = undefined;

    if (this.remoteAudioElement) this.remoteAudioElement.srcObject = null;

    const peerConnection = this.peerConnection;
    this.peerConnection = undefined;
    peerConnection?.close();
  }

  private createPeerConnection(): RTCPeerConnection {
    if (this.peerConnectionFactory) return this.peerConnectionFactory();
    if (typeof RTCPeerConnection === "undefined") {
      throw new Error("RTCPeerConnection is unavailable in this browser.");
    }
    return new RTCPeerConnection();
  }

  private emit(event: RealtimeWebrtcControllerEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private handleRemoteTrack(event: RTCTrackEvent): void {
    const [stream] = event.streams;
    if (!stream) return;
    this.remoteStreamValue = stream;
    if (this.remoteAudioElement) {
      this.remoteAudioElement.autoplay = true;
      this.remoteAudioElement.srcObject = stream;
    }
    this.emit({ stream, type: "remote-stream" });
  }

  private async postOffer(options: {
    offerSdp: string;
  }): Promise<Response> {
    const response = await this.fetchImpl(this.callEndpoint, {
      body: options.offerSdp,
      headers: {
        "Content-Type": "application/sdp"
      },
      method: "POST"
    });
    if (!response.ok) {
      const detail = await response.text();
      const suffix = detail.trim() ? ` ${detail.trim()}` : "";
      throw new Error(
        `Realtime SDP exchange failed with ${response.status} ${response.statusText}.${suffix}`
      );
    }
    return response;
  }

  private resolveMediaDevices(): Pick<MediaDevices, "getUserMedia"> {
    if (!this.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is unavailable in this browser.");
    }
    return this.mediaDevices;
  }

  private setState(state: RealtimeWebrtcControllerState): void {
    const previousState = this.stateValue;
    if (previousState === state) return;
    this.stateValue = state;
    this.emit({ previousState, state, type: "state" });
  }
}
