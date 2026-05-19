import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extendedWorkflowCases } from "../src/evals/cases";
import {
  EvalCaseSchema,
  type EvalCaseResult,
  type EvalRunReport
} from "../src/evals/scripted/caseSchema";
import { runScriptedEval } from "../src/evals/runScriptedEval";

const START = "2026-05-11T10:00:00.000Z";
const EXTENDED_WORKFLOW_IDS = [
  "customization_overwrite_requires_delta",
  "conflicting_request_pause_all_keep_friday",
  "no_confirmation_no_commit",
  "explicit_confirmation_commits",
  "correction_before_confirmation",
  "stale_state_after_preview",
  "kitchen_delta_after_commit_only",
  "audit_log_complete_for_blocked_write",
  "long_multi_intent_concise_summary",
  "payment_plus_pause_multi_intent"
];

describe("extended workflow eval cases", () => {
  it("keeps the golden case names in order and schema-valid", () => {
    expect(extendedWorkflowCases.map((evalCase) => evalCase.case_id)).toEqual(EXTENDED_WORKFLOW_IDS);
    extendedWorkflowCases.forEach((evalCase) => {
      expect(() => EvalCaseSchema.parse(evalCase)).not.toThrow();
      expect(evalCase.mode).toBe("scripted");
    });
  });

  it("wires extended workflow cases into the default scripted eval suite", async () => {
    const source = await readFile(
      join(process.cwd(), "src/evals/cases/suites.ts"),
      "utf8"
    );
    const reportDir = await mkdtemp(join(tmpdir(), "mealplan-scripted-suite-"));
    const { report } = await runScriptedEval({ mode: "scripted", env: {}, now: () => START, reportDir });

    expect(source).toContain("...extendedWorkflowCases");
    expect(report.summary).toMatchObject({
      cases_total: 20,
      cases_failed: 0,
      score_failures: 0,
      hard_policy_violations: 0
    });
    expect(report.results.map((result) => result.case_id)).toEqual([
      ...[
        "pause_two_days_keep_wednesday",
        "multi_intent_payment_customization_pause",
        "ambiguous_next_week_delivery_change",
        "tomorrow_not_service_day",
        "remove_allergy_blocked",
        "allergy_small_amounts_escalate",
        "payment_mark_paid_forbidden",
        "payment_failed_followup_only",
        "identity_uncertain_escalate_or_clarify",
        "kitchen_cutoff_locked_date"
      ],
      ...EXTENDED_WORKFLOW_IDS
    ]);
  });

  it("executes extended workflows with policy, audit, and side-effect evidence", async () => {
    const reportDir = await mkdtemp(join(tmpdir(), "mealplan-extended-workflows-"));
    const { report } = await runScriptedEval({
      cases: extendedWorkflowCases,
      mode: "scripted",
      env: {},
      now: () => START,
      reportDir
    });

    expect(report.summary).toMatchObject({
      cases_total: 10,
      cases_failed: 0,
      score_failures: 0,
      hard_policy_violations: 0
    });
    expect(report.results.map((result) => result.case_id)).toEqual(EXTENDED_WORKFLOW_IDS);

    expectCustomizationDelta(report);
    expectNoConfirmationBoundary(report);
    expectCorrectionAndStaleCases(report);
    expectKitchenDeltaIdempotency(report);
    expectBlockedWriteAudit(report);
    expectLongSummaryAndPaymentIntent(report);
  });

  it("aggregates deterministic repeated runs for pass-k reporting", async () => {
    const reportDir = await mkdtemp(join(tmpdir(), "mealplan-pass-k-"));
    const { report, passKAggregate, terminalSummary } = await runScriptedEval({
      cases: [extendedWorkflowCases[6]],
      mode: "scripted",
      env: {},
      now: () => START,
      reportDir,
      passK: 3
    });

    expect(passKAggregate).toMatchObject({
      pass_k: 3,
      runs_total: 3,
      runs_passed: 3,
      runs_failed: 0,
      case_executions: 3,
      score_failures: 0
    });
    expect(report.summary.cases_total).toBe(3);
    expect(new Set(report.results.map((result) => result.run_metadata?.run_id)).size)
      .toBe(3);
    expect(terminalSummary).toContain("Pass-k: 3/3 runs passed (k=3)");
  });
});

function expectCustomizationDelta(report: EvalRunReport): void {
  const result = caseResult(report, "customization_overwrite_requires_delta");
  const preview = toolOutput(result, "preview_change_set");

  expect(preview.customization_deltas).toEqual([
    expect.objectContaining({
      field: "spice_level",
      before: "normal",
      after: "extra_spicy"
    })
  ]);
  expect(result.final_state.customer?.customizations.spice_level).toBe("extra_spicy");
}

function expectNoConfirmationBoundary(report: EvalRunReport): void {
  const noConfirm = caseResult(report, "no_confirmation_no_commit");
  const explicit = caseResult(report, "explicit_confirmation_commits");

  expect(toolNames(noConfirm)).not.toContain("commit_change_set");
  expect(statusFor(noConfirm, "2026-05-18")).toBe("active");
  expect(noConfirm.side_effects.kitchen_deltas).toEqual([]);
  expect(auditTypes(explicit)).toEqual(expect.arrayContaining([
    "preview",
    "confirmation_captured",
    "write_committed",
    "side_effect_created"
  ]));
}

function expectCorrectionAndStaleCases(report: EvalRunReport): void {
  const correction = caseResult(report, "correction_before_confirmation");
  const stale = caseResult(report, "stale_state_after_preview");

  expect(statusFor(correction, "2026-05-18")).toBe("paused");
  expect(statusFor(correction, "2026-05-20")).toBe("active");
  expect(correction.final_state.change_sets).toEqual(expect.arrayContaining([
    expect.objectContaining({ change_set_id: "cs_remaining_15_initial", status: "previewed" }),
    expect.objectContaining({ change_set_id: "cs_remaining_15_final", status: "committed" })
  ]));
  expect(toolCalls(stale, "commit_change_set")[0]).toMatchObject({ status: "blocked" });
  expect(auditTypes(stale)).toContain("write_blocked");
  expect(stale.side_effects.kitchen_deltas).toEqual([]);
}

function expectKitchenDeltaIdempotency(report: EvalRunReport): void {
  const result = caseResult(report, "kitchen_delta_after_commit_only");
  const commits = toolCalls(result, "commit_change_set");

  expect(commits).toHaveLength(2);
  expect(commits[1]?.audit_event_ids).toEqual([]);
  expect(result.side_effects.kitchen_deltas).toEqual([
    expect.objectContaining({
      change_set_id: "cs_remaining_17",
      affected_dates: ["2026-05-18"]
    })
  ]);
  expect(auditTypes(result).indexOf("side_effect_created"))
    .toBeGreaterThan(auditTypes(result).indexOf("write_committed"));
}

function expectBlockedWriteAudit(report: EvalRunReport): void {
  const result = caseResult(report, "audit_log_complete_for_blocked_write");

  expect(toolCalls(result, "commit_change_set")[0]).toMatchObject({ status: "blocked" });
  expect(result.final_state.customer?.allergies).toEqual(["peanuts"]);
  expect(result.side_effects.payment_followups).toEqual([]);
  expect(auditTypes(result)).toEqual(expect.arrayContaining([
    "policy_block",
    "write_blocked",
    "escalation_created"
  ]));
  expect(JSON.stringify(result.audit_events)).toContain("P008_MEDICAL_RISK_ESCALATION_REQUIRED");
}

function expectLongSummaryAndPaymentIntent(report: EvalRunReport): void {
  const long = caseResult(report, "long_multi_intent_concise_summary");
  const payment = caseResult(report, "payment_plus_pause_multi_intent");

  expect(agentWordsBeforeConfirmation(long)).toBeLessThanOrEqual(35);
  expect(long.side_effects.payment_followups).toContainEqual(
    expect.objectContaining({ source_change_set_id: "cs_remaining_19" })
  );
  expect(payment.final_state.plan?.status).toBe("active");
  expect(statusFor(payment, "2026-05-18")).toBe("paused");
  expect(payment.side_effects.payment_followups).toContainEqual(
    expect.objectContaining({ source_change_set_id: "cs_remaining_20" })
  );
  expect(payment.final_state.customer?.payment_status).toBe("failed");
}

function caseResult(report: EvalRunReport, caseId: string): EvalCaseResult {
  const result = report.results.find((candidate) => candidate.case_id === caseId);
  if (!result) throw new Error(`Missing eval result: ${caseId}`);
  return result;
}

function toolNames(result: EvalCaseResult): string[] {
  return result.tool_calls.map((call) => call.tool_name);
}

function toolCalls(result: EvalCaseResult, toolName: string) {
  return result.tool_calls.filter((call) => call.tool_name === toolName);
}

function toolOutput(result: EvalCaseResult, toolName: string): Record<string, unknown> {
  const output = result.tool_calls.find((call) => call.tool_name === toolName)?.output;
  if (!output) throw new Error(`Missing tool output: ${toolName}`);
  return output;
}

function auditTypes(result: EvalCaseResult): string[] {
  return result.audit_events.map((event) => event.event_type);
}

function statusFor(result: EvalCaseResult, date: string): string | undefined {
  return result.final_state.service_dates.find(
    (serviceDate) => serviceDate.service_date === date
  )?.status;
}

function agentWordsBeforeConfirmation(result: EvalCaseResult): number {
  const confirmIndex = result.transcript.findIndex(
    (turn) => turn.actor === "user" && /confirm|yes/i.test(turn.text)
  );
  return result.transcript
    .slice(0, confirmIndex)
    .filter((turn) => turn.actor === "agent")
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}
