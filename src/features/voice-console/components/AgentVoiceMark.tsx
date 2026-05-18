type AgentVoiceMarkSize = "xs" | "sm" | "lg";

interface AgentVoiceMarkProps {
  active?: boolean;
  size?: AgentVoiceMarkSize;
}

const outerSize: Record<AgentVoiceMarkSize, string> = {
  lg: "h-20 w-20",
  sm: "h-5 w-5",
  xs: "h-4 w-4"
};

const waveSize: Record<AgentVoiceMarkSize, string> = {
  lg: "h-11 w-11",
  sm: "h-3.5 w-3.5",
  xs: "h-3 w-3"
};

export function AgentVoiceMark({ active = false, size = "sm" }: AgentVoiceMarkProps) {
  const large = size === "lg";

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center rounded-full ${outerSize[size]}`}
      style={{
        background: "linear-gradient(145deg, #eef6ff 0%, #dbeafe 42%, #93c5fd 100%)",
        boxShadow: large
          ? active
            ? "0 0 0 8px rgba(96, 165, 250, 0.16), 0 16px 30px rgba(59, 130, 246, 0.2)"
            : "0 0 0 8px rgba(219, 234, 254, 0.78), 0 14px 28px rgba(59, 130, 246, 0.12)"
          : "0 1px 3px rgba(37, 99, 235, 0.14)"
      }}
    >
      {large ? (
        <>
          <span className="absolute inset-1 rounded-full border border-white/80 bg-white/35" />
          <span className="absolute inset-3 rounded-full border border-blue-200/80 bg-blue-50/40" />
        </>
      ) : null}
      <svg
        aria-hidden="true"
        className={`relative ${waveSize[size]} ${active ? "text-blue-600" : "text-blue-500"}`}
        fill="none"
        viewBox="0 0 64 64"
      >
        <path
          d="M9 33c7-12 14-12 23 0s16 12 23 0"
          opacity="0.32"
          stroke="white"
          strokeLinecap="round"
          strokeWidth="9"
        />
        <path
          d="M9 33c7-12 14-12 23 0s16 12 23 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
    </span>
  );
}
