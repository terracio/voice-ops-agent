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
import {
  redactExpectedForReport,
  redactResultForReport,
  redactScoringForReport
} from "./reportRedaction";
import {
  renderRealtimeRewardSections,
  serializeRealtimeScoring
} from "./reportGrouping";
import {
  realtimeAttemptDir,
  writeRealtimeAttemptArtifacts,
  type RealtimeAttemptArtifactPaths
} from "./runArtifacts";
import { renderRealtimeCrawlScores } from "./scorer";
import type { RealtimeCrawlScoring } from "./scorerTypes";

export type RealtimeReportPaths = Partial<RealtimeAttemptArtifactPaths> & {
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
  runArtifacts?: {
    attemptId?: string;
    reportRoot?: string;
    runId: string;
  };
  redacted?: boolean;
  scoring: RealtimeCrawlScoring;
  stage: string;
}): RealtimeReportPaths {
  const reportRoot = options.runArtifacts?.reportRoot ?? "reports";
  const runId = options.runArtifacts?.runId ?? options.result.run_id;
  const attemptId = options.runArtifacts?.attemptId ?? options.result.run_id;
  const reportDir = realtimeAttemptDir({
    attemptId,
    caseId: options.caseId,
    reportRoot,
    runId
  });
  mkdirSync(reportDir, { recursive: true });

  const shouldRedact = options.redacted ?? false;
  const jsonPath = join(reportDir, "report.json");
  const markdownPath = join(reportDir, "report.md");
  const tracePath = join(reportDir, "trace.json");
  const cleanAudio = options.preparedInput.walk_profile
    ? options.preparedInput.clean_audio
    : options.preparedInput.clean_audio ?? options.preparedInput.audio;
  const audioArtifacts = shouldRedact
    ? undefined
    : writeRealtimeAudioArtifacts({
      cleanAudio,
      profileAudio: options.preparedInput.walk_profile
        ? options.preparedInput.audio
        : undefined,
      reportDir,
      sampleRateHz: options.realtimeCase.audio.sample_rate_hz
    });
  const reportResult = shouldRedact
    ? redactResultForReport(options.result)
    : options.result;
  const reportExpected = shouldRedact
    ? redactExpectedForReport(options.realtimeCase.expected)
    : options.realtimeCase.expected;
  const reportScoring = shouldRedact
    ? redactScoringForReport(options.scoring)
    : options.scoring;
  const serializedScoring = serializeRealtimeScoring({
    realtimeCase: options.realtimeCase,
    scoring: reportScoring
  });
  const reportInputText = shouldRedact && options.preparedInput.input_text
    ? "[redacted]"
    : options.preparedInput.input_text;

  const eventLines = reportResult.trace
    .map((event, index) =>
      `${index + 1}. ${event.at} ${event.source}:${event.type}`
    )
    .join("\n");
  const toolLines = reportResult.tool_calls
    .map((toolCall, index) => {
      const policy = toolCall.policy_id ? ` policy=${toolCall.policy_id}` : "";
      return `${index + 1}. ${toolCall.tool_name} ${toolCall.status}${policy}`;
    })
    .join("\n");
  const transcriptLines = readableTranscriptFragments(
    reportResult.transcript_fragments
  )
    .map((fragment, index) => `${index + 1}. ${fragment.role}: ${fragment.text}`)
    .join("\n");
  const audioArtifactLines = audioArtifacts
    ? renderAudioArtifactLines(audioArtifacts)
    : "Audio artifacts: not written";
  const oobLines = renderOutOfBandTranscription(
    reportResult.out_of_band_transcription
  );

  writeFileSync(tracePath, `${JSON.stringify(reportResult.trace, null, 2)}\n`);
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        case_id: options.caseId,
        stage: options.stage,
        seed_id: options.realtimeCase.seed_id,
        reward_basis: options.realtimeCase.reward_basis,
        input_mode: options.preparedInput.input_mode,
        input_text: reportInputText,
        audio_metadata: options.preparedInput.audio_metadata,
        audio_artifacts: audioArtifacts,
        audio_profile: options.preparedInput.walk_profile,
        expected: reportExpected,
        primary_rewards: serializedScoring.primary_rewards,
        diagnostics: serializedScoring.diagnostics,
        raw_scores: serializedScoring.raw_scores,
        reward_evaluation: serializedScoring.reward_evaluation,
        reward_failures: serializedScoring.reward_failures,
        diagnostic_failures: serializedScoring.diagnostic_failures,
        raw_diagnostics: serializedScoring.raw_diagnostics,
        scoring: serializedScoring,
        report_redacted: shouldRedact,
        env_file_status: options.env_file_status,
        trace_path: tracePath,
        ...reportResult
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
      `Reward basis: ${options.realtimeCase.reward_basis.join(", ")}`,
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
      `Report redacted: ${shouldRedact ? "yes" : "no"}`,
      `Scoring status: ${reportScoring.status}`,
      `Score failures: ${reportScoring.score_failures}`,
      "",
      "## Fixture",
      "",
      `Input text: ${reportInputText ?? ""}`,
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
      renderRealtimeRewardSections({
        realtimeCase: options.realtimeCase,
        scoring: reportScoring
      }),
      "",
      renderRealtimeCrawlScores(reportScoring),
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

  const runArtifactPaths = options.runArtifacts
    ? writeRealtimeAttemptArtifacts({
        audioArtifacts,
        caseId: options.caseId,
        env_file_status: options.env_file_status,
        preparedInput: options.preparedInput,
        realtimeCase: options.realtimeCase,
        reportRoot: options.runArtifacts.reportRoot,
        result: options.result,
        attemptId: options.runArtifacts.attemptId,
        redacted: shouldRedact,
        runId: options.runArtifacts.runId,
        scoring: options.scoring,
        stage: options.stage
      })
    : undefined;

  return {
    audio_artifacts: audioArtifacts,
    json_path: jsonPath,
    markdown_path: markdownPath,
    trace_path: tracePath,
    ...runArtifactPaths
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
