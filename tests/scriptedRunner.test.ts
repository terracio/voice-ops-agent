import { describe, expect, it } from "vitest";
import * as db from "../src/domain/db";
import type { EvalCase } from "../src/evals/caseSchema";
import { runEval } from "../src/evals/runEval";
import { runScriptedEvalCase } from "../src/evals/scriptedRunner";

const START = "2026-05-11T10:00:00.000Z";

const scriptedCase: EvalCase = {
  case_id: "scripted_pause_confirmation",
  title: "Scripted runner uses real ChangeSet tools",
  mode: "scripted",
  seed_id: "maya_default",
  transcript: [],
  script: [
    {
      type: "user",
      turn_id: "turn_001",
      text: "This is Maya. Please pause my Monday meal.",
      context: {
        identity_status: "confirmed",
        resolved_customer_id: "cus_001"
      }
    },
    {
      type: "tool_call",
      tool_call_id: "tc_create",
      tool_name: "create_change_set",
      args: {
        change_set_id: "cs_scripted_pause",
        operations: [
          {
            type: "pause_dates",
            dates: ["2026-05-18"],
            reason: "travel"
          }
        ]
      }
    },
    {
      type: "tool_call",
      tool_call_id: "tc_preview",
      tool_name: "preview_change_set",
      args: {
        change_set_id: "cs_scripted_pause"
      }
    },
    {
      type: "correction",
      turn_id: "turn_002",
      text: "Actually only Monday, not the rest of the week."
    },
    {
      type: "confirmation",
      turn_id: "turn_003",
      text: "Yes, confirm those changes.",
      change_set_id: "cs_scripted_pause"
    },
    {
      type: "tool_call",
      tool_call_id: "tc_commit",
      tool_name: "commit_change_set",
      args: {
        change_set_id: "cs_scripted_pause",
        confirmation_id: "$last_confirmation_id"
      }
    }
  ],
  tags: ["scripted"]
};

describe("scripted eval runner", () => {
  it("runs scripted mode without OpenAI credentials through real tools", async () => {
    const { report } = await runEval({
      cases: [scriptedCase],
      mode: "scripted",
      env: {},
      now: () => START
    });
    const [result] = report.results;

    expect(result?.status).toBe("passed");
    expect(result?.tool_calls.map((call) => call.tool_name)).toEqual([
      "create_change_set",
      "preview_change_set",
      "capture_confirmation",
      "commit_change_set"
    ]);
    expect(result?.confirmations).toHaveLength(1);
    expect(result?.confirmations[0]).toMatchObject({
      change_set_id: "cs_scripted_pause",
      customer_id: "cus_001",
      source_user_turn_id: "turn_003",
      captured_by: "server"
    });
    expect(result?.side_effects.kitchen_deltas).toHaveLength(1);
    expect(
      result?.final_state.customer_states[0]?.service_dates.find(
        (date) => date.service_date === "2026-05-18"
      )?.status
    ).toBe("paused");
    expect(result?.run_metadata?.run_id).toBe(report.metadata.run_id);
  });

  it("uses runner-owned context instead of model-supplied context fields", async () => {
    db.resetDb("maya_default");
    const result = await runScriptedEvalCase(
      {
        ...scriptedCase,
        case_id: "scripted_context_forbidden",
        title: "Scripted runner rejects model context",
        script: [
          scriptedCase.script[0],
          {
            type: "tool_call",
            tool_call_id: "tc_context_override",
            tool_name: "get_customer_state",
            args: {
              customer_id: "cus_001",
              run_id: "model_supplied_run"
            },
            expect: {
              ok: false,
              error_code: "TOOL_CONTEXT_OVERRIDE_FORBIDDEN"
            }
          }
        ]
      },
      {
        run_id: "run_scripted_context",
        mode: "scripted",
        run_started_at: START,
        now: () => START
      }
    );

    expect(result.status).toBe("passed");
    expect(result.tool_calls[0]).toMatchObject({
      tool_name: "get_customer_state",
      status: "error"
    });
    expect(result.tool_calls[0]?.input).toMatchObject({
      run_id: "model_supplied_run"
    });
  });

  it("supports explicit setup hooks for stale-state simulation", async () => {
    db.resetDb("maya_default");
    const result = await runScriptedEvalCase(
      {
        case_id: "scripted_stale_state",
        title: "Scripted stale ChangeSet simulation",
        mode: "scripted",
        seed_id: "maya_default",
        transcript: [],
        script: [
          scriptedCase.script[0],
          scriptedCase.script[1],
          {
            type: "setup",
            action: "make_customer_state_stale",
            customer_id: "cus_001",
            state_version_increment: 1
          },
          scriptedCase.script[2],
          scriptedCase.script[4],
          {
            type: "tool_call",
            tool_call_id: "tc_stale_commit",
            tool_name: "commit_change_set",
            args: {
              change_set_id: "cs_scripted_pause",
              confirmation_id: "$last_confirmation_id"
            },
            expect: {
              ok: false,
              policy_id: "P005_STALE_STATE_VERSION"
            }
          }
        ],
        tags: ["scripted"]
      },
      {
        run_id: "run_scripted_stale",
        mode: "scripted",
        run_started_at: START,
        now: () => START
      }
    );

    expect(result.status).toBe("passed");
    expect(result.tool_calls.at(-1)).toMatchObject({
      tool_name: "commit_change_set",
      status: "blocked"
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SETUP_STALE_STATE"
      })
    );
    expect(db.listKitchenExportDeltas("cus_001")).toHaveLength(0);
  });
});
