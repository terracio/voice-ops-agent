import { Shield, User } from "lucide-react";
import { AgentVoiceMark } from "./AgentVoiceMark";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface CurrentAudioStatusProps {
  agentAudioStatus: LiveCallViewModel["agentAudioStatus"];
}

const audioBars = [
  18, 24, 15, 12, 10, 27, 18, 13, 16, 12,
  21, 15, 24, 12, 18, 21, 25, 20, 17, 18,
  14, 21, 16, 22, 19, 25, 17, 13, 20, 16,
  12, 18, 15, 20, 13, 15, 12, 11, 14, 18
];

export function CurrentAudioStatus({ agentAudioStatus }: CurrentAudioStatusProps) {
  const { callerState, agentState, callerPhone } = agentAudioStatus;
  const isCallerActive = callerState === "speaking";
  const isAgentActive = agentState === "speaking";

  return (
    <div
      aria-label="Current audio status"
      className="flex justify-between items-center min-h-[148px] p-8 border border-green-100 bg-gradient-to-r from-green-50/55 via-white to-white rounded-xl shadow-sm relative overflow-hidden"
    >
      <div className="flex items-center gap-5 z-10 w-1/3">
        <CallerAvatar isActive={isCallerActive} />
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900 text-lg">Caller</span>
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium w-fit mt-1 ${isCallerActive ? "bg-green-100 text-green-700" : "bg-green-50 text-green-700 border border-green-100"}`}>
            <div className="flex gap-0.5">
              <div className={`w-0.5 h-2 ${isCallerActive ? "bg-green-500" : "bg-gray-400"} animate-pulse`} />
              <div className={`w-0.5 h-3 ${isCallerActive ? "bg-green-500" : "bg-gray-400"} animate-pulse delay-75`} />
              <div className={`w-0.5 h-1.5 ${isCallerActive ? "bg-green-500" : "bg-gray-400"} animate-pulse delay-150`} />
            </div>
            {titleCase(callerState)}
          </div>
          {callerPhone ? <span className="text-sm text-gray-500 mt-1">{callerPhone}</span> : null}
        </div>
      </div>

      <div className="flex-1 flex justify-center items-center gap-1 opacity-60 px-4">
        {isCallerActive || isAgentActive ? (
          audioBars.map((height, index) => (
            <div
              className={`w-1 rounded-full ${barColor(index, isCallerActive, isAgentActive)}`}
              key={`${height}-${index}`}
              style={{ height }}
            />
          ))
        ) : (
          <div className="h-px bg-gradient-to-r from-green-200 via-gray-200 to-blue-200 w-full mx-8" />
        )}
      </div>

      <div className="flex items-center justify-end gap-5 z-10 w-1/3">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-gray-900 text-lg">MealPlan Agent</span>
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium w-fit mt-1 ${agentPillClass(isAgentActive, agentState)}`}>
            <Shield className="w-3 h-3" />
            {titleCase(agentState)}
          </div>
        </div>
        <AgentVoiceMark active={isAgentActive} size="lg" />
      </div>
    </div>
  );
}

function CallerAvatar({ isActive }: { isActive: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-green-50"
      style={{
        boxShadow: isActive
          ? "0 0 0 8px rgba(74, 222, 128, 0.14), 0 14px 28px rgba(22, 163, 74, 0.14)"
          : "0 0 0 8px rgba(229, 231, 235, 0.55), 0 12px 24px rgba(15, 23, 42, 0.05)"
      }}
    >
      <div className="absolute inset-1 rounded-full border border-white bg-white/75" />
      <div className={`absolute inset-3 rounded-full border ${isActive ? "border-green-300 bg-green-100/80" : "border-gray-200 bg-gray-50"}`} />
      <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${isActive ? "text-green-500" : "text-gray-400"}`}>
        <User className="h-8 w-8" />
      </div>
    </div>
  );
}

function barColor(index: number, callerActive: boolean, agentActive: boolean): string {
  if (index < 20) return callerActive ? "bg-green-400" : "bg-gray-200";
  return agentActive ? "bg-blue-400" : "bg-gray-200";
}

function agentPillClass(active: boolean, state: string): string {
  if (active) return "bg-blue-100 text-blue-700";
  if (state === "listening") return "bg-blue-50 text-blue-600 border border-blue-200";
  return "bg-gray-100 text-gray-600";
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
