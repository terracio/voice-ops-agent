import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "brand"
  | "headset"
  | "phone"
  | "phone-off"
  | "play"
  | "stop"
  | "mic"
  | "reset"
  | "user"
  | "activity"
  | "trash"
  | "hash"
  | "link"
  | "shield"
  | "lock"
  | "speaker"
  | "check"
  | "question"
  | "info";

const waveformBars = [2, 2, 3, 2, 2, 4, 3, 2, 3, 4, 8, 12, 18, 22, 20, 18, 14, 8, 4, 3, 2, 2];

export function AgentAvatar() {
  return (
    <div className="agent-avatar" aria-label="MealPlan Agent avatar">
      <svg aria-hidden="true" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="45" fill="#eef3f6" />
        <circle cx="48" cy="38" r="20" fill="#7b4a32" />
        <path d="M25 45c0-17 10-30 24-30 15 0 24 13 24 30v10H25z" fill="#2d1d18" />
        <circle cx="48" cy="50" r="20" fill="#f6c9a7" />
        <path d="M30 45c4-17 19-22 36-11 0 0-8-22-26-16-10 3-16 13-16 28z" fill="#58311f" />
        <circle cx="40" cy="50" r="2" fill="#101827" />
        <circle cx="56" cy="50" r="2" fill="#101827" />
        <path d="M40 62c5 5 12 5 17 0" fill="none" stroke="#9a4d39" strokeLinecap="round" strokeWidth="3" />
        <path d="M21 47c0-15 12-28 27-28s27 13 27 28" fill="none" stroke="#17202a" strokeLinecap="round" strokeWidth="6" />
        <rect x="18" y="43" width="10" height="18" rx="5" fill="#17202a" />
        <rect x="68" y="43" width="10" height="18" rx="5" fill="#17202a" />
        <path d="M68 61c-2 8-8 12-18 12" fill="none" stroke="#17202a" strokeLinecap="round" strokeWidth="4" />
        <path d="M28 74c7-8 32-8 40 0 6 6 8 14 8 22H20c0-8 2-16 8-22z" fill="#20252c" />
      </svg>
    </div>
  );
}

export function Waveform() {
  return (
    <div className="waveform" aria-label="Assistant audio waveform">
      {waveformBars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          style={{ "--bar-height": `${height}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: IconName): ReactNode {
  const paths: Record<IconName, ReactNode> = {
    brand: (
      <>
        <path d="M8 4v7a4 4 0 0 0 8 0V4" />
        <path d="M12 15v5" />
        <path d="M8 20h8" />
      </>
    ),
    headset: (
      <>
        <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
        <path d="M4 13v4a2 2 0 0 0 2 2h2v-8H6a2 2 0 0 0-2 2z" />
        <path d="M20 13v4a2 2 0 0 1-2 2h-2v-8h2a2 2 0 0 1 2 2z" />
      </>
    ),
    phone: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.34 1.9.63 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.2a2 2 0 0 1 2.11-.45c.91.29 1.85.5 2.81.63A2 2 0 0 1 22 16.92z" />
    ),
    "phone-off": (
      <>
        <path d="m2 2 20 20" />
        <path d="M14.5 17.5a16 16 0 0 1-8-8" />
        <path d="M6.5 2.3h.6a2 2 0 0 1 2 1.72c.1.74.25 1.47.45 2.18" />
        <path d="M19.9 21.9a19.86 19.86 0 0 1-8.71-3.05 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2" />
        <path d="M16.2 14.26c.42-.1.86-.1 1.27 0 .91.29 1.85.5 2.81.63A2 2 0 0 1 22 16.92v3a2 2 0 0 1-.56 1.39" />
      </>
    ),
    play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
    stop: <path d="M7 7h10v10H7z" fill="currentColor" stroke="none" />,
    mic: (
      <>
        <rect height="11" rx="4" width="8" x="8" y="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
        <path d="M8 21h8" />
      </>
    ),
    reset: (
      <>
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v6h-6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    hash: (
      <>
        <path d="M5 9h14" />
        <path d="M4 15h14" />
        <path d="M10 3 8 21" />
        <path d="M16 3l-2 18" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
      </>
    ),
    shield: <path d="M12 3 5 6v6c0 4.4 2.8 7.6 7 9 4.2-1.4 7-4.6 7-9V6z" />,
    lock: (
      <>
        <rect height="10" rx="2" width="14" x="5" y="11" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    speaker: (
      <>
        <path d="M4 10v4h4l5 4V6L8 10z" />
        <path d="M16 9a4 4 0 0 1 0 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    question: (
      <>
        <path d="M9 9a3 3 0 1 1 4 2.83c-.77.33-1 .8-1 1.67" />
        <path d="M12 18h.01" />
      </>
    ),
    info: (
      <>
        <path d="M12 11v6" />
        <path d="M12 7h.01" />
        <circle cx="12" cy="12" r="9" />
      </>
    )
  };

  return paths[name];
}
