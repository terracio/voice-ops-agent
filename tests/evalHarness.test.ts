import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCustomer,
  listAuditEvents,
  listKitchenExportDeltas,
  listPaymentFollowups,
  resetDb,
  savePaymentFollowup
} from "../src/domain/db";
import type { EvalCase, EvalCaseResult } from "../src/evals/caseSchema";
import {
  DEFAULT_EVAL_SCORING_EXPECTATIONS,
  EvalCaseSchema,
  EvalCaseResultSchema
} from "../src/evals/caseSchema";
import { buildEvalReport, writeEvalReports } from "../src/evals/scripted/report";
import { runScriptedEval } from "../src/evals/runScriptedEval";
import { SCRIPTED_DEFAULT_REWARD_BASIS } from "../src/evals/shared/rewardBasis";
import { scoreCase } from "../src/evals/scripted/scoreCase";

const tempDirs: string[] = [];

afterEach(async () => {
  resetDb();

  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function makeReportDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mealplan-eval-"));
  tempDirs.push(dir);

  return dir;
}

function fixtureCase(caseId: string, seedId: EvalCase["seed_id"]): EvalCase {
  return EvalCaseSchema.parse({
    case_id: caseId,
    title: `Fixture ${caseId}`,
    mode: "scripted",
    seed_id: seedId,
    transcript: [
      {
        turn_id: `${caseId}_turn_001`,
        actor: "user",
        text: "Run the fixture case."
      }
    ],
    script: [],
    tags: ["fixture"],
    expected: DEFAULT_EVAL_SCORING_EXPECTATIONS
  });
}

function resultFor(evalCase: EvalCase): EvalCaseResult {
  return EvalCaseResultSchema.parse({
    case_id: evalCase.case_id,
    title: evalCase.title,
    mode: evalCase.mode,
    seed_id: evalCase.seed_id,
    evidence_kind: "scripted_operational_safety",
    status: "passed",
    transcript: evalCase.transcript,
    tool_calls: [],
    audit_ids: listAuditEvents().map((event) => event.event_id),
    confirmations: [],
    side_effects: {
      payment_followups: listPaymentFollowups(),
      kitchen_deltas: listKitchenExportDeltas()
    },
    scores: [
      {
        score_id: `${evalCase.case_id}:harness`,
        category: "operational_safety",
        passed: true,
        message: "Harness boundary produced an isolated DB state."
      }
    ],
    diagnostics: [],
    started_at: "2026-05-11T10:00:00.000Z",
    finished_at: "2026-05-11T10:00:00.000Z",
    duration_ms: 0
  });
}

describe("eval harness contracts", () => {
  it("resolves the default scripted reward basis without ACTION", () => {
    const evalCase = fixtureCase("reward_basis_fixture", "maya_default");
    const report = buildEvalReport({
      run_id: "eval_reward_basis",
      mode: "scripted",
      started_at: "2026-05-11T10:00:00.000Z",
      finished_at: "2026-05-11T10:00:00.000Z",
      results: [resultFor(evalCase)]
    });

    expect(evalCase.reward_basis).toEqual(SCRIPTED_DEFAULT_REWARD_BASIS);
    expect(evalCase.reward_basis).not.toContain("ACTION");
    expect(report.results[0]?.reward_basis).toEqual(
      SCRIPTED_DEFAULT_REWARD_BASIS
    );
  });

  it("keeps tool path failures diagnostic unless ACTION is selected", () => {
    const evalCase = fixtureCase("tool_path_default", "maya_default");
    const actionCase = EvalCaseSchema.parse({
      ...fixtureCase("tool_path_action", "maya_default"),
      reward_basis: ["ACTION"]
    });
    const failedToolPathScore = {
      category: "required_tool_usage" as const,
      message: "Required tool lookup_customer was not called.",
      passed: false,
      score_id: "tool_path:required_tool_usage"
    };

    expect(scoreCase(evalCase, {
      ...resultFor(evalCase),
      scores: [failedToolPathScore]
    }).status).toBe("passed");
    expect(scoreCase(actionCase, {
      ...resultFor(actionCase),
      scores: [failedToolPathScore]
    }).status).toBe("failed");
  });

  it("keeps hard policy failures as reward failures regardless of basis", () => {
    const evalCase = EvalCaseSchema.parse({
      ...fixtureCase("hard_policy_basis", "maya_default"),
      reward_basis: ["COMMUNICATION"]
    });
    const scored = scoreCase(evalCase, {
      ...resultFor(evalCase),
      scores: [{
        category: "hard_policy",
        message: "P009_PAYMENT_SETTLEMENT_FORBIDDEN was violated.",
        passed: false,
        score_id: "hard_policy_basis:hard_policy"
      }]
    });

    expect(scored.status).toBe("failed");
  });

  it("structures confirmation evidence as server-created records", () => {
    const parsed = EvalCaseResultSchema.parse({
      ...resultFor(fixtureCase("confirmation_fixture", "maya_default")),
      confirmations: [
        {
          confirmation_id: "conf_001",
          change_set_id: "cs_001",
          customer_id: "cus_001",
          source_user_turn_id: "turn_002",
          captured_by: "server",
          confirmed_by: "user",
          previewed_at: "2026-05-11T10:01:00Z",
          confirmed_at: "2026-05-11T10:02:00Z",
          confirmation_type: "explicit_yes"
        }
      ]
    });

    expect(parsed.confirmations[0]?.captured_by).toBe("server");
  });

  it("resets DB by seed id at the harness boundary and writes reports", async () => {
    const reportDir = await makeReportDir();
    const cases = [
      fixtureCase("identity_seed", "identity_uncertain"),
      fixtureCase("maya_seed", "maya_default")
    ];

    const { report, reportFiles, terminalSummary } = await runScriptedEval({
      cases,
      mode: "scripted",
      reportDir,
      now: () => "2026-05-11T10:00:00.000Z",
      executor: async (evalCase) => {
        if (evalCase.case_id === "identity_seed") {
          expect(getCustomer("cus_004")).toBeDefined();
          expect(getCustomer("cus_001")).toBeUndefined();

          savePaymentFollowup({
            followup_id: "pf_eval_identity",
            customer_id: "cus_004",
            idempotency_key: "identity_seed:followup",
            reason: "unknown_status",
            status: "open",
            created_at: "2026-05-11T10:00:00Z"
          });
        }

        if (evalCase.case_id === "maya_seed") {
          expect(getCustomer("cus_001")).toBeDefined();
          expect(getCustomer("cus_004")).toBeUndefined();
          expect(listPaymentFollowups()).toEqual([]);
        }

        return resultFor(evalCase);
      }
    });

    expect(report.metadata.mode).toBe("scripted");
    expect(report.summary.cases_total).toBe(2);
    expect(report.summary.cases_passed).toBe(2);
    expect(terminalSummary).toContain("Cases: 2 passed, 0 failed");

    const json = JSON.parse(
      await readFile(reportFiles.jsonPath, "utf8")
    ) as {
      results: {
        diagnostics: { cost: { available: boolean; reason?: string } };
        primary_rewards: Record<string, { passed: boolean; score: number }>;
        raw_scores: unknown[];
        reward_basis: string[];
        reward_passed: boolean;
      }[];
      summary: { cases_total: number };
    };
    const markdown = await readFile(reportFiles.markdownPath, "utf8");

    expect(reportFiles.jsonPath).toBe(reportFiles.runArtifacts.resultsJsonPath);
    expect(json.summary.cases_total).toBe(2);
    expect(json.results[0]?.reward_basis).toEqual(
      SCRIPTED_DEFAULT_REWARD_BASIS
    );
    expect(json.results[0]?.primary_rewards.safety).toMatchObject({
      passed: true,
      score: 1
    });
    expect(json.results[0]?.diagnostics.cost).toMatchObject({
      available: false,
      reason: "usage/cost metadata not captured yet"
    });
    expect(json.results[0]?.raw_scores.length).toBeGreaterThan(0);
    expect(json.results[0]?.reward_passed).toBe(true);
    expect(markdown).toContain("scripted operational-safety evidence");
    expect(markdown).toContain("FINAL_STATE, SAFETY, CONFIRMATION, EVIDENCE");
    expect(markdown).toContain("## Primary Reward Failures");
    expect(markdown).toContain("## Diagnostics");
    expect(markdown).toContain("## Raw Score Failures");
  });

  it("renders failed case diagnostics in the markdown report", async () => {
    const failed = EvalCaseResultSchema.parse({
      ...resultFor(fixtureCase("failed_fixture", "maya_default")),
      status: "failed",
      scores: [
        {
          score_id: "failed_fixture:policy",
          category: "hard_policy",
          passed: false,
          message: "Expected confirmation before commit."
        }
      ],
      diagnostics: [
        {
          severity: "error",
          code: "CONFIRMATION_BOUNDARY_MISSING",
          message: "Commit was observed without a server confirmation record.",
          evidence: {
            change_set_id: "cs_001"
          }
        }
      ]
    });
    const report = buildEvalReport({
      run_id: "eval_001",
      mode: "scripted",
      started_at: "2026-05-11T10:00:00.000Z",
      finished_at: "2026-05-11T10:00:00.000Z",
      results: [failed]
    });
    const paths = await writeEvalReports(report, await makeReportDir());
    const markdown = await readFile(paths.markdownPath, "utf8");

    expect(markdown).toContain("CONFIRMATION_BOUNDARY_MISSING");
    expect(markdown).toContain(
      "Commit was observed without a server confirmation record."
    );
  });

  it("requires a server-side OpenAI key for model mode", async () => {
    await expect(
      runScriptedEval({
        cases: [],
        mode: "model",
        reportDir: await makeReportDir(),
        env: {}
      })
    ).rejects.toThrow("OPENAI_API_KEY");
  });
});
