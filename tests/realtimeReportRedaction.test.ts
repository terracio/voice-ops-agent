import { readFileSync, rmSync } from "node:fs";
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
  it("redacts sensitive report artifacts across json and markdown", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "crawl",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const sensitive = "SECRET_CUSTOMER_TOKEN_123";
    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "loaded",
      preparedInput: {
        input_mode: "text",
        input_text: "Caller requested account help.",
        audio_metadata: { source: "test" }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: {
        ...createResult(),
        audit_events: [{
          event_id: "aud_1",
          timestamp: "2026-05-12T10:00:00.000Z",
          run_id: "unit_report_trace",
          actor: "agent",
          event_type: "read",
          customer_id: "cus_001",
          details: {
            transcript_excerpt: sensitive,
            resource_id: "resource_sensitive",
            nested: { customer_id: "cus_001", text: sensitive }
          }
        }],
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
            summary: sensitive
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
        out_of_band_transcription: { status: "completed", transcript: sensitive },
        tool_calls: [{
          audit_event_ids: ["aud_1"],
          input: { customer_id: "cus_001", note: sensitive },
          started_at: "2026-05-12T10:00:00.000Z",
          status: "completed",
          tool_call_id: "tc_1",
          tool_name: "lookup_customer",
          output: { note: sensitive }
        }],
        trace: [{ at: "2026-05-12T10:00:00.000Z", source: "runner", type: sensitive }],
        transcript_fragments: [{
          at: "2026-05-12T10:00:00.000Z",
          role: "user",
          source_event_type: "response.done",
          text: sensitive
        }]
      },
      scoring: createScoring(),
      stage: "crawl"
    });

    const reportJson = readFileSync(paths.json_path, "utf8");
    const reportMd = readFileSync(paths.markdown_path, "utf8");

    expect(reportJson).not.toContain(sensitive);
    expect(reportMd).not.toContain(sensitive);
    expect(reportJson).toContain('"trace": []');
    expect(reportJson).toContain('"trace_path"');
    expect(reportMd).toContain("[redacted]");

    rmSync(reportDir, { force: true, recursive: true });
  });
});

function createResult(): RealtimeRunnerResult {
  return {
    audit_events: [],
    audit_ids: [],
    event_counts: {},
    final_state: {
      customer_states: [],
      kitchen_deltas: [],
      payment_followups: []
    },
    model: "gpt-realtime-2",
    platform_tracing: {
      enabled: true,
      group_id: "unit_group",
      workflow_name: "Unit Realtime Eval"
    },
    run_id: "unit_report_trace",
    session_id: "unit_report_trace_session",
    status: "completed",
    tool_calls: [],
    trace: [{
      at: "2026-05-12T10:00:00.000Z",
      source: "runner",
      type: "start"
    }],
    transcript_fragments: [],
    transport: REALTIME_RUNNER_TRANSPORT
  };
}

function createScoring(): RealtimeCrawlScoring {
  return {
    diagnostics: [],
    score_failures: 0,
    scores: [],
    status: "passed"
  };
}
