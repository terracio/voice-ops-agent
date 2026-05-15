import type { ReactNode } from "react";
import { Icon } from "./voiceConsoleIcons";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  formatEvidenceStatus,
  type EvidenceToolItem,
  type VoiceConsoleEvidenceState
} from "../evidence/voiceConsoleEvidence";
import {
  normalizeTranscriptTurns,
  type VoiceTranscriptTurn
} from "../evidence/voiceConsoleTranscript";

type VoiceEvidencePanelsProps = {
  evidence?: VoiceConsoleEvidenceState;
  transcript?: VoiceTranscriptTurn[];
};

export function VoiceEvidencePanels({
  evidence = EMPTY_VOICE_CONSOLE_EVIDENCE,
  transcript = normalizeTranscriptTurns(evidence.transcript)
}: VoiceEvidencePanelsProps) {
  return (
    <section className="evidence-grid" aria-label="Realtime evidence">
      <EvidencePanel title="Transcript evidence" note="Debug text only">
        <EvidenceStateLine evidence={evidence} />
        {transcript.length === 0 ? (
          <EmptyEvidence message="No transcript evidence for this call yet." />
        ) : (
          <ol className="transcript-list">
            {transcript.map((item) => (
              <li className={`transcript-item ${item.actor}`} key={item.id}>
                <span className="transcript-meta">
                  <strong>{item.actor}</strong>
                  <time>{item.at}</time>
                </span>
                <p>{item.text}</p>
                <small>
                  {item.kind}
                  {item.fragmentCount > 1 ? ` · ${item.fragmentCount} fragments` : ""}
                </small>
              </li>
            ))}
          </ol>
        )}
      </EvidencePanel>

      <EvidencePanel title="Tool timeline" note="Server-side evidence">
        {evidence.tools.length === 0 ? (
          <EmptyEvidence message="No server tool calls captured yet." />
        ) : (
          <ol className="tool-timeline">
            {evidence.tools.map((tool) => (
              <ToolTimelineItem tool={tool} key={tool.id} />
            ))}
          </ol>
        )}
        {evidence.events.length > 0 ? (
          <div className="realtime-events" aria-label="Realtime event summaries">
            {evidence.events.slice(-6).map((event) => (
              <span className={`realtime-event ${event.severity}`} key={event.id}>
                {event.label}
              </span>
            ))}
          </div>
        ) : null}
      </EvidencePanel>
    </section>
  );
}

function EvidencePanel({
  title,
  note,
  children
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="evidence-panel" aria-labelledby={`${slug(title)}-heading`}>
      <div className="evidence-title">
        <div>
          <Icon name="activity" />
          <h2 id={`${slug(title)}-heading`}>{title}</h2>
        </div>
        <span>{note}</span>
      </div>
      <div className="evidence-body">{children}</div>
    </section>
  );
}

function EvidenceStateLine({
  evidence
}: {
  evidence: VoiceConsoleEvidenceState;
}) {
  if (evidence.status === "error") {
    return <p className="evidence-state error">{evidence.errorMessage}</p>;
  }
  if (evidence.status === "loading") {
    return <p className="evidence-state">Loading evidence...</p>;
  }
  if (evidence.lastUpdated) {
    return <p className="evidence-state">Updated from server evidence at {evidence.lastUpdated}</p>;
  }
  return <p className="evidence-state">Waiting for an active Realtime call.</p>;
}

function ToolTimelineItem({ tool }: { tool: EvidenceToolItem }) {
  return (
    <li className={`tool-item ${tool.status}`}>
      <div className="tool-row">
        <div>
          <strong>{tool.name}</strong>
          <p>{tool.summary ?? `${tool.risk} tool`}</p>
        </div>
        <span className={`tool-status ${tool.status}`}>
          {formatEvidenceStatus(tool.status)}
        </span>
      </div>
      <dl className="tool-details">
        <div>
          <dt>Risk</dt>
          <dd>{tool.risk}</dd>
        </div>
        {tool.policyId ? (
          <div>
            <dt>Policy</dt>
            <dd>{tool.policyId}</dd>
          </div>
        ) : null}
      </dl>
      {tool.input ? <code>Input {tool.input}</code> : null}
      {tool.output ? <code>Output {tool.output}</code> : null}
    </li>
  );
}

function EmptyEvidence({ message }: { message: string }) {
  return (
    <div className="empty-evidence">
      <Icon name="info" />
      <span>{message}</span>
    </div>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
