import { Icon, type IconName } from "./voiceConsoleIcons";
import type { VoiceConsoleAction, VoiceConsoleState } from "../state/voiceConsoleController";

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
