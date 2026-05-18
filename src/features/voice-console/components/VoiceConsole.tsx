"use client";

import { useRef, useState, type RefObject } from "react";
import {
  VoiceToolEvidencePanel,
  VoiceTranscriptEvidencePanel
} from "./VoiceEvidencePanels";
import { VoiceConsoleTracePanel } from "./VoiceConsoleTracePanel";
import { type VoiceConsoleViewActionHandler } from "./VoiceConsolePrimitives";
import { HeaderStatus, type VoiceConsoleTab } from "./HeaderStatus";
import { LiveCallView } from "./LiveCallView";
import { useRealtimeEvidence } from "../hooks/useRealtimeEvidence";
import { useVoiceConsoleRealtime } from "../hooks/useVoiceConsoleRealtime";
import {
  type VoiceConsoleController,
  type VoiceConsoleState
} from "../state/voiceConsoleController";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import { buildVoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import {
  buildPrototypeLiveCallViewModel,
  type CallControlAction
} from "../models/liveCallViewModel";

type VoiceConsoleProps = {
  controller?: VoiceConsoleController;
};

type VoiceConsoleViewProps = {
  evidence?: VoiceConsoleEvidenceState;
  initialTab?: VoiceConsoleTab;
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  state: VoiceConsoleState;
  onAction: VoiceConsoleViewActionHandler;
};

export function VoiceConsole({
  controller
}: VoiceConsoleProps) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const { onAction, state } = useVoiceConsoleRealtime({
    controller,
    remoteAudioRef
  });
  const evidence = useRealtimeEvidence({
    callId: state.callId,
    enabled: !controller && state.sessionStatus === "connected" && Boolean(state.callId)
  });

  return (
    <VoiceConsoleView
      evidence={evidence}
      remoteAudioRef={remoteAudioRef}
      state={state}
      onAction={onAction}
    />
  );
}

export function VoiceConsoleView({
  evidence = EMPTY_VOICE_CONSOLE_EVIDENCE,
  initialTab = "live-call",
  remoteAudioRef,
  state,
  onAction
}: VoiceConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<VoiceConsoleTab>(initialTab);
  const transcript = buildVoiceTranscriptState(evidence.transcript);
  const liveCall = buildPrototypeLiveCallViewModel({ evidence, state });
  const onCallAction = (action: CallControlAction) => {
    if (action === "call") void onAction({ type: "start" });
    if (action === "hang_up") void onAction({ type: "stop" });
    if (action === "mute" || action === "unmute") void onAction({ type: "toggleMute" });
    if (action === "reset") void onAction({ type: "reset" });
  };

  if (activeTab === "live-call") {
    return (
      <>
        <audio ref={remoteAudioRef} className="hidden" />
        <main aria-labelledby="live-call-tab" id="live-call-panel" role="tabpanel">
          <LiveCallView
            activeTab={activeTab}
            viewModel={liveCall}
            onAction={onCallAction}
            onTabSelect={setActiveTab}
          />
        </main>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <audio ref={remoteAudioRef} className="hidden" />
      <HeaderStatus
        activeTab={activeTab}
        connection={liveCall.connection}
        onTabSelect={setActiveTab}
      />
      <section
        aria-labelledby={`${activeTab}-tab`}
        className="p-6 bg-white min-h-[calc(100vh-64px)]"
        id={`${activeTab}-panel`}
        role="tabpanel"
      >
        {activeTab === "transcript" ? (
          <VoiceTranscriptEvidencePanel
            evidence={evidence}
            transcript={transcript.history}
          />
        ) : null}
        {activeTab === "evidence" ? <VoiceToolEvidencePanel evidence={evidence} /> : null}
        {activeTab === "trace" ? (
          <VoiceConsoleTracePanel
            evidence={evidence}
            state={state}
            onAction={onAction}
          />
        ) : null}
      </section>
    </main>
  );
}
