import { beforeEach, describe, expect, it } from "vitest";
import {
  buildRealtimeToolContext,
  createRealtimeAgentSdkTools,
  createRealtimeSessionState,
  createRealtimeToolContextBase
} from "../src/agent";
import { resetDb } from "../src/domain/db";
import { createMealPlanToolRegistry } from "../src/tools";

type SdkTool = ReturnType<typeof createRealtimeAgentSdkTools>[number];

describe("Realtime session identity state", () => {
  beforeEach(() => {
    resetDb();
  });

  it("blocks account reads before server-owned identity is confirmed", async () => {
    const harness = createToolHarness();

    const result = await harness.invoke("get_customer_state", {
      customer_id: "cus_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "IDENTITY_NOT_RESOLVED",
        policy_id: "P001_IDENTITY_UNCERTAIN"
      }
    });
    expect(harness.sessionState).toEqual({ identity_status: "unknown" });
  });

  it("does not let model args grant hidden identity context", async () => {
    const harness = createToolHarness();

    const result = await harness.invoke("get_customer_state", {
      customer_id: "cus_001",
      identity_status: "confirmed",
      resolved_customer_id: "cus_001"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "TOOL_CONTEXT_OVERRIDE_FORBIDDEN"
      }
    });
    expect(harness.sessionState).toEqual({ identity_status: "unknown" });
  });

  it("updates hidden identity after confirmed lookup and allows follow-on reads", async () => {
    const harness = createToolHarness();

    const lookup = await harness.invoke("lookup_customer", {
      customer_id: "CUS_001"
    });
    expect(lookup).toMatchObject({
      ok: true,
      data: {
        identity_status: "confirmed",
        candidate_count: 1
      }
    });
    expect(harness.sessionState).toEqual({
      identity_status: "confirmed",
      resolved_customer_id: "cus_001"
    });

    const state = await harness.invoke("get_customer_state", {
      customer_id: "cus_001"
    });
    expect(state).toMatchObject({
      ok: true,
      data: {
        customer: {
          customer_id: "cus_001"
        }
      }
    });
  });

  it("keeps ambiguous lookups from authorizing account reads", async () => {
    resetDb("identity_uncertain");
    const harness = createToolHarness();

    const lookup = await harness.invoke("lookup_customer", {
      phone: "+971500000099"
    });
    expect(lookup).toMatchObject({
      ok: true,
      data: {
        identity_status: "uncertain",
        candidate_count: 2,
        write_blocked: true
      }
    });
    expect(harness.sessionState).toEqual({ identity_status: "uncertain" });

    const state = await harness.invoke("get_customer_state", {
      customer_id: "cus_004"
    });
    expect(state).toMatchObject({
      ok: false,
      error: {
        policy_id: "P001_IDENTITY_UNCERTAIN"
      }
    });
  });
});

function createToolHarness() {
  const sessionState = createRealtimeSessionState();
  const base = createRealtimeToolContextBase({
    lastUserMessage: "Realtime identity test.",
    now: () => new Date("2026-05-13T09:00:00+02:00"),
    runId: "run_realtime_identity_test",
    sessionId: "session_realtime_identity_test",
    userTurnId: "turn_realtime_identity_test"
  });
  const tools = createRealtimeAgentSdkTools({
    registry: createMealPlanToolRegistry(),
    sessionState,
    getToolContext: () => buildRealtimeToolContext({ base, state: sessionState })
  });

  return {
    sessionState,
    invoke: async (toolName: string, args: unknown) => {
      const tool = findTool(tools, toolName);
      return JSON.parse(String(await tool.invoke({} as never, JSON.stringify(args))));
    }
  };
}

function findTool(tools: SdkTool[], toolName: string): SdkTool {
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`Missing SDK tool ${toolName}.`);
  return tool;
}
