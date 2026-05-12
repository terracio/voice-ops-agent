import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_REALTIME_MODEL,
  DEFAULT_OPENAI_REALTIME_REASONING_EFFORT,
  MEALPLAN_REALTIME_AGENT_INSTRUCTIONS,
  MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH,
  MEALPLAN_REALTIME_TOOL_NAMES,
  mealPlanRealtimeTools,
  resolveOpenAIRealtimeModel
} from "../src/agent";
import { mealPlanModelTools } from "../src/tools";

describe("MealPlan realtime agent contract", () => {
  it("loads a Realtime-specific prompt from Markdown", () => {
    expect(MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH).toMatch(
      /src\/agent\/realtimeInstructions\.md$/
    );
    expect(
      readFileSync(MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH, "utf8")
    ).toMatch(/# MealPlan VoiceOps Realtime Agent/);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).not.toContain(
      "{{REALTIME_TOOL_LIST}}"
    );
  });

  it("keeps the realtime model configurable with a gpt-realtime-2 default", () => {
    expect(DEFAULT_OPENAI_REALTIME_MODEL).toBe("gpt-realtime-2");
    expect(DEFAULT_OPENAI_REALTIME_REASONING_EFFORT).toBe("low");
    expect(resolveOpenAIRealtimeModel({})).toBe("gpt-realtime-2");
    expect(resolveOpenAIRealtimeModel({ OPENAI_REALTIME_MODEL: "  custom " }))
      .toBe("custom");
    expect(resolveOpenAIRealtimeModel({ OPENAI_REALTIME_MODEL: "   " }))
      .toBe("gpt-realtime-2");
  });

  it("references exactly the model-facing tool registry", () => {
    const expectedToolNames = mealPlanModelTools.map((tool) => tool.name);

    expect(MEALPLAN_REALTIME_TOOL_NAMES).toEqual(expectedToolNames);
    expect(mealPlanRealtimeTools.map((tool) => tool.name)).toEqual(
      expectedToolNames
    );

    for (const toolName of expectedToolNames) {
      expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toContain(toolName);
    }
  });

  it("preserves voice, identity, policy, confirmation, and escalation rules", () => {
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/realtime phone agent/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/identity is uncertain/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/never mutate allergies/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/never mark payments as paid/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/never charge a card/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/server creates the confirmation record/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/do not invent a `confirmation_id`/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/unclear audio/i);
    expect(MEALPLAN_REALTIME_AGENT_INSTRUCTIONS).toMatch(/escalate_to_human/i);
  });

  it("converts registry tools into Realtime function tool definitions", () => {
    for (const realtimeTool of mealPlanRealtimeTools) {
      const sourceTool = mealPlanModelTools.find(
        (tool) => tool.name === realtimeTool.name
      );

      expect(sourceTool).toBeDefined();
      expect(realtimeTool.type).toBe("function");
      expect(realtimeTool.description).toContain(sourceTool?.description);
      expect(realtimeTool.description).toContain(`Risk level: ${sourceTool?.risk}`);
      expect(realtimeTool.parameters).toMatchObject({ type: "object" });
      expect(realtimeTool).not.toHaveProperty("execute");
      expect(realtimeTool.parameters).not.toHaveProperty("$schema");
    }
  });

  it("does not expose internal side effects or model-created confirmations", () => {
    const realtimeToolNames = mealPlanRealtimeTools.map((tool) => tool.name);
    const captureConfirmation = mealPlanRealtimeTools.find(
      (tool) => tool.name === "capture_confirmation"
    );

    expect(realtimeToolNames).not.toContain("create_kitchen_export_delta");
    expect(realtimeToolNames).not.toContain("materialize_kitchen_delta");
    expect(realtimeToolNames).not.toContain("materialize_payment_followup");
    expect(realtimeToolNames).not.toContain("create_payment_followup");
    expect(captureConfirmation?.parameters).toMatchObject({
      properties: {
        change_set_id: { type: "string" }
      },
      required: ["change_set_id"]
    });
    expect(captureConfirmation?.parameters.properties).not.toHaveProperty(
      "confirmation_id"
    );
  });
});
