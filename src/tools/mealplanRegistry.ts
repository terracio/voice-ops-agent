import { changeSetTools } from "./changeSetTools";
import { escalationTools } from "./escalationTools";
import { identityTools } from "./identityTools";
import { readTools } from "./readTools";
import { createToolRegistry } from "./registry";
import type { ToolDefinition } from "./types";

export const mealPlanModelTools = [
  ...identityTools,
  ...readTools,
  ...changeSetTools,
  ...escalationTools
] satisfies ToolDefinition[];

export function createMealPlanToolRegistry() {
  return createToolRegistry(mealPlanModelTools);
}
