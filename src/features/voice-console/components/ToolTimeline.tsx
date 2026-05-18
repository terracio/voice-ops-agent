import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Wrench,
  XCircle
} from "lucide-react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface ToolTimelineProps {
  tools: LiveCallViewModel["tools"];
}

export function ToolTimeline({ tools }: ToolTimelineProps) {
  const toolCountLabel = `${tools.length} tool ${tools.length === 1 ? "call" : "calls"}`;

  return (
    <div className="flex flex-col mb-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900 text-sm">Tool timeline</h3>
        <span className="font-mono text-[11px] text-gray-400">{toolCountLabel}</span>
      </div>
      <div className="flex flex-col relative py-1">
        {tools.length === 0 ? (
          <div className="flex min-h-[108px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/70 px-4 text-center">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-400">
              <Wrench className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-gray-600">No tool calls yet.</p>
            <p className="mt-1 text-xs text-gray-400">Initial session events only.</p>
          </div>
        ) : (
          <>
            <div className="absolute left-[7px] top-3 bottom-4 w-px bg-gray-200 z-0" />
            {tools.map((tool, index) => (
              <div
                className={`flex items-center gap-3 relative z-10 ${index !== tools.length - 1 ? "mb-3" : ""}`}
                key={tool.id}
              >
                <div className="shrink-0 flex items-center justify-center bg-transparent mt-0.5">
                  {statusIcon(tool.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-gray-700 tracking-tight truncate">
                    {tool.name}
                  </div>
                  {tool.summary || tool.policyId || tool.risk ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-gray-500">
                      {tool.summary ? (
                        <span className={tool.status === "blocked" || tool.status === "failed" ? "text-red-600" : ""}>
                          {tool.summary}
                        </span>
                      ) : null}
                      {tool.policyId ? (
                        <span className="font-mono font-medium text-red-600">Policy {tool.policyId}</span>
                      ) : null}
                      {tool.risk ? <span className="uppercase tracking-wide">{tool.risk}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className={`w-20 text-xs font-medium text-right ${statusColor(tool.status)}`}>
                  {titleCase(tool.status)}
                </div>
                <div className="w-16 text-xs text-gray-400 font-mono text-right shrink-0">
                  {tool.elapsedTime || "—"}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function statusIcon(status: LiveCallViewModel["tools"][number]["status"]) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-green-500 bg-white" />;
  if (status === "running") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin bg-white" />;
  if (status === "waiting") return <Circle className="w-4 h-4 text-blue-500 bg-white" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500 bg-white" />;
  if (status === "blocked") return <AlertCircle className="w-4 h-4 text-red-500 bg-white" />;
  return <Clock className="w-4 h-4 text-gray-300 bg-white" />;
}

function statusColor(status: LiveCallViewModel["tools"][number]["status"]): string {
  if (status === "completed") return "text-green-600";
  if (status === "running" || status === "waiting") return "text-blue-600";
  if (status === "failed" || status === "blocked") return "text-red-500";
  return "text-gray-400";
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
