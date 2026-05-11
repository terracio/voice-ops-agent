import { z } from "zod";
import type { ToolResult } from "../domain/schema";
import {
  TOOL_EXECUTION_CONTEXT_KEYS,
  ToolExecutionContextSchema,
  type ToolExecutionContextKey
} from "./context";
import {
  createToolResultValidator,
  defineTool,
  failedToolResult,
  type ToolContract,
  type ToolDefinition,
  type ToolSchema
} from "./types";

export { defineTool };

export type ExecuteToolOptions = {
  modelArgs: unknown;
  context: unknown;
};

export type ToolRegistry = {
  register: (definition: ToolDefinition) => void;
  get: (name: string) => ToolDefinition | undefined;
  list: () => ToolDefinition[];
  listContracts: () => ToolContract[];
  execute: (
    name: string,
    options: ExecuteToolOptions
  ) => Promise<ToolResult<unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function findReservedContextKey(
  modelArgs: unknown
): ToolExecutionContextKey | undefined {
  if (!isRecord(modelArgs)) {
    return undefined;
  }

  return TOOL_EXECUTION_CONTEXT_KEYS.find((key) => hasOwnKey(modelArgs, key));
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function extractAuditEventIds(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.audit_event_ids)) {
    return [];
  }

  return value.audit_event_ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
}

function cloneContract<
  TInputSchema extends ToolSchema,
  TOutputSchema extends ToolSchema
>(
  tool: ToolDefinition<TInputSchema, TOutputSchema>
): ToolContract<TInputSchema, TOutputSchema> {
  return {
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    metadata: {
      ...tool.metadata,
      eval_tags: [...tool.metadata.eval_tags],
      required_for_eval_ids: [...tool.metadata.required_for_eval_ids],
      forbidden_for_eval_ids: [...tool.metadata.forbidden_for_eval_ids],
      timeline: tool.metadata.timeline
        ? { ...tool.metadata.timeline }
        : undefined
    }
  };
}

export function createToolRegistry(
  initialDefinitions: ToolDefinition[] = []
): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

  const registry: ToolRegistry = {
    register(definition) {
      if (tools.has(definition.name)) {
        throw new Error(`Tool "${definition.name}" is already registered.`);
      }

      tools.set(definition.name, definition);
    },

    get(name) {
      return tools.get(name);
    },

    list() {
      return Array.from(tools.values());
    },

    listContracts() {
      return Array.from(tools.values()).map((tool) => cloneContract(tool));
    },

    async execute(name, options) {
      const tool = tools.get(name);
      if (!tool) {
        return failedToolResult({
          code: "TOOL_NOT_FOUND",
          message: `Tool "${name}" is not registered.`
        });
      }

      const parsedContext = ToolExecutionContextSchema.safeParse(
        options.context
      );
      if (!parsedContext.success) {
        return failedToolResult({
          code: "TOOL_INVALID_CONTEXT",
          message: `Invalid tool execution context: ${formatZodError(
            parsedContext.error
          )}`
        });
      }

      const reservedKey = findReservedContextKey(options.modelArgs);
      if (reservedKey) {
        return failedToolResult({
          code: "TOOL_CONTEXT_OVERRIDE_FORBIDDEN",
          message: `Model args may not include hidden context field "${reservedKey}".`
        });
      }

      const parsedArgs = tool.inputSchema.safeParse(options.modelArgs);
      if (!parsedArgs.success) {
        return failedToolResult({
          code: "TOOL_INVALID_ARGS",
          message: `Invalid args for tool "${name}": ${formatZodError(
            parsedArgs.error
          )}`
        });
      }

      let rawResult: unknown;
      try {
        rawResult = await tool.execute(parsedArgs.data, parsedContext.data);
      } catch (error) {
        return failedToolResult({
          code: "TOOL_EXECUTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : `Tool "${name}" failed during execution.`
        });
      }

      const resultSchema = createToolResultValidator(tool.outputSchema);
      const parsedResult = resultSchema.safeParse(rawResult);
      if (!parsedResult.success) {
        return failedToolResult({
          code: "TOOL_INVALID_OUTPUT",
          message: `Tool "${name}" returned invalid output: ${formatZodError(
            parsedResult.error
          )}`
        }, extractAuditEventIds(rawResult));
      }

      return parsedResult.data as ToolResult<unknown>;
    }
  };

  for (const definition of initialDefinitions) {
    registry.register(definition);
  }

  return registry;
}
