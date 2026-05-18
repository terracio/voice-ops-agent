import {
  AlertCircle,
  CheckCircle2,
  Hourglass,
  Loader2,
  PlayCircle
} from "lucide-react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface AgentActionBannerProps {
  actionBanner: LiveCallViewModel["actionBanner"];
}

export function AgentActionBanner({ actionBanner }: AgentActionBannerProps) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border ${bannerClass(actionBanner.type)} shadow-sm mb-2`}>
      <div className="mt-0.5">{bannerIcon(actionBanner.type)}</div>
      <div className="flex flex-col flex-1">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-gray-900 text-base">{actionBanner.title}</h3>
          {actionBanner.label ? (
            <span className={`text-xs font-semibold px-2 py-1 rounded-md shrink-0 ${actionBanner.type === "waiting" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800"}`}>
              {actionBanner.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-600 mt-1">{actionBanner.description}</p>
      </div>
    </div>
  );
}

function bannerIcon(type: LiveCallViewModel["actionBanner"]["type"]) {
  if (type === "waiting") return <Hourglass className="w-6 h-6 text-amber-600" />;
  if (type === "blocked" || type === "escalated") {
    return <AlertCircle className="w-6 h-6 text-red-600" />;
  }
  if (type === "running") return <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />;
  if (type === "ready") return <PlayCircle className="w-6 h-6 text-green-600" />;
  return <CheckCircle2 className="w-6 h-6 text-gray-600" />;
}

function bannerClass(type: LiveCallViewModel["actionBanner"]["type"]): string {
  if (type === "waiting") return "bg-amber-50 border-amber-200";
  if (type === "blocked" || type === "escalated") return "bg-red-50 border-red-200";
  if (type === "running") return "bg-blue-50 border-blue-200";
  if (type === "ready") return "bg-green-50 border-green-200";
  return "bg-white border-gray-200";
}
