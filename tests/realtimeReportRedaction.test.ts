import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REALTIME_RUNNER_TRANSPORT,
  type RealtimeRunnerResult
} from "../src/realtime/runner/types";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";

describe("realtime report redaction", () => {
  it("writes raw report artifacts by default for local debugging", () => {
    const reportRoot = join(
      "reports",
      "test-realtime-report-redaction-raw"
    );
    rmSync(reportRoot, { force: true, recursive: true });

    const sensitive = "SECRET_CUSTOMER_TOKEN_123";
    const paths = writeRealtimeReports({
      ...createReportInput({
        reportRoot,
        runId: "unit_raw_report_trace",
        sensitive
      })
    });

    const reportJson = readFileSync(paths.json_path, "utf8");
    const reportMd = readFileSync(paths.markdown_path, "utf8");
    const traceJson = readFileSync(paths.trace_path, "utf8");
    const audioManifest = readFileSync(
      paths.run_artifact_files?.audio_manifest_path ?? "",
      "utf8"
    );

    expect(reportJson).toContain(sensitive);
    expect(reportJson).toContain('"report_redacted": false');
    expect(reportJson).toContain('"clean_input"');
    expect(audioManifest).toContain('"clean_input"');
    expect(reportMd).toContain(sensitive);
    expect(reportMd).toContain("Report redacted: no");
    expect(traceJson).toContain(sensitive);
    expect(paths.audio_artifacts?.clean_input?.wav_path).toBeTruthy();
    expect(existsSync(paths.audio_artifacts?.clean_input?.wav_path ?? "")).toBe(true);

    rmSync(reportRoot, { force: true, recursive: true });
  });

  it("redacts sensitive report artifacts when requested", () => {
    const reportRoot = join(
      "reports",
      "test-realtime-report-redaction-redacted"
    );
    rmSync(reportRoot, { force: true, recursive: true });

    const sensitive = "SECRET_CUSTOMER_TOKEN_123";
    const paths = writeRealtimeReports({
      ...createReportInput({
        reportRoot,
        runId: "unit_redacted_report_trace",
        sensitive
      }),
      redacted: true
    });

    const reportJson = readFileSync(paths.json_path, "utf8");
    const reportMd = readFileSync(paths.markdown_path, "utf8");
    const traceJson = readFileSync(paths.trace_path, "utf8");
    const audioManifest = readFileSync(
      paths.run_artifact_files?.audio_manifest_path ?? "",
      "utf8"
    );

    expect(reportJson).not.toContain(sensitive);
    expect(reportMd).not.toContain(sensitive);
    expect(traceJson).not.toContain(sensitive);
    expect(audioManifest).not.toContain('"clean_input"');
    expect(audioManifest).toContain("audio files were omitted");
    expect(reportJson).toContain('"trace": []');
    expect(reportJson).toContain('"report_redacted": true');
    expect(reportJson).toContain('"trace_path"');
    expect(reportJson).toContain('"scoring"');
    expect(reportJson).toContain('"message": "[redacted]"');
    expect(reportJson).not.toContain('"clean_input"');
    expect(reportMd).toContain("[redacted]");
    expect(reportMd).toContain("Report redacted: yes");
    expect(paths.audio_artifacts).toBeUndefined();

    rmSync(reportRoot, { force: true, recursive: true });
  });
});

function createReportInput(options: {
  reportRoot: string;
  runId: string;
  sensitive: string;
}): Parameters<typeof writeRealtimeReports>[0] {
  const realtimeCase = loadRealtimeEvalCase({
    caseId: "customer_identity_lookup",
    stage: "crawl"
  });
  return {
    caseId: "customer_identity_lookup",
    env_file_status: "loaded",
    preparedInput: {
      audio: new Uint8Array([0, 0, 1, 0, 2, 0, 3, 0]).buffer,
      input_mode: "audio",
      input_text: `Caller requested account help. ${options.sensitive}`,
      audio_metadata: { source: "test" }
    },
    realtimeCase: {
      ...realtimeCase,
      expected: {
        ...realtimeCase.expected,
        transcript_hint: `Hint includes ${options.sensitive}`,
        expected_final_state: {
          ...realtimeCase.expected.expected_final_state,
          customer_ids: [options.sensitive]
        }
      }
    },
    result: createResult({
      runId: options.runId,
      sensitive: options.sensitive
    }),
    runArtifacts: {
      attemptId: "attempt_001",
      reportRoot: options.reportRoot,
      runId: options.runId
    },
    scoring: createScoring(options.sensitive),
    stage: "crawl"
  };
}

function createResult(options: {
  runId: string;
  sensitive: string;
}): RealtimeRunnerResult {
  return {
    audit_events: [{
      event_id: "aud_1",
      timestamp: "2026-05-12T10:00:00.000Z",
      run_id: options.runId,
      actor: "agent",
      event_type: "read",
      customer_id: "cus_001",
      details: {
        transcript_excerpt: options.sensitive,
        resource_id: "resource_sensitive",
        nested: { customer_id: "cus_001", text: options.sensitive }
      }
    }],
    audit_ids: [],
    event_counts: {},
    final_state: {
      customer_states: [{
        customer: {
          customer_id: "cus_001",
          name: "Maya Secret",
          phone: "+1-555-555-1234",
          timezone: "Asia/Dubai",
          identity_confidence: "confirmed",
          state_version: 3,
          plan_id: "plan_secret",
          allergies: ["peanut"],
          customizations: {
            spice_level: "normal",
            dislikes: ["onion"],
            protein_preferences: ["fish"]
          },
          payment_last_checked_at: "2026-05-12T10:00:00.000Z",
          payment_status: "past_due"
        },
        plan: {
          customer_id: "cus_001",
          delivery_days: ["Monday"],
          meals_per_week: 5,
          plan_id: "plan_secret",
          plan_name: "Secret Plan",
          status: "active"
        },
        service_dates: [{
          service_date: "2026-05-20",
          day_of_week: "Wednesday",
          status: "active",
          kitchen_cutoff_at: "2026-05-19T18:00:00.000Z",
          kitchen_locked: false
        }]
      }],
      kitchen_deltas: [{
        created_at: "2026-05-12T10:00:00.000Z",
        customer_id: "cus_001",
        delta_id: "kdelta_1",
        change_set_id: "cs_1",
        idempotency_key: "idem_secret",
        affected_dates: ["2026-05-20"],
        summary: options.sensitive
      }],
      payment_followups: [{
        created_at: "2026-05-12T10:00:00.000Z",
        customer_id: "cus_001",
        followup_id: "pf_1",
        idempotency_key: "idem_followup",
        reason: "past_due",
        status: "open",
        source_change_set_id: "cs_1"
      }]
    },
    model: "gpt-realtime-2",
    out_of_band_transcription: {
      status: "completed",
      transcript: options.sensitive
    },
    platform_tracing: {
      enabled: true,
      group_id: "unit_group",
      workflow_name: "Unit Realtime Eval"
    },
    run_id: options.runId,
    session_id: `${options.runId}_session`,
    status: "completed",
    tool_calls: [{
      audit_event_ids: ["aud_1"],
      input: { customer_id: "cus_001", note: options.sensitive },
      started_at: "2026-05-12T10:00:00.000Z",
      status: "completed",
      tool_call_id: "tc_1",
      tool_name: "lookup_customer",
      output: { note: options.sensitive }
    }],
    trace: [{
      at: "2026-05-12T10:00:00.000Z",
      source: "runner",
      type: options.sensitive
    }],
    transcript_fragments: [{
      at: "2026-05-12T10:00:00.000Z",
      role: "user",
      source_event_type: "response.done",
      text: options.sensitive
    }],
    transport: REALTIME_RUNNER_TRANSPORT
  };
}

function createScoring(sensitive: string): RealtimeCrawlScoring {
  return {
    diagnostics: [{
      category: "state",
      failure_type: "final_state_mismatch",
      message: `Expected final state snapshot for ${sensitive} was missing.`
    }],
    score_failures: 1,
    scores: [{
      category: "state",
      failure_type: "final_state_mismatch",
      message: `Customer state changed for ${sensitive}.`,
      passed: false
    }],
    status: "failed"
  };
}
