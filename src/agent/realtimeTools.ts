import { z } from "zod";
import { mealPlanModelTools } from "../tools/mealplanRegistry";
import type { ToolContract, ToolDefinition, ToolSchema } from "../tools/types";

type JsonObject = Record<string, unknown>;

export type RealtimeFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonObject;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripSchemaMetadata(schema: unknown): JsonObject {
  if (!isJsonObject(schema)) {
    throw new Error("Realtime tool parameters must be a JSON Schema object.");
  }

  const { $schema: _schema, ...parameters } = schema;
  return parameters;
}

function toJsonSchemaObject(schema: ToolSchema): JsonObject {
  return stripSchemaMetadata(z.toJSONSchema(schema));
}

function toolDescription(tool: ToolContract): string {
  return [
    tool.description,
    `Risk level: ${tool.risk}.`,
    "Use only according to the active realtime instructions."
  ].join("\n\n");
}

export function toRealtimeFunctionTool(
  tool: ToolContract | ToolDefinition
): RealtimeFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: toolDescription(tool),
    parameters: toJsonSchemaObject(tool.inputSchema)
  };
}

export function createRealtimeFunctionTools(
  tools: readonly (ToolContract | ToolDefinition)[] = mealPlanModelTools
): RealtimeFunctionTool[] {
  return tools.map((tool) => toRealtimeFunctionTool(tool));
}

export const mealPlanRealtimeTools = createRealtimeFunctionTools();
