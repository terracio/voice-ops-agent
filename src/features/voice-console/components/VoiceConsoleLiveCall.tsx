import { VoiceCallControls } from "./VoiceCallControls";
import { VoiceConversationTimeline } from "./VoiceConversationTimeline";
import {
  Panel,
  type VoiceConsoleViewActionHandler
} from "./VoiceConsolePrimitives";
import { VoiceCurrentAudioStatus } from "./VoiceCurrentAudioStatus";
import { VoiceCurrentSpeech } from "./VoiceCurrentSpeech";
import {
  formatEvidenceStatus,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
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

      <aside className="live-call-right" aria-label="Agent action and safety">
        <Panel title="Agent action" icon="activity">
          <ActionBanner state={state} />
        </Panel>
        <Panel title="Customer summary" icon="user">
          <p className="skeleton-copy">{state.customerContext}</p>
          <p className="safety-note">Private reads and writes stay blocked until server identity evidence is confirmed.</p>
        </Panel>
        <Panel title="ChangeSet preview" icon="shield">
          <p className="skeleton-copy">No pending ChangeSet preview.</p>
          <p className="safety-note">The browser can display deltas only after the server creates and validates them.</p>
        </Panel>
        <Panel title="Tool timeline" icon="activity">
          <ToolTimelineSummary evidence={evidence} state={state} />
        </Panel>
        <Panel title="Policy summary" icon="lock">
          <PolicySummary />
        </Panel>
      </aside>
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

function ActionBanner({ state }: { state: VoiceConsoleState }) {
  return (
    <div className={`action-banner ${state.agentMode}`}>
      <strong>{actionTitle(state)}</strong>
      <span>{actionDetail(state)}</span>
    </div>
  );
}

function ToolTimelineSummary({
  evidence,
  state
}: {
  evidence: VoiceConsoleEvidenceState;
  state: VoiceConsoleState;
}) {
  const latestTool = evidence.tools.at(-1);
  return (
    <div className="summary-stack">
      <p className="skeleton-copy">
        Tools: {latestTool
          ? `${latestTool.name} ${formatEvidenceStatus(latestTool.status).toLowerCase()}`
          : state.serverToolsLabel}
      </p>
      <p className="safety-note">
        Compact server tool status only. Full inputs and outputs stay in the Evidence tab.
      </p>
    </div>
  );
}

function PolicySummary() {
  return (
    <div className="summary-stack">
      <p className="skeleton-copy">Identity and write policies remain active.</p>
      <p className="safety-note">
        Policy enforcement and commits remain server-owned; this panel is display-only.
      </p>
    </div>
  );
}

function costMetric(evidence: VoiceConsoleEvidenceState): string {
  if (!evidence.cost) return "Waiting for telemetry";
  if (evidence.cost.estimateStatus === "unavailable") return "Unavailable";
  return evidence.cost.totalLabel ?? "Partial estimate";
}

function actionTitle(state: VoiceConsoleState): string {
  if (state.sessionStatus === "connecting") return "Connecting";
  if (state.sessionStatus === "disconnected") return state.callId ? "Call ended" : "Ready to start";
  if (state.agentMode === "tool-running") return "Server tool running";
  if (state.agentMode === "waiting-for-confirmation") return "Awaiting confirmation";
  return "Listening for caller";
}

function actionDetail(state: VoiceConsoleState): string {
  if (state.sessionStatus === "disconnected") {
    return state.callId
      ? "Call history remains visible until reset."
      : "Start a call to attach browser audio and server sideband control.";
  }
  if (state.agentMode === "tool-running") return "Tool execution is handled by the server.";
  return "The model may propose actions; the application decides writes.";
}
