import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REALTIME_RUNNER_TRANSPORT, type RealtimeRunnerResult } from "../src/agent";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { writeRealtimeReports } from "../src/evals/realtime/reporting";
import type { RealtimeCrawlScoring } from "../src/evals/realtime/scorerTypes";
import {
  resolveRealtimeCaseIds,
  shouldFailRealtimeEval,
  type RealtimeCaseRunSummary
} from "../src/evals/realtime/suite";

describe("realtime eval suite", () => {
  it("resolves the first Crawl suite when no case is provided", () => {
    expect(resolveRealtimeCaseIds({ stage: "crawl" })).toEqual([
      "maya_smoke",
      "missing_identity_asks_clarification",
      "ambiguous_date_asks_clarification",
      "allergy_change_escalates",
      "payment_settlement_forbidden"
    ]);
  });

  it("keeps explicit case runs individual", () => {
    expect(
      resolveRealtimeCaseIds({ caseId: "maya_smoke", stage: "crawl" })
    ).toEqual(["maya_smoke"]);
  });

  it("rejects default suites that are not defined yet", () => {
    expect(() => resolveRealtimeCaseIds({ stage: "walk" })).toThrow(
      "No default realtime walk suite is defined yet. Pass --case."
    );
  });

  it("marks completed scoring failures as eval failures", () => {
    expect(shouldFailRealtimeEval([
      createSummary({ scoring_status: "failed", status: "completed" })
    ])).toBe(true);
    expect(shouldFailRealtimeEval([
      createSummary({ scoring_status: "passed", status: "completed" })
    ])).toBe(false);
  });

  it("writes a separate raw trace file and report pointer", () => {
    const reportDir = join(
      "reports",
      "realtime",
      "crawl",
      "maya_smoke",
      "unit_report_trace"
    );
    rmSync(reportDir, { force: true, recursive: true });

    const paths = writeRealtimeReports({
      caseId: "maya_smoke",
      env_file_status: "skipped",
      preparedInput: {
        input_mode: "audio",
        input_text: "Please look up Maya.",
        audio_metadata: { source: "test" }
      },
      realtimeCase: loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" }),
      result: createResult(),
      scoring: createScoring(),
      stage: "crawl"
    });

    expect(paths.trace_path).toBe(join(reportDir, "trace.json"));
    expect(existsSync(paths.trace_path)).toBe(true);
    expect(JSON.parse(readFileSync(paths.trace_path, "utf8"))).toEqual([
      {
        at: "2026-05-12T10:00:00.000Z",
        source: "runner",
        type: "start"
      }
    ]);
    expect(
      JSON.parse(readFileSync(paths.json_path, "utf8")).trace_path
    ).toBe(paths.trace_path);

    rmSync(reportDir, { force: true, recursive: true });
  });
});

function createSummary(
  overrides: Partial<RealtimeCaseRunSummary> = {}
): RealtimeCaseRunSummary {
  return {
    audit_event_count: 0,
    case_id: "maya_smoke",
    env_file_status: "skipped",
    input_mode: "audio",
    json_path: "report.json",
    markdown_path: "report.md",
    model: "gpt-realtime-2",
    score_failures: 0,
    scoring_status: "passed",
    stage: "crawl",
    status: "completed",
    tool_call_count: 0,
    trace_event_count: 0,
    trace_path: "trace.json",
    transcript_fragment_count: 0,
    transport: REALTIME_RUNNER_TRANSPORT,
    ...overrides
  };
}

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
