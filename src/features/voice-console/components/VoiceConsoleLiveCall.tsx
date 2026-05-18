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
import type { VoiceTranscriptState } from "../evidence/voiceConsoleTranscript";
import { formatTimelineTime } from "../state/voiceConversationTimeline";
import type { VoiceConsoleState } from "../state/voiceConsoleController";
import { elapsedCallMs } from "../state/voiceConsoleTiming";
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
        <CallSummaryStrip evidence={evidence} state={state} />

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

function CallSummaryStrip({
  evidence,
  state
}: {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
}) {
  return (
    <section className="call-summary-strip" aria-label="Call metrics">
      <div className={`call-summary-state ${state.sessionStatus}`}>
        <span className="status-dot" aria-hidden="true" />
        <strong>Live call</strong>
      </div>
      <dl className="call-summary-metrics">
        <div>
          <dt>Elapsed</dt>
          <dd>{formatTimelineTime(elapsedCallMs(state.callTiming))}</dd>
        </div>
        <div>
          <dt>Estimated cost</dt>
          <dd>{costMetric(evidence)}</dd>
        </div>
      </dl>
    </section>
  );
}

function costMetric(evidence: VoiceConsoleEvidenceState): string {
  if (!evidence.cost) return "Waiting for telemetry";
  if (evidence.cost.estimateStatus === "unavailable") return "Unavailable";
  return evidence.cost.totalLabel ?? "Partial estimate";
}
