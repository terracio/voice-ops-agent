import { Info, User } from "lucide-react";
import { AgentVoiceMark } from "./AgentVoiceMark";
import type { ReactNode } from "react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface ConversationTimelineProps {
  timeline: LiveCallViewModel["timeline"];
  elapsedLabel: string;
}

export function ConversationTimeline({
  timeline,
  elapsedLabel
}: ConversationTimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800 text-sm flex items-center gap-1.5">
          Conversation Timeline
          <span className="group relative inline-flex">
            <button
              aria-label="Conversation timeline note"
              className="rounded-full text-gray-400 outline-none hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-200"
              type="button"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal leading-5 text-gray-600 shadow-lg group-focus-within:block group-hover:block">
              Approximate timeline. Segments are estimated from transcript timestamps and call timing, not exact per-speaker audio.
            </span>
          </span>
        </h3>
        <div className="flex gap-4 text-xs font-medium text-gray-500">
          <Legend color="bg-green-500" label="Caller speaking" />
          <Legend color="bg-blue-500" label="Agent speaking" />
          <Legend color="bg-gray-300" label="Silent / thinking / tools" />
        </div>
      </div>

      <div className="flex flex-col border border-gray-100 bg-white p-4 rounded-xl shadow-sm relative">
        <Lane
          icon={<User className="w-4 h-4 text-green-600 bg-green-100 rounded-full p-0.5" />}
          label="Caller"
          segments={timeline.callerSegments}
          segmentClassName="bg-green-500"
        />
        <Lane
          icon={<AgentVoiceMark size="xs" />}
          label="Agent"
          segments={timeline.agentSegments}
          segmentClassName="bg-blue-500"
        />

        <div className="flex items-center border-t border-gray-200 mt-2 pt-2 ml-20 text-xs font-mono text-gray-500">
          <div className="flex-1 flex justify-between pr-4">
            <span>00:00</span>
            <span>00:30</span>
            <span>01:00</span>
            <span>01:30</span>
            <span>02:00</span>
            <span>02:30</span>
            <span>03:00</span>
          </div>
          <span className="text-blue-600 font-semibold">{elapsedLabel}</span>
        </div>

        <div className="absolute right-4 top-4 bottom-8 w-px bg-blue-300 z-10">
          <div className="absolute top-0 -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
          <div className="absolute bottom-0 -translate-x-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}

function Lane({
  icon,
  label,
  segments,
  segmentClassName
}: {
  icon: ReactNode;
  label: string;
  segments: Array<{ startPct: number; widthPct: number }>;
  segmentClassName: string;
}) {
  return (
    <div className="flex items-center h-10 mb-2">
      <div className="w-20 flex items-center gap-2 text-sm font-medium text-gray-700">
        {icon}
        {label}
      </div>
      <div className="flex-1 h-3 bg-gray-100 rounded-full relative">
        {segments.map((segment, index) => (
          <div
            className={`absolute h-full rounded-full ${segmentClassName}`}
            key={`${label}-${index}`}
            style={{ left: `${segment.startPct}%`, width: `${segment.widthPct}%` }}
          />
        ))}
      </div>
    </div>
  );
}
