import type { ReactNode } from "react";
import { Icon, type IconName } from "./voiceConsoleIcons";
import type { VoiceConsoleAction, VoiceConsoleState } from "./voiceConsoleController";

export function Panel({
  title,
  icon,
  children
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <section className="console-panel" aria-labelledby={`${title.toLowerCase()}-title`}>
      <div className="panel-title">
        <Icon name={icon} />
        <h2 id={`${title.toLowerCase()}-title`}>{title}</h2>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function StatusPair({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "teal" | "neutral";
}) {
  return (
    <div className="status-pair">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

export function ControlButton({
  label,
  detail,
  icon,
  tone = "neutral",
  disabled = false,
  pressed,
  onClick
}: {
  label: string;
  detail: string;
  icon: IconName;
  tone?: "primary" | "neutral";
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`${label}: ${detail}`}
      aria-pressed={pressed}
      className={`control-button ${tone}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

export function ActivityItem({
  event
}: {
  event: VoiceConsoleState["events"][number];
}) {
  return (
    <li className="activity-item">
      <time>{event.at}</time>
      <span className={`event-icon ${event.tone}`} aria-hidden="true">
        <Icon name={activityIcon(event.tone)} />
      </span>
      <div className="event-copy">
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
      </div>
      <span className={`event-label ${event.tone}`}>{event.label}</span>
    </li>
  );
}

export function TechItem({
  icon,
  label,
  value,
  badge
}: {
  icon: IconName;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="tech-item">
      <span className="tech-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <p>{label}</p>
        {badge ? <strong className="tech-badge">{badge}</strong> : <strong>{value}</strong>}
      </div>
    </div>
  );
}

export type VoiceConsoleViewActionHandler = (
  action: VoiceConsoleAction
) => Promise<void> | void;

function activityIcon(tone: VoiceConsoleState["events"][number]["tone"]): IconName {
  if (tone === "ready" || tone === "success") return "check";
  if (tone === "info") return "info";
  return "question";
}
