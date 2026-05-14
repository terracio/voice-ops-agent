import type { EvidenceTranscriptItem } from "./voiceConsoleEvidence";

export type TranscriptSpeaker = "assistant" | "system" | "user";

export type VoiceTranscriptTurn = {
  actor: TranscriptSpeaker;
  at: string;
  fragmentCount: number;
  id: string;
  kind: string;
  text: string;
  turnId: string;
};

export type VoiceTranscriptState = {
  currentAgentText: string;
  currentCallerText: string;
  history: VoiceTranscriptTurn[];
};

export function buildVoiceTranscriptState(
  items: EvidenceTranscriptItem[]
): VoiceTranscriptState {
  const history = normalizeTranscriptTurns(items);
  return {
    currentAgentText: latestTextForActor(history, "assistant"),
    currentCallerText: latestTextForActor(history, "user"),
    history
  };
}

export function normalizeTranscriptTurns(
  items: EvidenceTranscriptItem[]
): VoiceTranscriptTurn[] {
  const turns = new Map<string, VoiceTranscriptTurn>();

  items.forEach((item, index) => {
    const text = item.text.trim();
    if (!text) return;

    const key = `${item.actor}:${item.turnId || item.id}`;
    const existing = turns.get(key);
    if (!existing) {
      turns.set(key, {
        actor: item.actor,
        at: item.at,
        fragmentCount: 1,
        id: key || item.id || `turn:${index}`,
        kind: item.kind,
        text,
        turnId: item.turnId || item.id
      });
      return;
    }

    existing.at = item.at || existing.at;
    existing.fragmentCount += 1;
    existing.kind = mergeKind(existing.kind, item.kind);
    existing.text = mergeTranscriptText(existing.text, text);
  });

  return Array.from(turns.values());
}

function mergeTranscriptText(current: string, next: string): string {
  if (sameText(current, next) || current.includes(next)) return current;
  if (next.includes(current)) return next;
  if (sameSpokenText(current, next)) return preferRicherText(current, next);
  if (sameCorrectedUtterance(current, next)) return preferRicherText(current, next);
  const currentSpeech = spokenTextKey(current);
  const nextSpeech = spokenTextKey(next);
  if (currentSpeech.includes(nextSpeech)) return current;
  if (nextSpeech.includes(currentSpeech)) return next;
  return `${current}${needsSpace(current, next) ? " " : ""}${next}`.trim();
}

function mergeKind(current: string, next: string): string {
  if (current === next) return current;
  if (current.includes(next)) return current;
  if (next.includes(current)) return next;
  return `${current}, ${next}`;
}

function latestTextForActor(
  turns: VoiceTranscriptTurn[],
  actor: TranscriptSpeaker
): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.actor === actor) return turn.text;
  }
  return "";
}

function needsSpace(current: string, next: string): boolean {
  return !/\s$/.test(current) && !/^[\s.,!?;:)]/.test(next);
}

function sameText(left: string, right: string): boolean {
  return left.trim().replace(/\s+/g, " ") === right.trim().replace(/\s+/g, " ");
}

function sameSpokenText(left: string, right: string): boolean {
  return spokenTextKey(left) === spokenTextKey(right);
}

function sameCorrectedUtterance(left: string, right: string): boolean {
  const leftKey = compactSpeechKey(left);
  const rightKey = compactSpeechKey(right);
  const shortest = Math.min(leftKey.length, rightKey.length);
  if (shortest < 32) return false;

  const commonPrefixLength = commonPrefix(leftKey, rightKey);
  if (commonPrefixLength / shortest >= 0.65) return true;
  return longestCommonSubsequenceRatio(leftKey, rightKey) >= 0.9;
}

function spokenTextKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[\s.,!?;:()[\]{}"']+/g, " ")
    .trim();
}

function compactSpeechKey(value: string): string {
  return spokenTextKey(value).replace(/\s+/g, "");
}

function commonPrefix(left: string, right: string): number {
  let index = 0;
  while (index < left.length && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function longestCommonSubsequenceRatio(left: string, right: string): number {
  const previous = new Array(right.length + 1).fill(0) as number[];
  const current = new Array(right.length + 1).fill(0) as number[];

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return previous[right.length] / Math.min(left.length, right.length);
}

function preferRicherText(left: string, right: string): string {
  if (right.length > left.length) return right;
  return left;
}
