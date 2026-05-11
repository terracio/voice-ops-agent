import { changeSetTools } from "./changeSetTools";
import { escalationTools } from "./escalationTools";
import { readTools } from "./readTools";
import { createToolRegistry } from "./registry";
import type { ToolDefinition } from "./types";

export const mealPlanModelTools = [
  ...readTools,
  ...changeSetTools,
  ...escalationTools
] satisfies ToolDefinition[];

export function createMealPlanToolRegistry() {
  return createToolRegistry(mealPlanModelTools);
}
