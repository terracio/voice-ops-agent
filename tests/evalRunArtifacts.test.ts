import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  EvalCaseResultSchema,
  type EvalCaseResult
} from "../src/evals/caseSchema";
import { buildEvalReport, writeEvalReports } from "../src/evals/report";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("scripted eval run artifacts", () => {
  it("writes canonical run-level results with case artifacts", async () => {
    const reportDir = await makeReportDir();
    const report = buildEvalReport({
      run_id: "eval_unit_artifacts",
      mode: "scripted",
      started_at: "2026-05-11T10:00:00.000Z",
      finished_at: "2026-05-11T10:00:01.000Z",
      results: [caseResult()]
    });

    const paths = await writeEvalReports(report, reportDir);
    const runJson = JSON.parse(
      await readFile(paths.runArtifacts.resultsJsonPath, "utf8")
    ) as {
      schema_version: string;
      run_id: string;
      suite: string;
      artifacts: Record<string, string>;
      cases: { case_id: string; case_path: string }[];
    };
    const runMarkdown = await readFile(
      paths.runArtifacts.resultsMarkdownPath,
      "utf8"
    );

    expect(existsSync(paths.jsonPath)).toBe(true);
    expect(existsSync(paths.markdownPath)).toBe(true);
    expect(paths.jsonPath).toBe(paths.runArtifacts.resultsJsonPath);
    expect(paths.markdownPath).toBe(paths.runArtifacts.resultsMarkdownPath);
    expect(runJson).toMatchObject({
      schema_version: "eval_run_artifacts.v1",
      run_id: "eval_unit_artifacts",
      suite: "scripted"
    });
    expect(runJson.artifacts.run_dir).toBe(paths.runArtifacts.runDir);
    expect(runJson.cases[0]?.case_id).toBe("artifact_case");
    expect(existsSync(runJson.cases[0]?.case_path ?? "")).toBe(true);
    expect(existsSync(paths.runArtifacts.artifactsDir)).toBe(true);
    expect(runMarkdown).toContain("MealPlan VoiceOps Scripted Eval Run");
    expect(runMarkdown).toContain("artifact_case");
  });
});

async function makeReportDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mealplan-eval-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

function caseResult(): EvalCaseResult {
  return EvalCaseResultSchema.parse({
    case_id: "artifact_case",
    title: "Artifact case",
    mode: "scripted",
    seed_id: "maya_default",
    evidence_kind: "scripted_operational_safety",
    status: "passed",
    transcript: [{
      actor: "user",
      text: "Please run the artifact case.",
      turn_id: "turn_artifact_001"
    }],
    tool_calls: [],
    audit_ids: [],
    confirmations: [],
    side_effects: {
      kitchen_deltas: [],
      payment_followups: []
    },
    scores: [{
      category: "operational_safety",
      message: "Artifact writer did not change scoring.",
      passed: true,
      score_id: "artifact_case:score"
    }],
    diagnostics: [],
    started_at: "2026-05-11T10:00:00.000Z",
    finished_at: "2026-05-11T10:00:01.000Z",
    duration_ms: 1000
  });
}
