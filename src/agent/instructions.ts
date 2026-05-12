import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mealPlanModelTools } from "../tools/mealplanRegistry";

export const MEALPLAN_MODEL_TOOL_NAMES = mealPlanModelTools.map(
  (tool) => tool.name
);

const MODEL_TOOL_LIST_PLACEHOLDER = "{{MODEL_TOOL_LIST}}";
const instructionSourceUrl = new URL("./instructions.md", import.meta.url);

export const MEALPLAN_AGENT_INSTRUCTIONS_SOURCE_PATH =
  fileURLToPath(instructionSourceUrl);

const toolList = MEALPLAN_MODEL_TOOL_NAMES.map(
  (toolName) => `- \`${toolName}\``
).join("\n");

function renderInstructions(template: string): string {
  if (!template.includes(MODEL_TOOL_LIST_PLACEHOLDER)) {
    throw new Error(
      `Agent instruction template must include ${MODEL_TOOL_LIST_PLACEHOLDER}.`
    );
  }

  return template.replace(MODEL_TOOL_LIST_PLACEHOLDER, toolList).trim();
}

export const MEALPLAN_AGENT_INSTRUCTIONS = renderInstructions(
  readFileSync(instructionSourceUrl, "utf8")
);
