import { Panel } from "./VoiceConsolePrimitives";
import { Icon, type IconName } from "./voiceConsoleIcons";
import type {
  LiveCallIdentityStatus,
  LiveCallTone,
  LiveCallViewModel
} from "../state/voiceConsoleViewModel";

export function VoiceAgentSafetyPanel({
  model,
  serverToolsLabel
}: {
  model: LiveCallViewModel;
  serverToolsLabel: string;
}) {
  return (
    <aside className="live-call-right" aria-label="Agent action and safety">
      <Panel title="Agent action" icon="activity">
        <ActionBanner banner={model.actionBanner} />
      </Panel>
      <Panel title="Customer summary" icon="user">
        <CustomerSummary customer={model.customer} />
      </Panel>
      <Panel title="ChangeSet preview" icon="shield">
        <ChangeSetPreview changeSet={model.changeSet} />
      </Panel>
      <Panel title="Tool timeline" icon="activity">
        <ToolTimelineSummary
          serverToolsLabel={serverToolsLabel}
          tools={model.tools}
        />
      </Panel>
      <Panel title="Policy summary" icon="lock">
        <PolicySummary policy={model.policy} />
      </Panel>
    </aside>
  );
}

function ActionBanner({
  banner
}: {
  banner: LiveCallViewModel["actionBanner"];
}) {
  return (
    <div className={`action-banner ${banner.tone}`}>
      <span className="action-banner-icon" aria-hidden="true">
        <Icon name={toneIcon(banner.tone)} />
      </span>
      <div>
        <strong>{banner.label}</strong>
        <span>{banner.detail}</span>
      </div>
    </div>
  );
}

function CustomerSummary({
  customer
}: {
  customer: LiveCallViewModel["customer"];
}) {
  const tone = identityTone(customer.identityStatus);
  const displayName = customer.summaryLabel;
  return (
    <div className={`customer-card ${tone}`}>
      <div className="customer-card-header">
        <span className="customer-avatar-compact" aria-hidden="true">
          {customer.name ? customerInitial(customer.name) : <Icon name="user" />}
        </span>
        <div>
          <strong>{displayName}</strong>
          <span>{customer.detail}</span>
        </div>
        <span className={`status-chip ${tone}`}>
          {identityLabel(customer.identityStatus)}
        </span>
      </div>

      <dl className="customer-meta-grid">
        {customer.identityStatus === "confirmed" ? (
          <SummaryRow label="Customer ID" value={customer.detail} />
        ) : null}
        {customer.plan ? <SummaryRow label="Plan" value={customer.plan} /> : null}
        <SummaryRow label="Access" value={accessLabel(customer.identityStatus)} />
      </dl>
      {customer.riskFlags.length > 0 ? (
        <ul className="risk-flag-list" aria-label="Customer risk flags">
          {customer.riskFlags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : (
        <p className="safety-note">No customer risk flags in current evidence.</p>
      )}
    </div>
  );
}

function ChangeSetPreview({
  changeSet
}: {
  changeSet: LiveCallViewModel["changeSet"];
}) {
  if (!changeSet) {
    return (
      <div className="empty-state-card">
        <span aria-hidden="true">
          <Icon name="shield" />
        </span>
        <div>
          <p className="skeleton-copy">No pending ChangeSet preview.</p>
          <p className="safety-note">
            No operational state has been committed in the current evidence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="changeset-card">
      <div className="changeset-card-header">
        <div>
          <strong>{changeSet.operationLabel}</strong>
          <span>{changeSetSafetyNote(changeSet)}</span>
        </div>
        <span className={`status-chip ${changeSet.confirmationRequired ? "pending" : "success"}`}>
          {changeSet.statusLabel}
        </span>
      </div>
      <dl className="changeset-meta-grid">
        <SummaryRow label="ChangeSet ID" value={changeSet.changeSetId} />
        <SummaryRow label="State version" value={changeSet.stateVersionLabel} />
        <SummaryRow
          label="Confirmation"
          value={changeSet.confirmationRequired ? "Required before commit" : "Satisfied"}
        />
      </dl>
      {changeSet.diffRows.length > 0 ? (
        <div className="change-diff-list" role="list" aria-label="ChangeSet before and after">
          {changeSet.diffRows.map((row) => (
            <div role="listitem" key={`${row.field}-${row.before}-${row.after}`}>
              <strong>{row.field}</strong>
              <span>{readableValue(row.before)}</span>
              <span aria-hidden="true">→</span>
              <span>{readableValue(row.after)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="safety-note">No before/after rows are available yet.</p>
      )}
    </div>
  );
}

function ToolTimelineSummary({
  serverToolsLabel,
  tools
}: {
  serverToolsLabel: string;
  tools: LiveCallViewModel["tools"];
}) {
  if (tools.length === 0) {
    return (
      <div className="empty-state-card">
        <span aria-hidden="true">
          <Icon name="activity" />
        </span>
        <div>
          <p className="skeleton-copy">{serverToolsLabel}</p>
          <p className="safety-note">
            No server tool calls are present in current evidence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="tool-timeline-list" aria-label="Compact tool timeline">
      {tools.slice(-7).map((tool) => (
        <li className={`tool-timeline-item ${tool.status}`} key={tool.id}>
          <span className="tool-timeline-marker" aria-hidden="true">
            <Icon name={toolStatusIcon(tool.status)} />
          </span>
          <div className="tool-timeline-card">
            <div className="tool-timeline-card-header">
              <strong>{tool.name}</strong>
              <span className={`status-chip ${tool.status}`}>{tool.status}</span>
            </div>
            <p>{tool.resultLabel}</p>
            <div className="tool-timeline-meta">
              <time>{tool.at}</time>
              <span>{tool.risk}</span>
              {tool.policyId ? <span>Policy {tool.policyId}</span> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PolicySummary({
  policy
}: {
  policy: LiveCallViewModel["policy"];
}) {
  return (
    <div className={`policy-card ${policy.tone}`}>
      <span className="policy-card-icon" aria-hidden="true">
        <Icon name={toneIcon(policy.tone)} />
      </span>
      <div>
        <strong>{policy.label}</strong>
        <p>{policy.detail}</p>
        <small>
          Deterministic server policy state; blocked or failed tools stay visible here.
        </small>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function identityLabel(status: LiveCallIdentityStatus): string {
  if (status === "confirmed") return "Confirmed";
  if (status === "pending") return "Pending";
  if (status === "uncertain") return "Uncertain";
  return "Unknown";
}

function identityTone(status: LiveCallIdentityStatus): LiveCallTone {
  if (status === "confirmed") return "success";
  if (status === "uncertain") return "warning";
  return "pending";
}

function customerInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function toneIcon(tone: LiveCallTone): IconName {
  if (tone === "success") return "check";
  if (tone === "error" || tone === "warning") return "question";
  if (tone === "pending") return "activity";
  return "info";
}

function toolStatusIcon(status: LiveCallViewModel["tools"][number]["status"]): IconName {
  if (status === "completed") return "check";
  if (status === "blocked" || status === "failed") return "question";
  if (status === "running" || status === "waiting") return "activity";
  return "info";
}

function accessLabel(status: LiveCallIdentityStatus): string {
  return status === "confirmed"
    ? "Private reads and approved previews available"
    : "Private reads and writes blocked";
}

function changeSetSafetyNote(changeSet: NonNullable<LiveCallViewModel["changeSet"]>): string {
  if (changeSet.confirmationRequired) {
    return "No state committed yet; the server must revalidate state and policy before commit.";
  }
  if (changeSet.statusLabel === "Committed") {
    return "Committed after server confirmation and policy revalidation.";
  }
  return "Confirmation satisfied; no pending commit blocker in current evidence.";
}

function readableValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[")
    ? "Structured value"
    : value;
}
