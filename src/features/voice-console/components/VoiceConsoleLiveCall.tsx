import { VoiceAgentSafetyPanel } from "./VoiceAgentSafetyPanel";
import { VoiceCallControls } from "./VoiceCallControls";
import { VoiceConversationTimeline } from "./VoiceConversationTimeline";
import {
  Panel,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import { VoiceCurrentAudioStatus } from "./VoiceCurrentAudioStatus";
import { VoiceCurrentSpeech } from "./VoiceCurrentSpeech";
import type { VoiceConsoleEvidenceState } from "../evidence/voiceConsoleEvidence";
import {
  toHandoffLabel,
  toStatusLabel
} from "../evidence/voiceConsoleLabels";
import type { VoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import { buildLiveCallViewModel } from "../state/voiceConsoleViewModel";

type VoiceConsoleLiveCallProps = {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
  transcript: VoiceTranscriptState;
  onAction: VoiceConsoleViewActionHandler;
};

export function VoiceConsoleLiveCall({
  evidence,
  state,
  transcript,
  onAction
}: VoiceConsoleLiveCallProps) {
  const liveCall = buildLiveCallViewModel({ evidence, state });

  return (
    <section className="live-call-grid" aria-label="Live call cockpit">
      <div className="live-call-left">
        <Panel title="Call metrics" icon="activity">
          <div className="metrics-grid">
            <Metric label="Session" value={state.sessionLabel} />
            <Metric label="Connection" value={toStatusLabel(state.sessionStatus)} />
            <Metric label="Estimated cost" value={costMetric(evidence)} />
            <Metric label="Control handoff" value={toHandoffLabel(state.controlHandoff)} />
          </div>
        </Panel>

        <Panel title="Current audio" icon="headset">
          <VoiceCurrentAudioStatus
            agentStatus={liveCall.agentAudioStatus}
            state={state}
          />
        </Panel>

        <Panel title="Conversation timeline" icon="activity">
          <VoiceConversationTimeline callTiming={state.callTiming} transcript={transcript} />
        </Panel>

        <Panel title="Current speech" icon="mic">
          <VoiceCurrentSpeech speech={liveCall.speech} />
        </Panel>

        <VoiceCallControls state={state} onAction={onAction} />
      </div>

      <VoiceAgentSafetyPanel
        model={liveCall}
        serverToolsLabel={state.serverToolsLabel}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function costMetric(evidence: VoiceConsoleEvidenceState): string {
  if (!evidence.cost) return "Waiting for telemetry";
  if (evidence.cost.estimateStatus === "unavailable") return "Unavailable";
  return evidence.cost.totalLabel ?? "Partial estimate";
}
