import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mealPlanModelTools } from "../../tools/mealplanRegistry";

export {
  DEFAULT_OPENAI_REALTIME_MODEL,
  DEFAULT_OPENAI_REALTIME_REASONING_EFFORT,
  resolveOpenAIRealtimeModel,
  type RealtimeModelEnv
} from "./runtimeConfig";

export const MEALPLAN_REALTIME_TOOL_NAMES = mealPlanModelTools.map(
  (tool) => tool.name
);

const REALTIME_TOOL_LIST_PLACEHOLDER = "{{REALTIME_TOOL_LIST}}";

export const MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH = join(
  process.cwd(),
  "src",
  "realtime",
  "config",
  "instructions.md"
);

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

export const MEALPLAN_REALTIME_AGENT_INSTRUCTIONS =
  renderRealtimeInstructions(
    readFileSync(MEALPLAN_REALTIME_INSTRUCTIONS_SOURCE_PATH, "utf8")
  );
