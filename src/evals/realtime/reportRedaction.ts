import type { RealtimeRunnerResult } from "../../realtime/runner/types";
import type { RealtimeEvalCase } from "./caseLoader";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export function redactResultForReport(
  result: RealtimeRunnerResult
): RealtimeRunnerResult {
  const redactUnknown = (value: unknown): unknown => {
    if (typeof value === "string") {
      return "[redacted]";
    }
    if (Array.isArray(value)) {
      return value.map(redactUnknown);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
          if (
            key === "transcript_excerpt" ||
            key === "resource_id" ||
            key === "customer_id" ||
            key === "tool_result" ||
            key === "tool_input" ||
            key === "tool_output"
          ) {
            return [key, "[redacted]"];
          }
          return [key, redactUnknown(entry)];
        })
      );
    }
    return value;
  };

  return {
    ...result,
    trace: [] as RealtimeRunnerResult["trace"],
    audit_events: result.audit_events.map((event) => ({
      ...event,
      customer_id: event.customer_id ? "[redacted]" : event.customer_id,
      details: redactUnknown(event.details) as Record<string, unknown>
    })),
    final_state: {
      ...result.final_state,
      customer_states: [],
      kitchen_deltas: [],
      payment_followups: []
    },
    tool_calls: result.tool_calls.map((toolCall) => ({
      ...toolCall,
      input: "[redacted]",
      output: "[redacted]"
    })),
    transcript_fragments: result.transcript_fragments.map((fragment) => ({
      ...fragment,
      text: "[redacted]"
    })),
    out_of_band_transcription: result.out_of_band_transcription
      ? {
          ...result.out_of_band_transcription,
          transcript: result.out_of_band_transcription.transcript
            ? "[redacted]"
            : result.out_of_band_transcription.transcript
        }
      : result.out_of_band_transcription
  };
}

export function redactExpectedForReport(
  expected: RealtimeEvalCase["expected"]
): RealtimeEvalCase["expected"] {
  return {
    ...expected,
    transcript_hint: expected.transcript_hint ? "[redacted]" : expected.transcript_hint,
    notes: expected.notes ? "[redacted]" : expected.notes,
    expected_final_state: {
      ...expected.expected_final_state,
      customer_ids: []
    }
  };
}

export function redactScoringForReport(
  scoring: RealtimeCrawlScoring
): RealtimeCrawlScoring {
  return {
    ...scoring,
    diagnostics: scoring.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      message: "[redacted]"
    })),
    scores: scoring.scores.map((score) => ({
      ...score,
      message: "[redacted]"
    }))
  };
}
