import { z } from "zod";

export const IdentityConfirmationIntentSchema = z.enum([
  "confirm_self",
  "deny",
  "third_party",
  "unclear"
]);

export const IdentityConfirmationIntentResultSchema = z.object({
  intent: IdentityConfirmationIntentSchema,
  confidence: z.number().min(0).max(1),
  method: z.enum(["deterministic", "classifier", "hybrid"]),
  matched_signals: z.array(z.string().min(1)),
  rejected_signals: z.array(z.string().min(1))
}).strict();

export type IdentityConfirmationIntent = z.infer<
  typeof IdentityConfirmationIntentSchema
>;
export type IdentityConfirmationIntentResult = z.infer<
  typeof IdentityConfirmationIntentResultSchema
>;

export type ClassifyIdentityConfirmationIntentInput = {
  candidateName?: string;
  transcript: string;
};

const DENY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(no|nope|nah)\b/, "deny:no"],
  [/\b(not|wrong|different|someone else)\b/, "deny:not_self"],
  [/\b(maybe|instead|actually)\b/, "deny:uncertain_or_correction"]
];

const THIRD_PARTY_TERMS =
  /\b(husband|wife|spouse|partner|friend|son|daughter|mother|father|parent|sister|brother|assistant|caregiver|carer|representative|colleague)\b/;

export function classifyIdentityConfirmationIntent(
  input: ClassifyIdentityConfirmationIntentInput
): IdentityConfirmationIntentResult {
  const normalized = normalizeText(input.transcript);
  const candidateName = normalizeCandidateName(input.candidateName);

  if (!normalized) return deterministic("unclear", 0.4, [], ["empty_transcript"]);
  if (/[?]/.test(input.transcript)) {
    return deterministic("unclear", 0.7, [], ["uncertain:question"]);
  }

  const denySignals = matchedSignals(normalized, DENY_PATTERNS);
  if (denySignals.length > 0) {
    return deterministic("deny", 0.95, [], denySignals);
  }

  const thirdPartySignals = thirdPartyRejections(normalized, candidateName);
  if (thirdPartySignals.length > 0) {
    return deterministic("third_party", 0.95, [], thirdPartySignals);
  }

  const selfSignals = selfConfirmationSignals(normalized, candidateName);
  if (selfSignals.length > 0) {
    return deterministic("confirm_self", 0.9, selfSignals, []);
  }

  return deterministic("unclear", 0.5, [], ["unknown_phrase"]);
}

function selfConfirmationSignals(
  normalized: string,
  candidateName: string | undefined
): string[] {
  const signals: string[] = [];
  if (/^(yes[, ]+)?(that'?s|that is) (me|my account|correct)[.!]?$/.test(normalized)) {
    signals.push("self:that_is_me");
  }
  if (/^(yes[, ]+)?correct[.!]?$/.test(normalized)) {
    signals.push("self:correct");
  }
  if (/^i confirm (that'?s|that is) (me|my account)[.!]?$/.test(normalized)) {
    signals.push("self:i_confirm_that_is_me");
  }
  if (!candidateName) return signals;

  const patterns = candidateNamePatterns(candidateName);
  if (patterns.some((pattern) => pattern.test(normalized))) {
    signals.push("self:candidate_name_exact");
  } else if (matchesRealtimeDuplicateSuffix(normalized, patterns, candidateName)) {
    signals.push("self:candidate_name_duplicate_suffix");
  }
  return signals;
}

function candidateNamePatterns(candidateName: string): RegExp[] {
  const name = escapeRegex(candidateName);
  const end = "[.!]?$";
  return [
    new RegExp(`^(yes[, ]+)?i confirm i am ${name}${end}`),
    new RegExp(`^i confirm i'm ${name}${end}`),
    new RegExp(`^(yes[, ]+)?i am ${name}${end}`),
    new RegExp(`^yes[, ]+i'm ${name}${end}`),
    new RegExp(`^this is ${name}${end}`)
  ];
}

function matchesRealtimeDuplicateSuffix(
  normalized: string,
  patterns: RegExp[],
  candidateName: string
): boolean {
  const words = normalized.split(" ").filter(Boolean);
  for (let index = 1; index < words.length; index += 1) {
    const suffix = words.slice(index).join(" ");
    if (!patterns.some((pattern) => pattern.test(suffix))) continue;
    const prefix = words.slice(0, index);
    if (isDuplicatePrefix(prefix, candidateName)) return true;
  }
  return false;
}

function isDuplicatePrefix(prefix: string[], candidateName: string): boolean {
  if (prefix.length === 0 || prefix.length > 4) return false;
  const allowed = new Set(["confirm", "i", "am", "i'm", ...candidateName.split(" ")]);
  return prefix.every((word) => allowed.has(word));
}

function thirdPartyRejections(
  normalized: string,
  candidateName: string | undefined
): string[] {
  const signals = matchedSignals(normalized, [[THIRD_PARTY_TERMS, "third_party:relationship"]]);
  if (candidateName && new RegExp(`\\b${escapeRegex(candidateName)}'s\\b`).test(normalized)) {
    signals.push("third_party:possessive_name");
  }
  return [...new Set(signals)];
}

function deterministic(
  intent: IdentityConfirmationIntent,
  confidence: number,
  matched_signals: string[],
  rejected_signals: string[]
): IdentityConfirmationIntentResult {
  return { intent, confidence, method: "deterministic", matched_signals, rejected_signals };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'?!.,\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateName(value: string | undefined): string | undefined {
  const normalized = value ? normalizeText(value).replace(/[^a-z0-9 ]+/g, " ").trim() : "";
  return normalized || undefined;
}

function matchedSignals(text: string, patterns: Array<[RegExp, string]>): string[] {
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, signal]) => signal);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
