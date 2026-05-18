import { User } from "lucide-react";
import { AgentVoiceMark } from "./AgentVoiceMark";
import type { ReactNode } from "react";
import type { LiveCallViewModel } from "../models/liveCallViewModel";

interface CurrentSpeechProps {
  speech: LiveCallViewModel["speech"];
}

const speechBars = [7, 14, 9, 12, 6, 15, 10, 13, 8, 11, 14, 5, 9, 10, 7, 12, 6, 8, 5, 9];

export function CurrentSpeech({ speech }: CurrentSpeechProps) {
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="font-medium text-gray-800 text-sm">Current Speech</h3>
      <div className="flex gap-6 h-full">
        <SpeechCard
          accent="green"
          icon={<User className="w-5 h-5 text-green-600 bg-green-100 rounded-full p-0.5" />}
          label="Caller"
          slot={speech.caller}
        />
        <SpeechCard
          accent="blue"
          icon={<AgentVoiceMark size="sm" />}
          label="MealPlan Agent"
          slot={speech.agent}
        />
      </div>
    </div>
  );
}

function SpeechCard({
  accent,
  icon,
  label,
  slot
}: {
  accent: "blue" | "green";
  icon: ReactNode;
  label: string;
  slot: { status: "live" | "idle"; text: string };
}) {
  const live = slot.status === "live";
  const cardClass = accent === "blue"
    ? "border-blue-100 bg-blue-50/30"
    : "border-gray-100 bg-white";
  const textClass = accent === "blue" ? "text-blue-900" : "text-gray-900";
  const dotClass = accent === "blue" ? "bg-blue-500" : "bg-green-500";
  const liveText = accent === "blue" ? "text-blue-600" : "text-green-600";
  const barClass = accent === "blue" ? "bg-blue-500" : "bg-green-500";
  const hasSpeech = slot.text.length > 0;

  return (
    <div className={`flex flex-col flex-1 p-5 border rounded-xl shadow-sm relative ${cardClass}`} data-speech-slot={label.toLowerCase()}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className={`font-medium text-sm ${textClass}`}>{label}</span>
          {live ? (
            <span className={`flex items-center gap-1.5 ${liveText} text-xs font-semibold`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass} animate-pulse`} />
              live
            </span>
          ) : null}
        </div>
        <span className="text-gray-400 text-xs font-medium">Now</span>
      </div>

      <p className={`${hasSpeech ? "text-gray-800 font-medium" : "text-gray-400 italic"} mb-8`}>
        {slot.text || (live ? "..." : `${label} speech will appear here.`)}
      </p>

      <div className="mt-auto flex items-center justify-start gap-0.5 opacity-40">
        {live
          ? speechBars.map((height, index) => (
            <div
              className={`w-1 rounded-full ${barClass}`}
              key={`${label}-${index}`}
              style={{ height }}
            />
          ))
          : null}
      </div>
    </div>
  );
}
