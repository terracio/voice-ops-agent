import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RealtimeRunnerResult,
  RealtimeTranscriptFragment
} from "../../realtime/runner/types";
import {
  writeRealtimeAudioArtifacts,
  type RealtimeAudioArtifacts
} from "./audioArtifacts";
import type { RealtimeEvalCase } from "./caseLoader";
import type { PreparedRealtimeInput } from "./input";
import { renderRealtimeCrawlScores } from "./scorer";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export type RealtimeReportPaths = {
  audio_artifacts?: RealtimeAudioArtifacts;
  json_path: string;
  markdown_path: string;
  trace_path: string;
};

export function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createRunStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function isFinalTranscriptFragment(fragment: RealtimeTranscriptFragment): boolean {
  return (
    fragment.source_event_type ===
      "conversation.item.input_audio_transcription.completed" ||
    fragment.source_event_type.endsWith(".done")
  );
}

function collapseTranscriptDeltas(
  fragments: RealtimeTranscriptFragment[]
): RealtimeTranscriptFragment[] {
  const collapsed: RealtimeTranscriptFragment[] = [];

  for (const fragment of fragments) {
    const previous = collapsed.at(-1);
    const fragmentKey = `${fragment.role}:${fragment.response_id ?? fragment.item_id ?? ""}`;
    const previousKey = previous
      ? `${previous.role}:${previous.response_id ?? previous.item_id ?? ""}`
      : undefined;

    if (previous && previousKey === fragmentKey) {
      previous.text += fragment.text;
      continue;
    }
    collapsed.push({ ...fragment });
  }

  return collapsed;
}

function readableTranscriptFragments(
  fragments: RealtimeTranscriptFragment[]
): RealtimeTranscriptFragment[] {
  const finalFragments = fragments.filter(isFinalTranscriptFragment);
  return finalFragments.length > 0
    ? finalFragments
    : collapseTranscriptDeltas(fragments);
}

export function writeRealtimeReports(options: {
  caseId: string;
  env_file_status: string;
  preparedInput: PreparedRealtimeInput;
  realtimeCase: RealtimeEvalCase;
  result: RealtimeRunnerResult;
  scoring: RealtimeCrawlScoring;
  stage: string;
}): RealtimeReportPaths {
  const reportDir = join(
    "reports",
    "realtime",
    safePathSegment(options.stage),
    safePathSegment(options.caseId),
    safePathSegment(options.result.run_id)
  );
  mkdirSync(reportDir, { recursive: true });

  const jsonPath = join(reportDir, "report.json");
  const markdownPath = join(reportDir, "report.md");
  const tracePath = join(reportDir, "trace.json");
  const cleanAudio = options.preparedInput.walk_profile
    ? options.preparedInput.clean_audio
    : options.preparedInput.clean_audio ?? options.preparedInput.audio;
  const audioArtifacts = writeRealtimeAudioArtifacts({
    cleanAudio,
    profileAudio: options.preparedInput.walk_profile
      ? options.preparedInput.audio
      : undefined,
    reportDir,
    sampleRateHz: options.realtimeCase.audio.sample_rate_hz
  });
  const redactedResult = redactResultForReport(options.result);

  const eventLines = redactedResult.trace
    .map((event, index) =>
      `${index + 1}. ${event.at} ${event.source}:${event.type}`
    )
    .join("\n");
  const toolLines = options.result.tool_calls
    .map((toolCall, index) => {
      const policy = toolCall.policy_id ? ` policy=${toolCall.policy_id}` : "";
      return `${index + 1}. ${toolCall.tool_name} ${toolCall.status}${policy}`;
    })
    .join("\n");
  const transcriptLines = readableTranscriptFragments(
    options.result.transcript_fragments
  )
    .map((fragment, index) => `${index + 1}. ${fragment.role}: [redacted]`)
    .join("\n");
  const audioArtifactLines = audioArtifacts
    ? renderAudioArtifactLines(audioArtifacts)
    : "Audio artifacts: not written";
  const oobLines = renderOutOfBandTranscription(
    redactedResult.out_of_band_transcription
  );

  writeFileSync(tracePath, `${JSON.stringify(options.result.trace, null, 2)}\n`);
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        case_id: options.caseId,
        stage: options.stage,
        seed_id: options.realtimeCase.seed_id,
        input_mode: options.preparedInput.input_mode,
        input_text: options.preparedInput.input_text,
        audio_metadata: options.preparedInput.audio_metadata,
        audio_artifacts: audioArtifacts,
        audio_profile: options.preparedInput.walk_profile,
        expected: options.realtimeCase.expected,
        scoring: options.scoring,
        env_file_status: options.env_file_status,
        trace_path: tracePath,
        ...redactedResult
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    markdownPath,
    [
      "# Realtime Eval Report",
      "",
      `Case: ${options.caseId}`,
      `Stage: ${options.stage}`,
      `Run: ${options.result.run_id}`,
      `Seed: ${options.realtimeCase.seed_id}`,
      `Input mode: ${options.preparedInput.input_mode}`,
      `Status: ${options.result.status}`,
      `Model: ${options.result.model}`,
      `Transport: ${options.result.transport}`,
      `Platform tracing: ${options.result.platform_tracing.enabled ? "enabled" : "disabled"}`,
      options.result.platform_tracing.group_id
        ? `Platform trace group: ${options.result.platform_tracing.group_id}`
        : undefined,
      `Trace events: ${options.result.trace.length}`,
      `Trace file: ${tracePath}`,
      `Tool calls: ${options.result.tool_calls.length}`,
      `Audit events: ${options.result.audit_events.length}`,
      `Transcript fragments: ${options.result.transcript_fragments.length}`,
      `Scoring status: ${options.scoring.status}`,
      `Score failures: ${options.scoring.score_failures}`,
      "",
      "## Fixture",
      "",
      `Input text: ${options.preparedInput.input_text}`,
      options.preparedInput.audio_metadata
        ? `Audio: ${JSON.stringify(options.preparedInput.audio_metadata)}`
        : "Audio: not used",
      "",
      "## Audio Artifacts",
      "",
      audioArtifactLines,
      options.preparedInput.walk_profile
        ? `Profile metadata: ${JSON.stringify(options.preparedInput.walk_profile)}`
        : undefined,
      "",
      "## Transcript",
      "",
      transcriptLines || "No transcript fragments captured.",
      "",
      `Raw transcript fragments: ${options.result.transcript_fragments.length}`,
      "",
      "## Out-of-Band Realtime Transcript",
      "",
      oobLines,
      "",
      "## Scoring",
      "",
      renderRealtimeCrawlScores(options.scoring),
      "",
      "## Tool Calls",
      "",
      toolLines || "No tool calls captured.",
      "",
      "## Event Timeline",
      "",
      eventLines || "No events captured."
    ].join("\n")
  );

  return {
    audio_artifacts: audioArtifacts,
    json_path: jsonPath,
    markdown_path: markdownPath,
    trace_path: tracePath
  };
}

function redactResultForReport(result: RealtimeRunnerResult): RealtimeRunnerResult {
  const redactString = (_value: string): string => "[redacted]";

  const redactUnknown = (value: unknown): unknown => {
    if (typeof value === "string") {
      return redactString(value);
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

  const redactAuditDetails = (details: Record<string, unknown>): Record<string, unknown> =>
    redactUnknown(details) as Record<string, unknown>;

  return {
    ...result,
    trace: [] as RealtimeRunnerResult["trace"],
    audit_events: result.audit_events.map((event) => ({
      ...event,
      customer_id: event.customer_id ? "[redacted]" : event.customer_id,
      details: redactAuditDetails(event.details)
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

function renderOutOfBandTranscription(
  transcription: RealtimeRunnerResult["out_of_band_transcription"]
): string {
  if (!transcription) return "Not requested.";
  return [
    `Status: ${transcription.status}`,
    transcription.response_id ? `Response ID: ${transcription.response_id}` : undefined,
    transcription.reason ? `Reason: ${transcription.reason}` : undefined,
    "",
    transcription.transcript ?? ""
  ].filter((line): line is string => line !== undefined).join("\n");
}

function renderAudioArtifactLines(artifacts: RealtimeAudioArtifacts): string {
  const lines: string[] = [];
  if (artifacts.clean_input) {
    lines.push(
      `Clean PCM: ${artifacts.clean_input.pcm_path}`,
      `Clean WAV: ${artifacts.clean_input.wav_path}`,
      `Clean checksum: ${artifacts.clean_input.checksum_sha256}`,
      `Clean sample rate: ${artifacts.clean_input.sample_rate_hz} Hz`,
      `Clean duration: ${artifacts.clean_input.duration_ms} ms`,
      `Clean byte length: ${artifacts.clean_input.byte_length}`
    );
  }
  if (artifacts.profile_input) {
    lines.push(
      `Profile PCM: ${artifacts.profile_input.pcm_path}`,
      `Profile WAV: ${artifacts.profile_input.wav_path}`,
      `Profile checksum: ${artifacts.profile_input.checksum_sha256}`,
      `Profile sample rate: ${artifacts.profile_input.sample_rate_hz} Hz`,
      `Profile duration: ${artifacts.profile_input.duration_ms} ms`,
      `Profile byte length: ${artifacts.profile_input.byte_length}`
    );
  }
  return lines.join("\n");
}
