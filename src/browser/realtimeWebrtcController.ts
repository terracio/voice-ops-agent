import {
  DEFAULT_REALTIME_CONTROL_ENDPOINT,
  DEFAULT_REALTIME_SESSION_ENDPOINT,
  REALTIME_EVENTS_CHANNEL,
  RealtimeSessionResponseSchema,
  normalizeRealtimeError,
  parseRealtimeCallIdFromLocation,
  parseRealtimeMessageData,
  stateFromRealtimeBrowserEvent,
  type RealtimeWebrtcControllerEvent,
  type RealtimeWebrtcControllerListener,
  type RealtimeWebrtcControllerState
} from "./realtimeWebrtcEvents";

export {
  DEFAULT_REALTIME_CONTROL_ENDPOINT,
  DEFAULT_REALTIME_SESSION_ENDPOINT,
  REALTIME_EVENTS_CHANNEL,
  parseRealtimeCallIdFromLocation,
  stateFromRealtimeBrowserEvent,
  type RealtimeWebrtcControllerEvent,
  type RealtimeWebrtcControllerListener,
  type RealtimeWebrtcControllerState
} from "./realtimeWebrtcEvents";

export type RealtimeWebrtcController = {
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
  controlEndpoint?: string;
  fetchImpl?: typeof fetch;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  peerConnectionFactory?: () => RTCPeerConnection;
  remoteAudioElement?: HTMLAudioElement;
  sessionEndpoint?: string;
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
  private readonly controlEndpoint: string;
  private dataChannel?: RTCDataChannel;
  private readonly fetchImpl: typeof fetch;
  private readonly listeners = new Set<RealtimeWebrtcControllerListener>();
  private localStream?: MediaStream;
  private readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  private mutedValue = false;
  private peerConnection?: RTCPeerConnection;
  private readonly peerConnectionFactory?: () => RTCPeerConnection;
  private readonly remoteAudioElement?: HTMLAudioElement;
  private remoteStreamValue?: MediaStream;
  private readonly sessionEndpoint: string;
  private startGeneration = 0;
  private stateValue: RealtimeWebrtcControllerState = "idle";

  constructor(options: RealtimeWebrtcControllerOptions) {
    this.controlEndpoint =
      options.controlEndpoint ?? DEFAULT_REALTIME_CONTROL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
    this.peerConnectionFactory = options.peerConnectionFactory;
    this.remoteAudioElement = options.remoteAudioElement;
    this.sessionEndpoint =
      options.sessionEndpoint ?? DEFAULT_REALTIME_SESSION_ENDPOINT;
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

      const session = await this.requestSession();
      this.assertStartCurrent(generation);
      const answerResponse = await this.postOffer({
        callsUrl: session.transport.calls_url,
        clientSecret: session.client_secret.value,
        offerSdp: offer.sdp ?? ""
      });
      this.assertStartCurrent(generation);
      const answerSdp = await answerResponse.text();
      const callId = parseRealtimeCallIdFromLocation(
        answerResponse.headers.get("Location")
      );
      if (!callId) {
        throw new Error("Realtime call id was missing from the SDP response.");
      }

      await peerConnection.setRemoteDescription({
        sdp: answerSdp,
        type: "answer"
      });
      await this.handoffControl(callId);
      this.assertStartCurrent(generation);
      this.setState("listening");
    } catch (error) {
      const normalized = normalizeRealtimeError(error);
      this.cleanupResources();
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

  private async handoffControl(callId: string): Promise<void> {
    const response = await this.fetchImpl(this.controlEndpoint, {
      body: JSON.stringify({ call_id: callId }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(
        `Realtime control handoff failed with ${response.status} ${response.statusText}.`
      );
    }
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
    callsUrl: string;
    clientSecret: string;
    offerSdp: string;
  }): Promise<Response> {
    const response = await this.fetchImpl(options.callsUrl, {
      body: options.offerSdp,
      headers: {
        Authorization: `Bearer ${options.clientSecret}`,
        "Content-Type": "application/sdp"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(
        `Realtime SDP exchange failed with ${response.status} ${response.statusText}.`
      );
    }
    return response;
  }

  private async requestSession() {
    const response = await this.fetchImpl(this.sessionEndpoint, {
      headers: { Accept: "application/json" },
      method: "POST"
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        `Realtime session request failed with ${response.status} ${response.statusText}.`
      );
    }
    return RealtimeSessionResponseSchema.parse(data);
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
