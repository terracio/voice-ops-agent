import { Panel } from "./VoiceConsolePrimitives";
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
      <strong>{banner.label}</strong>
      <span>{banner.detail}</span>
    </div>
  );
}

function CustomerSummary({
  customer
}: {
  customer: LiveCallViewModel["customer"];
}) {
  return (
    <div className="summary-stack">
      <div className="summary-heading">
        <span className={`status-chip ${identityTone(customer.identityStatus)}`}>
          {identityLabel(customer.identityStatus)}
        </span>
        <strong>{customer.summaryLabel}</strong>
      </div>
      <dl className="summary-list">
        {customer.name ? <SummaryRow label="Name" value={customer.name} /> : null}
        {customer.identityStatus === "confirmed" ? (
          <SummaryRow label="Customer ID" value={customer.detail} />
        ) : null}
        {customer.plan ? <SummaryRow label="Plan" value={customer.plan} /> : null}
        <SummaryRow label="Access" value={accessLabel(customer.identityStatus)} />
      </dl>
      {customer.identityStatus !== "confirmed" ? (
        <p className="safety-note">{customer.detail}</p>
      ) : null}
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
      <div className="summary-stack">
        <p className="skeleton-copy">No pending ChangeSet preview.</p>
        <p className="safety-note">
          No operational state has been committed in the current evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="summary-stack">
      <div className="summary-heading">
        <span className={`status-chip ${changeSet.confirmationRequired ? "pending" : "success"}`}>
          {changeSet.statusLabel}
        </span>
        <strong>{changeSet.operationLabel}</strong>
      </div>
      <dl className="summary-list">
        <SummaryRow label="ChangeSet ID" value={changeSet.changeSetId} />
        <SummaryRow label="State version" value={changeSet.stateVersionLabel} />
        <SummaryRow
          label="Confirmation"
          value={changeSet.confirmationRequired ? "Required before commit" : "Satisfied"}
        />
      </dl>
      {changeSet.diffRows.length > 0 ? (
        <div className="change-diff-table" role="table" aria-label="ChangeSet before and after">
          <div role="row">
            <span role="columnheader">Field</span>
            <span role="columnheader">Before</span>
            <span role="columnheader">After</span>
          </div>
          {changeSet.diffRows.map((row) => (
            <div role="row" key={`${row.field}-${row.before}-${row.after}`}>
              <span role="cell">{row.field}</span>
              <span role="cell">{readableValue(row.before)}</span>
              <span role="cell">{readableValue(row.after)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="safety-note">No before/after rows are available yet.</p>
      )}
      <p className="safety-note">
        Preview only: the server must revalidate state and policy before commit.
      </p>
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
      <div className="summary-stack">
        <p className="skeleton-copy">{serverToolsLabel}</p>
        <p className="safety-note">
          No server tool calls are present in current evidence.
        </p>
      </div>
    );
  }

  return (
    <ol className="tool-summary-list" aria-label="Compact tool timeline">
      {tools.slice(-5).map((tool) => (
        <li key={tool.id}>
          <div>
            <strong>{tool.name}</strong>
            <span>{tool.at}</span>
          </div>
          <span className={`status-chip ${tool.status}`}>{tool.status}</span>
          <p>{tool.resultLabel}</p>
          {tool.policyId ? <small>Policy {tool.policyId}</small> : null}
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
    <div className="summary-stack">
      <div className="summary-heading">
        <span className={`status-chip ${policy.tone}`}>{policy.label}</span>
      </div>
      <p className="skeleton-copy">{policy.detail}</p>
      <p className="safety-note">
        Deterministic server policy state; blocked or failed tools stay visible here.
      </p>
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

function accessLabel(status: LiveCallIdentityStatus): string {
  return status === "confirmed"
    ? "Private reads and approved previews available"
    : "Private reads and writes blocked";
}

function readableValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[")
    ? "Structured value"
    : value;
}
