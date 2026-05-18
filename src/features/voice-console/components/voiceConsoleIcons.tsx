import type { ReactNode } from "react";

export type IconName =
  | "activity"
  | "trash"
  | "hash"
  | "link"
  | "shield"
  | "lock"
  | "check"
  | "question"
  | "info";

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: IconName): ReactNode {
  const paths: Record<IconName, ReactNode> = {
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
