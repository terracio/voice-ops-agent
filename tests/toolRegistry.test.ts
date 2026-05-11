import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createToolRegistry,
  defineTool,
  type ToolExecutionContext
} from "../src/tools";

const context: ToolExecutionContext = {
  run_id: "run_tool_registry",
  session_id: "session_debug",
  actor: "agent",
  current_user_turn_id: "turn_001",
  last_user_message: "Please look up Maya's plan.",
  identity_status: "confirmed",
  resolved_customer_id: "cus_001",
  current_time: "2026-05-11T10:00:00Z",
  reference_time: "2026-05-11T10:00:00Z"
};

function fakeLookupTool() {
  return defineTool({
    name: "lookup_customer_summary",
    description: "Read a customer summary for planning.",
    risk: "read",
    inputSchema: z.object({
      customer_id: z.string().min(1)
    }).strict(),
    outputSchema: z.object({
      summary: z.string().min(1),
      run_id_seen: z.string().min(1)
    }).strict(),
    metadata: {
      display_name: "Lookup customer summary",
      eval_tags: ["registry"],
      timeline: {
        event_label: "Customer summary read"
      }
    },
    execute: vi.fn((args, toolContext) => ({
      ok: true,
      data: {
        summary: `Summary for ${args.customer_id}`,
        run_id_seen: toolContext.run_id
      },
      audit_event_ids: ["audit_tool_001"]
    }))
  });
}

describe("tool registry", () => {
  it("registers and executes a provider-neutral fake tool", async () => {
    const tool = fakeLookupTool();
    const registry = createToolRegistry([tool]);

    const result = await registry.execute("lookup_customer_summary", {
      modelArgs: { customer_id: "cus_001" },
      context
    });

    expect(result).toEqual({
      ok: true,
      data: {
        summary: "Summary for cus_001",
        run_id_seen: "run_tool_registry"
      },
      audit_event_ids: ["audit_tool_001"]
    });
    expect(tool.execute).toHaveBeenCalledOnce();
    expect(registry.get("lookup_customer_summary")).toBe(tool);
  });

  it("returns a structured failed ToolResult without calling the tool for invalid model args", async () => {
    const tool = fakeLookupTool();
    const registry = createToolRegistry([tool]);

    const result = await registry.execute("lookup_customer_summary", {
      modelArgs: { customer_id: "" },
      context
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "TOOL_INVALID_ARGS"
      },
      audit_event_ids: []
    });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("prevents model args from supplying hidden execution context", async () => {
    const tool = fakeLookupTool();
    const registry = createToolRegistry([tool]);

    const result = await registry.execute("lookup_customer_summary", {
      modelArgs: {
        customer_id: "cus_001",
        run_id: "run_from_model"
      },
      context
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "TOOL_CONTEXT_OVERRIDE_FORBIDDEN"
      },
      audit_event_ids: []
    });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("validates implementation output against the tool output schema", async () => {
    const tool = defineTool({
      name: "bad_output_tool",
      description: "Returns a result that does not match its output schema.",
      risk: "read",
      inputSchema: z.object({ customer_id: z.string().min(1) }).strict(),
      outputSchema: z.object({ summary: z.string().min(1) }).strict(),
      metadata: {
        eval_tags: ["registry"]
      },
      execute: vi.fn(() => ({
        ok: true,
        data: { summary: "" },
        audit_event_ids: ["audit_bad_output"]
      }))
    });
    const registry = createToolRegistry([tool]);

    const result = await registry.execute("bad_output_tool", {
      modelArgs: { customer_id: "cus_001" },
      context
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "TOOL_INVALID_OUTPUT"
      },
      audit_event_ids: ["audit_bad_output"]
    });
  });

  it("exposes adapter-ready contracts without provider or hidden context details", () => {
    const registry = createToolRegistry([fakeLookupTool()]);

    const contracts = registry.listContracts();
    const [contract] = contracts;

    expect(contract).toMatchObject({
      name: "lookup_customer_summary",
      description: "Read a customer summary for planning.",
      risk: "read",
      metadata: {
        display_name: "Lookup customer summary",
        eval_tags: ["registry"]
      }
    });
    expect("execute" in contract).toBe(false);
    expect("context" in contract).toBe(false);

    const serializableContract = {
      name: contract.name,
      description: contract.description,
      risk: contract.risk,
      metadata: contract.metadata
    };
    expect(JSON.stringify(serializableContract)).not.toMatch(
      /OPENAI_API_KEY|ephemeral|realtime|transport|session/i
    );
  });
});
