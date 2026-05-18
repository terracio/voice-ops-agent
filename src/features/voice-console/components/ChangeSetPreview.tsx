import { ArrowRight, CreditCard, Pause, Play, SlidersHorizontal } from "lucide-react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface ChangeSetPreviewProps {
  changeSet: NonNullable<LiveCallViewModel["changeSet"]>;
}

export function ChangeSetPreview({ changeSet }: ChangeSetPreviewProps) {
  const visual = operationVisual(changeSet.operationType);
  const Icon = visual.icon;

  return (
    <div className="flex flex-col bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
      <div className="flex justify-between items-center p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">ChangeSet preview</h3>
        <button className="text-blue-600 text-sm font-medium hover:text-blue-700 px-3 py-1 border border-blue-100 rounded-md hover:bg-blue-50 transition-colors" type="button">
          View details
        </button>
      </div>

      <div className="p-5 flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 ${visual.className}`}>
            <Icon className={`w-5 h-5 ${visual.fill ? "fill-current" : ""}`} />
          </div>
          <div className="flex flex-col flex-1">
            <h4 className="font-semibold text-gray-900 text-base mb-3">
              {changeSet.operationType || "Unknown operation"}
            </h4>
            <div className="grid grid-cols-3 gap-4 bg-gray-50/50 p-3 rounded-lg border border-gray-100 items-center">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 font-medium mb-1">Date</span>
                <span className="text-sm font-semibold text-gray-900">{changeSet.date || "--"}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 font-medium mb-1">Before</span>
                <span className={`px-2 py-0.5 rounded text-sm font-medium ${statePillClass(changeSet.beforeState, "before")}`}>
                  {changeSet.beforeState || "--"}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 relative top-2" />
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-500 font-medium mb-1">After</span>
                  <span className={`px-2 py-0.5 rounded text-sm font-medium ${statePillClass(changeSet.afterState, "after")}`}>
                    {changeSet.afterState || "--"}
                  </span>
                </div>
              </div>
            </div>
            {changeSet.requiresConfirmation ? (
              <div className="mt-4 shrink-0 self-start">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-800">
                  Confirmation required
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs font-medium text-gray-500 rounded-b-xl">
        <span>
          ChangeSet ID: <span className="font-mono text-gray-700">{changeSet.changeSetId || "--"}</span>
        </span>
        <span>State version: {changeSet.stateVersion || "--"}</span>
      </div>
    </div>
  );
}

function operationVisual(operationType?: string) {
  if (operationType === "Resume delivery") {
    return { className: "bg-green-100 text-green-700", fill: true, icon: Play };
  }
  if (operationType === "Update customization") {
    return { className: "bg-blue-100 text-blue-700", fill: false, icon: SlidersHorizontal };
  }
  if (operationType === "Create payment follow-up") {
    return { className: "bg-red-50 text-red-600", fill: false, icon: CreditCard };
  }
  return { className: "bg-amber-100 text-amber-700", fill: true, icon: Pause };
}

function statePillClass(value: string | undefined, slot: "before" | "after"): string {
  const normalized = value?.toLowerCase();
  if (normalized === "active") return "bg-green-50 text-green-700";
  if (normalized === "paused") return "bg-amber-50 text-amber-700";
  if (normalized === "failed" || normalized === "past_due" || normalized === "error") {
    return "bg-red-50 text-red-700";
  }
  return slot === "after" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-700";
}
