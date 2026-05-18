import { Clock, DollarSign, FileText } from "lucide-react";
import type { ReactNode } from "react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface CallMetricsProps {
  elapsedLabel: string;
  cost: LiveCallViewModel["cost"];
  onTranscriptClick?: () => void;
}

export function CallMetrics({
  elapsedLabel,
  cost,
  onTranscriptClick
}: CallMetricsProps) {
  return (
    <div className="flex gap-4 sm:gap-8 items-center bg-transparent min-w-0">
      <Metric icon={<Clock className="w-5 h-5" />} label="Elapsed" value={elapsedLabel} />
      <div className="w-px h-8 bg-gray-200" />
      <Metric
        icon={<DollarSign className="w-5 h-5" />}
        label="Est. cost"
        value={cost.isAvailable ? cost.label : "--"}
      />
      <button
        className="flex items-center gap-2 ml-4 px-4 py-1.5 border border-gray-200 rounded-lg outline-none hover:bg-gray-50 text-sm font-medium text-gray-700 shadow-sm whitespace-nowrap"
        onClick={onTranscriptClick}
        type="button"
      >
        <FileText className="w-4 h-4 text-gray-500" />
        View full transcript
      </button>
    </div>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-gray-400">{icon}</div>
      <div className="flex flex-col">
        <span className="font-mono font-medium text-gray-900 text-sm">{value}</span>
        <span className="text-xs text-gray-400 font-medium tracking-wide">{label}</span>
      </div>
    </div>
  );
}
