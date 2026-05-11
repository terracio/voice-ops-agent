import { z } from "zod";
import {
  createToolResultSchema,
  ToolRiskSchema,
  type ToolError,
  type ToolResult,
  type ToolRisk
} from "../domain/schema";
import type { ToolExecutionContext } from "./context";

export type ToolSchema = z.ZodType;

export const ToolNameSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Tool names must be lower snake case and start with a letter"
  );

export const ToolTimelineMetadataSchema = z.object({
  event_label: z.string().min(1),
  result_label: z.string().min(1).optional()
}).strict();

export const ToolDefinitionMetadataSchema = z.object({
  display_name: z.string().min(1).optional(),
  eval_tags: z.array(z.string().min(1)).default([]),
  required_for_eval_ids: z.array(z.string().min(1)).default([]),
  forbidden_for_eval_ids: z.array(z.string().min(1)).default([]),
  timeline: ToolTimelineMetadataSchema.optional()
}).strict();

export const ToolDefinitionBaseSchema = z.object({
  name: ToolNameSchema,
  description: z.string().min(1),
  risk: ToolRiskSchema,
  metadata: ToolDefinitionMetadataSchema.default({
    eval_tags: [],
    required_for_eval_ids: [],
    forbidden_for_eval_ids: []
  })
}).strict();

export type ToolDefinitionMetadata = z.infer<
  typeof ToolDefinitionMetadataSchema
>;

export type ToolDefinitionMetadataInput = z.input<
  typeof ToolDefinitionMetadataSchema
>;

export type ToolExecutor<
  TInputSchema extends ToolSchema,
  TOutputSchema extends ToolSchema
> = (
  args: z.infer<TInputSchema>,
  context: ToolExecutionContext
) =>
  | ToolResult<z.infer<TOutputSchema>>
  | Promise<ToolResult<z.infer<TOutputSchema>>>;

export type ToolDefinition<
  TInputSchema extends ToolSchema = ToolSchema,
  TOutputSchema extends ToolSchema = ToolSchema
> = {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  metadata: ToolDefinitionMetadata;
  execute: ToolExecutor<TInputSchema, TOutputSchema>;
};

export type ToolDefinitionDraft<
  TInputSchema extends ToolSchema,
  TOutputSchema extends ToolSchema
> = Omit<ToolDefinition<TInputSchema, TOutputSchema>, "metadata"> & {
  metadata?: ToolDefinitionMetadataInput;
};

export type ToolContract<
  TInputSchema extends ToolSchema = ToolSchema,
  TOutputSchema extends ToolSchema = ToolSchema
> = Omit<ToolDefinition<TInputSchema, TOutputSchema>, "execute">;

function assertZodSchema(value: unknown, fieldName: string): asserts value is ToolSchema {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { safeParse?: unknown }).safeParse !== "function"
  ) {
    throw new TypeError(`${fieldName} must be a Zod schema.`);
  }
}

export function defineTool<
  TInputSchema extends ToolSchema,
  TOutputSchema extends ToolSchema
>(
  definition: ToolDefinitionDraft<TInputSchema, TOutputSchema>
): ToolDefinition<TInputSchema, TOutputSchema> {
  assertZodSchema(definition.inputSchema, "inputSchema");
  assertZodSchema(definition.outputSchema, "outputSchema");

  const base = ToolDefinitionBaseSchema.parse({
    name: definition.name,
    description: definition.description,
    risk: definition.risk,
    metadata: definition.metadata ?? {}
  });

  return Object.freeze({
    ...definition,
    ...base
  });
}

export function createToolResultValidator<TOutputSchema extends ToolSchema>(
  outputSchema: TOutputSchema
) {
  return createToolResultSchema(outputSchema);
}

export function failedToolResult<TData = never>(
  error: ToolError,
  audit_event_ids: string[] = []
): ToolResult<TData> {
  return {
    ok: false,
    error,
    audit_event_ids
  };
}
