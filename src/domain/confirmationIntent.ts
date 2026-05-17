import { z } from "zod";
import type { ChangeSet } from "./schema";

export const ConfirmationIntentSchema = z.enum([
  "confirm",
  "deny",
  "unclear"
]);

export const ConfirmationIntentResultSchema = z.object({
  intent: ConfirmationIntentSchema,
  confidence: z.number().min(0).max(1),
  method: z.enum(["exact_challenge", "deterministic"]),
  matched_signals: z.array(z.string().min(1)),
  rejected_signals: z.array(z.string().min(1))
}).strict();

export type ConfirmationIntent = z.infer<typeof ConfirmationIntentSchema>;
export type ConfirmationIntentResult = z.infer<
  typeof ConfirmationIntentResultSchema
>;

export type ClassifyConfirmationIntentInput = {
  challenge?: string;
  transcript: string;
};

const SAFE_CONFIRM_PHRASES = new Map<string, string>([
  ["yes", "affirmative:yes"],
  ["yep", "affirmative:yep"],
  ["yeah", "affirmative:yeah"],
  ["correct", "affirmative:correct"],
  ["confirmed", "affirmative:confirmed"],
  ["confirm", "affirmative:confirm"],
  ["i confirm", "affirmative:i_confirm"],
  ["that is correct", "affirmative:that_is_correct"],
  ["looks good", "affirmative:looks_good"],
  ["go ahead", "affirmative:go_ahead"],
  ["yes please", "affirmative:yes_please"],
  ["please do", "affirmative:please_do"],
  ["yes confirm", "affirmative:yes_confirm"],
  ["yes confirm it", "affirmative:yes_confirm_it"],
  ["yes confirm that", "affirmative:yes_confirm_that"],
  ["yes confirm this", "affirmative:yes_confirm_this"],
  ["yes confirm the changes", "affirmative:yes_confirm_the_changes"],
  ["yes confirm those changes", "affirmative:yes_confirm_those_changes"]
]);

const DENY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(no|nope|nah)\b/, "deny:no"],
  [/\b(do not|don't|dont|cannot|can't|cant|won't|wont)\b/, "deny:do_not"],
  [/\b(never|nevermind|never mind)\b/, "deny:never"],
  [/\b(cancel|stop|abort|decline|reject)\b/, "deny:cancel_stop"],
  [/\bnot\b/, "deny:not"],
  [/\b(but|except|instead)\b/, "correction:contrast"],
  [/\b(actually|rather)\b/, "correction:actually"],
  [/\bchange\b.*\bto\b/, "correction:change_to"]
];

const UNCLEAR_PATTERNS: Array<[RegExp, string]> = [
  [/\?/, "uncertain:question"],
  [/\b(wait|hold on|pause|maybe|perhaps|unsure)\b/i, "uncertain:hesitation"],
  [/\b(not sure|i don't know|i dont know)\b/i, "uncertain:not_sure"],
  [/\b(what|which|when|where|why|how)\b/i, "uncertain:question_word"]
];

const MIXED_LANGUAGE_PATTERN =
  /\b(si|oui|non|ja|nein|por|favor|gracias|merci|vale|confirmo|cambio|cambiar|porfa)\b/;

export function classifyConfirmationIntent(
  input: ClassifyConfirmationIntentInput
): ConfirmationIntentResult {
  const transcript = input.transcript.trim();
  const normalized = normalizeText(transcript);
  const matched = confirmSignals(normalized);
  const languageSignals = languageRejections(transcript, normalized);

  if (!normalized) {
    return deterministic("unclear", 0.4, matched, ["empty_transcript"]);
  }
  if (languageSignals.length > 0) {
    return deterministic("unclear", 0.45, matched, languageSignals);
  }

  const challenge = input.challenge ? normalizeText(input.challenge) : "";
  if (challenge && normalized === challenge) {
    return {
      intent: "confirm",
      confidence: 1,
      method: "exact_challenge",
      matched_signals: ["exact_challenge"],
      rejected_signals: []
    };
  }

  const denySignals = matchedSignals(normalized, DENY_PATTERNS);
  if (denySignals.length > 0) {
    return deterministic("deny", 0.95, matched, denySignals);
  }

  const uncertainSignals = matchedSignals(transcript, UNCLEAR_PATTERNS);
  if (uncertainSignals.length > 0) {
    return deterministic("unclear", 0.7, matched, uncertainSignals);
  }

  if (isLongFreeForm(transcript, normalized)) {
    return deterministic("unclear", 0.55, matched, ["long_free_form"]);
  }

  const safeSignal = SAFE_CONFIRM_PHRASES.get(normalized);
  if (safeSignal) {
    return deterministic("confirm", 0.9, [safeSignal], []);
  }

  return deterministic("unclear", 0.5, matched, ["unknown_phrase"]);
}

export function confirmationChallengePhraseForChangeSet(
  changeSet: ChangeSet
): string {
  return `Confirm ${confirmationChallengeSubject(changeSet)}.`;
}

function deterministic(
  intent: ConfirmationIntent,
  confidence: number,
  matched_signals: string[],
  rejected_signals: string[]
): ConfirmationIntentResult {
  return {
    intent,
    confidence,
    method: "deterministic",
    matched_signals,
    rejected_signals
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function languageRejections(raw: string, normalized: string): string[] {
  const asciiCandidate = raw.normalize("NFKC").replace(/[’‘`]/g, "'");
  const rejected: string[] = [];
  if (!isAscii(asciiCandidate)) {
    rejected.push("non_english_or_mixed_language");
  }
  if (/[^A-Za-z0-9\s.,!?'"-]/.test(asciiCandidate)) {
    rejected.push("noisy_transcript");
  }
  if (MIXED_LANGUAGE_PATTERN.test(normalized)) {
    rejected.push("non_english_or_mixed_language");
  }
  return [...new Set(rejected)];
}

function isAscii(value: string): boolean {
  return [...value].every((character) => character.charCodeAt(0) <= 127);
}

function matchedSignals(
  text: string,
  patterns: Array<[RegExp, string]>
): string[] {
  return patterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, signal]) => signal);
}

function confirmSignals(normalized: string): string[] {
  const signals: string[] = [];
  if (/\byes\b/.test(normalized)) signals.push("affirmative:yes");
  if (/\bconfirm(?:ed)?\b/.test(normalized)) signals.push("affirmative:confirm");
  if (/\bcorrect\b/.test(normalized)) signals.push("affirmative:correct");
  if (/\bgo ahead\b/.test(normalized)) signals.push("affirmative:go_ahead");
  return [...new Set(signals)];
}

function isLongFreeForm(raw: string, normalized: string): boolean {
  return raw.length > 80 || normalized.split(" ").filter(Boolean).length > 8;
}

function confirmationChallengeSubject(changeSet: ChangeSet): string {
  if (changeSet.operations.length > 1) return "meal plan changes";

  const [operation] = changeSet.operations;
  if (!operation) return "meal plan changes";
  if (operation.type === "pause_dates") return "pause delivery";
  if (operation.type === "resume_dates") return "resume delivery";
  if (operation.type === "create_payment_followup") {
    return "payment follow-up";
  }
  return "meal preference change";
}
