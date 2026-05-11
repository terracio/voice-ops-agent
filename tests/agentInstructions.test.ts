import { describe, expect, it } from "vitest";
import {
  MEALPLAN_AGENT_INSTRUCTIONS,
  MEALPLAN_MODEL_TOOL_NAMES
} from "../src/agent/instructions";

describe("MealPlan agent instructions", () => {
  it("references the actual model-facing tool registry", () => {
    expect(MEALPLAN_MODEL_TOOL_NAMES).toEqual([
      "lookup_customer",
      "get_customer_state",
      "resolve_service_dates",
      "get_payment_status",
      "create_change_set",
      "validate_change_set",
      "preview_change_set",
      "capture_confirmation",
      "commit_change_set",
      "escalate_to_human"
    ]);

    for (const toolName of MEALPLAN_MODEL_TOOL_NAMES) {
      expect(MEALPLAN_AGENT_INSTRUCTIONS).toContain(toolName);
    }
  });

  it("preserves hard safety constraints", () => {
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/must use tools/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/current state/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/never.*directly write/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/never.*allerg/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/never.*mark payments as paid/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/never.*charge a card/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/ambiguous dates/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/uncertain identity/i);
  });

  it("keeps ChangeSet confirmation and commit boundaries explicit", () => {
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/preview.*confirmation/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /server-created `confirmation_id`/
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /cannot manufacture confirmation/i
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/commit succeeds/i);
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(/stale ChangeSet/i);
  });

  it("documents model boundaries for side effects, transcript, and modes", () => {
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /payment follow-up.*ChangeSet/i
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /kitchen export deltas.*internal post-commit side effects/i
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /transcript.*not the source of operational truth/i
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).toMatch(
      /scripted\/debug, model-backed, and realtime/i
    );
    expect(MEALPLAN_AGENT_INSTRUCTIONS).not.toMatch(
      /create_kitchen_export_delta|materialize_kitchen_delta|create_payment_followup/
    );
  });
});
