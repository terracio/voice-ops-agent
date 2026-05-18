"use client";

import { useRef, useState, type RefObject } from "react";
import { Icon } from "./voiceConsoleIcons";
import {
  VoiceToolEvidencePanel,
  VoiceTranscriptEvidencePanel
} from "./VoiceEvidencePanels";
import { VoiceConsoleLiveCall } from "./VoiceConsoleLiveCall";
import { VoiceConsoleTracePanel } from "./VoiceConsoleTracePanel";
import {
  StatusPair,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import { useRealtimeEvidence } from "../hooks/useRealtimeEvidence";
import { useVoiceConsoleRealtime } from "../hooks/useVoiceConsoleRealtime";
import {
  toStatusLabel
} from "../evidence/voiceConsoleLabels";
import {
  type VoiceConsoleController,
  type VoiceConsoleState
} from "../state/voiceConsoleController";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import { buildVoiceTranscriptState } from "../evidence/voiceConsoleTranscript";

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

type VoiceConsoleTab = "live-call" | "transcript" | "evidence" | "trace";

const tabs: Array<{ id: VoiceConsoleTab; label: string }> = [
  { id: "live-call", label: "Live Call" },
  { id: "transcript", label: "Transcript" },
  { id: "evidence", label: "Evidence" },
  { id: "trace", label: "Trace" }
];

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
  const statusLabel = toStatusLabel(state.sessionStatus);
  const transcript = buildVoiceTranscriptState(evidence.transcript);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Live Call";

  return (
    <main className="voice-shell">
      <audio ref={remoteAudioRef} className="remote-audio" />
      <header className="topbar" aria-label="Voice console status">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="brand" />
          </span>
          <h1>MealPlan VoiceOps</h1>
        </div>
        <div className="topbar-meta" aria-label="Session configuration">
          <StatusPair label="Tab" value={activeTabLabel} tone="teal" />
          <StatusPair label="Model" value={state.model} tone="neutral" />
        </div>
        <div className={`connection-state ${state.sessionStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>
      </header>

      <nav className="tab-shell" aria-label="Voice console sections" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            className="tab-button"
            id={`${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section
        aria-labelledby={`${activeTab}-tab`}
        className="tab-panel"
        id={`${activeTab}-panel`}
        role="tabpanel"
      >
        {activeTab === "live-call" ? (
          <VoiceConsoleLiveCall
            evidence={evidence}
            state={state}
            transcript={transcript}
            onAction={onAction}
          />
        ) : null}
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
