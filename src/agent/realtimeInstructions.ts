import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mealPlanModelTools } from "../tools/mealplanRegistry";

export const DEFAULT_OPENAI_REALTIME_MODEL = "gpt-realtime-2";
export const DEFAULT_OPENAI_REALTIME_REASONING_EFFORT = "low";

export const MEALPLAN_REALTIME_TOOL_NAMES = mealPlanModelTools.map(
  (tool) => tool.name
);

const REALTIME_TOOL_LIST_PLACEHOLDER = "{{REALTIME_TOOL_LIST}}";

export const MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH = join(
  process.cwd(),
  "src",
  "agent",
  "realtimeInstructions.md"
);

export type RealtimeModelEnv = {
  OPENAI_REALTIME_MODEL?: string;
};

const realtimeToolList = MEALPLAN_REALTIME_TOOL_NAMES.map(
  (toolName) => `- \`${toolName}\``
).join("\n");

function renderRealtimeInstructions(template: string): string {
  if (!template.includes(REALTIME_TOOL_LIST_PLACEHOLDER)) {
    throw new Error(
      `Realtime instruction template must include ${REALTIME_TOOL_LIST_PLACEHOLDER}.`
    );
  }

  return template.replace(REALTIME_TOOL_LIST_PLACEHOLDER, realtimeToolList).trim();
}

export function resolveOpenAIRealtimeModel(
  env: RealtimeModelEnv = {
    OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL
  }
): string {
  const configuredModel = env.OPENAI_REALTIME_MODEL?.trim();
  return configuredModel && configuredModel.length > 0
    ? configuredModel
    : DEFAULT_OPENAI_REALTIME_MODEL;
}

export const MEALPLAN_REALTIME_AGENT_INSTRUCTIONS =
  renderRealtimeInstructions(
    readFileSync(MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH, "utf8")
  );
