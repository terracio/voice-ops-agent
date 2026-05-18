import { ShieldCheck } from "lucide-react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface PolicySummaryProps {
  policy: LiveCallViewModel["policy"];
}

export function PolicySummary({ policy }: PolicySummaryProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
      <ShieldCheck className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-gray-900 text-sm">Policy summary</h3>
        <p className="text-sm text-gray-700 leading-snug">{policy.statusText}</p>
        {policy.subText ? (
          <p className="text-sm text-gray-700 leading-snug mt-0.5">{policy.subText}</p>
        ) : null}
      </div>
    </div>
  );
}
