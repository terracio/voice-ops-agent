import { Icon } from "./voiceConsoleIcons";
import type { LiveCallViewModel, LiveCallSpeechSlot } from "../state/voiceConsoleViewModel";

export function VoiceCurrentSpeech({
  speech
}: {
  speech: LiveCallViewModel["speech"];
}) {
  return (
    <div className="current-speech-grid" aria-label="Current speech">
      <SpeechSlot label="Caller" slot={speech.caller} />
      <SpeechSlot label="MealPlan Agent" slot={speech.agent} />
    </div>
  );
}

function SpeechSlot({
  label,
  slot
}: {
  label: string;
  slot: LiveCallSpeechSlot;
}) {
  const hasText = slot.text.trim().length > 0;

  return (
    <article className={`current-speech-slot ${slot.speaker}`} data-speech-slot={slot.speaker}>
      <div className="current-speech-heading">
        <span className="speech-icon" aria-hidden="true">
          <Icon name={slot.speaker === "caller" ? "mic" : "speaker"} />
        </span>
        <div>
          <h3>{label}</h3>
          <p>{slotStatusLabel(slot.status)}</p>
        </div>
      </div>
      <p className={hasText ? "current-speech-text" : "current-speech-empty"}>
        {hasText ? slot.text : emptySpeechText(slot.speaker)}
      </p>
    </article>
  );
}

function emptySpeechText(speaker: LiveCallSpeechSlot["speaker"]): string {
  return speaker === "caller"
    ? "Caller speech will appear here."
    : "Agent speech will appear here.";
}

function slotStatusLabel(status: string): string {
  if (status === "tooling") return "Tooling";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
