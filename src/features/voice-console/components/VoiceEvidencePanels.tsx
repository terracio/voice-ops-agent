import type { ReactNode } from "react";
import { Icon } from "./voiceConsoleIcons";
import {
  EMPTY_VOICE_CONSOLE_EVIDENCE,
  formatEvidenceStatus,
  type EvidenceCostLineItem,
  type EvidenceCostTelemetry,
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
      <VoiceTranscriptEvidencePanel evidence={evidence} transcript={transcript} />
      <VoiceToolEvidencePanel evidence={evidence} />
    </section>
  );
}

export function VoiceTranscriptEvidencePanel({
  evidence = EMPTY_VOICE_CONSOLE_EVIDENCE,
  transcript = normalizeTranscriptTurns(evidence.transcript)
}: VoiceEvidencePanelsProps) {
  return (
    <EvidencePanel title="Transcript history" note="Diagnostic transcript only">
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
  );
}

export function VoiceToolEvidencePanel({
  evidence = EMPTY_VOICE_CONSOLE_EVIDENCE
}: {
  evidence?: VoiceConsoleEvidenceState;
}) {
  return (
    <EvidencePanel title="Operational evidence" note="Server-side evidence">
      <EvidenceSection title="Tool timeline">
        {evidence.tools.length === 0 ? (
          <EmptyEvidence message="No server tool calls captured yet." />
        ) : (
          <ol className="tool-timeline">
            {evidence.tools.map((tool) => (
              <ToolTimelineItem tool={tool} key={tool.id} />
            ))}
          </ol>
        )}
      </EvidenceSection>
      <EvidenceSection title="Policies">
        {evidence.policies?.length ? (
          <ol className="evidence-list">
            {evidence.policies.map((policy) => (
              <li className={`policy-item ${policy.result.severity}`} key={policy.id}>
                <strong>{policy.policyId}</strong>
                <span>{policy.stage} · {policy.result.passed ? "passed" : policy.result.severity}</span>
                <p>{policy.result.message}</p>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyEvidence message="No policy evidence captured yet." />
        )}
      </EvidenceSection>
      <EvidenceSection title="ChangeSets and diffs">
        {evidence.changeSets?.length ? (
          <ol className="evidence-list">
            {evidence.changeSets.map((changeSet) => (
              <li className="change-set-item" key={changeSet.changeSetId}>
                <strong>{changeSet.changeSetId}</strong>
                <span>{changeSet.status} · {changeSet.customerId}</span>
                <p>{changeSet.operations.length} operation(s)</p>
                {changeSet.confirmationId ? <small>Confirmation {changeSet.confirmationId}</small> : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyEvidence message="No ChangeSet evidence captured yet." />
        )}
        {evidence.diffs?.length ? (
          <ol className="diff-list" aria-label="ChangeSet diffs">
            {evidence.diffs.map((diff) => (
              <li key={`${diff.changeSetId}-${diff.field}-${diff.status}`}>
                <span>{diff.field}</span>
                <small>
                  {readableEvidenceValue(diff.before)}
                  {" -> "}
                  {readableEvidenceValue(diff.after)}
                </small>
                <strong>{diff.status}</strong>
              </li>
            ))}
          </ol>
        ) : null}
      </EvidenceSection>
      <EvidenceSection title="Confirmations and audit">
        {evidence.confirmations?.length ? (
          <ol className="evidence-list">
            {evidence.confirmations.map((confirmation) => (
              <li className="confirmation-item" key={confirmation.id}>
                <strong>{confirmation.status}</strong>
                <span>{confirmation.changeSetId ?? "No ChangeSet"} · {confirmation.type ?? "confirmation"}</span>
                <p>{confirmation.transcriptExcerpt ?? confirmation.reason ?? "Confirmation evidence recorded."}</p>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyEvidence message="No confirmation evidence captured yet." />
        )}
        {evidence.auditEvents?.length ? (
          <ol className="audit-list" aria-label="Audit summaries">
            {evidence.auditEvents.slice(-6).map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong>
                <span>{event.actor} · {event.at}</span>
                <p>{event.summary}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </EvidenceSection>
    </EvidencePanel>
  );
}

export function EstimatedCost({ cost }: { cost?: EvidenceCostTelemetry }) {
  const speechItems = costItems(cost, "speech_to_speech");
  const transcriptionItems = costItems(cost, "input_transcription");
  const unavailable = !cost || cost.estimateStatus === "unavailable";
  const reason = cost?.unavailableReasons[0] ?? "Waiting for usage details.";
  return (
    <section className={`estimated-cost ${cost?.estimateStatus ?? "unavailable"}`}>
      <div className="cost-heading">
        <div>
          <span>Estimated cost</span>
          <strong>{unavailable ? "Cost unavailable" : cost.totalLabel}</strong>
        </div>
        <small>{cost ? costLabel(cost) : "Local estimate"}</small>
      </div>
      <dl className="cost-models">
        <div>
          <dt>Model</dt>
          <dd>{cost?.model ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Transcription</dt>
          <dd>{cost?.transcriptionModel ?? "unknown"}</dd>
        </div>
      </dl>
      {unavailable ? <p className="cost-note">{reason}</p> : null}
      <CostBreakdown title="Speech-to-speech" items={speechItems} />
      <CostBreakdown title="Transcription" items={transcriptionItems} />
    </section>
  );
}

function EvidenceSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="evidence-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CostBreakdown({
  items,
  title
}: {
  items: EvidenceCostLineItem[];
  title: string;
}) {
  return (
    <div className="cost-breakdown">
      <span>{title}</span>
      {items.length === 0 ? (
        <small>Usage unavailable</small>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <small>{item.quantityLabel}</small>
              <strong>{item.amountLabel}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function readableEvidenceValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function costItems(
  cost: EvidenceCostTelemetry | undefined,
  category: EvidenceCostLineItem["category"]
): EvidenceCostLineItem[] {
  return cost?.lineItems.filter((item) => item.category === category) ?? [];
}

function costLabel(cost: EvidenceCostTelemetry): string {
  const prefix = cost.estimateStatus === "partial"
    ? "Partial local estimate"
    : "Local estimate";
  return `${prefix} · ${cost.sourceEventCount} events · ${cost.pricingLastVerifiedAt}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
