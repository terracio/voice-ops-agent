import { CheckCircle2, User } from "lucide-react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface CustomerSummaryProps {
  customer: LiveCallViewModel["customer"];
}

export function CustomerSummary({ customer }: CustomerSummaryProps) {
  if (customer.status === "unknown") {
    return (
      <div className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
          <User className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900 text-lg">Unknown Customer</span>
          <span className="text-sm text-gray-500">Private reads & writes blocked.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-5 bg-white border border-gray-200 rounded-xl shadow-sm mb-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-inner">
            {initial(customer.name)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-lg">
                {customer.name || "Pending..."}
              </span>
              {customer.id ? <span className="text-sm text-gray-500 font-mono">• {customer.id}</span> : null}
            </div>
            {customer.status === "confirmed" ? (
              <div className="flex items-center gap-1.5 text-sm font-medium text-green-600 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
                Identity confirmed
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 mt-0.5">
                {customer.status === "uncertain" ? "Identity uncertain" : "Pending identification"}
              </div>
            )}
          </div>
        </div>
      </div>

      {customer.plan || customer.riskFlags?.length ? (
        <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
          {customer.plan ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 font-medium">Plan:</span>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 font-medium rounded-md">
                {customer.plan}
              </span>
            </div>
          ) : null}
          {customer.riskFlags?.map((flag) => (
            <div className="flex items-center gap-2 text-sm" key={`${flag.label}-${flag.status}`}>
              <span className="text-gray-500 font-medium">{flag.label}:</span>
              <span className={`px-2 py-0.5 font-medium rounded-md ${flagClass(flag.status)}`}>
                {flag.status}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function initial(name?: string): string {
  return name ? name.charAt(0).toUpperCase() : "?";
}

function flagClass(status: "good" | "warning" | "error"): string {
  if (status === "error") return "bg-red-50 text-red-700";
  if (status === "warning") return "bg-amber-50 text-amber-700";
  return "bg-green-50 text-green-700";
}
