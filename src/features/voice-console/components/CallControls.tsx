import { Mic, MicOff, Phone, PhoneOff, RotateCw } from "lucide-react";
import type { CallControlAction, LiveCallViewModel } from "../models/liveCallViewModel";

interface CallControlsProps {
  connection: LiveCallViewModel["connection"];
  onAction: (action: CallControlAction) => void;
}

export function CallControls({ connection, onAction }: CallControlsProps) {
  const isConnected = connection.status === "connected";
  const isEnded = connection.status === "ended";

  return (
    <div className="flex gap-4 border-t border-gray-100 pt-6">
      {!isConnected ? (
        <button
          className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          onClick={() => onAction("call")}
          type="button"
        >
          <Phone className="w-5 h-5" />
          {isEnded ? "Call again" : "Call"}
        </button>
      ) : (
        <button
          className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
          onClick={() => onAction("hang_up")}
          type="button"
        >
          <PhoneOff className="w-5 h-5" />
          Hang up
        </button>
      )}

      <button
        className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold transition-colors border shadow-sm ${muteClass(connection, isConnected)}`}
        disabled={!isConnected}
        onClick={() => onAction(connection.isMuted ? "unmute" : "mute")}
        type="button"
      >
        {connection.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        {connection.isMuted ? "Unmute" : "Mute"}
      </button>

      <button
        className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        onClick={() => onAction("reset")}
        type="button"
      >
        <RotateCw className="w-5 h-5" />
        Reset
      </button>
    </div>
  );
}

function muteClass(
  connection: LiveCallViewModel["connection"],
  isConnected: boolean
): string {
  if (!isConnected) return "bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed";
  if (connection.isMuted) return "bg-red-50 border-red-200 text-red-600 hover:bg-red-100";
  return "bg-white border-gray-200 text-gray-700 hover:bg-gray-50";
}
