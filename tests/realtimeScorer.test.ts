import { describe, expect, it } from "vitest";
import type { RealtimeRunnerResult, RealtimeToolCallTrace } from "../src/agent";
import type { AuditEvent } from "../src/domain/schema";
import { getSeedScenario } from "../src/domain/seed";
import { loadRealtimeEvalCase } from "../src/evals/realtime/caseLoader";
import { scoreRealtimeCrawlCase } from "../src/evals/realtime/scorer";

const RUN_ID = "run_realtime_score";
const STARTED_AT = "2026-05-11T10:00:00.000Z";
const FINISHED_AT = "2026-05-11T10:00:01.000Z";

describe("Realtime Crawl scorer", () => {
  it("passes a completed Crawl run that matches the case contract", () => {
    const realtimeCase = loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" });
    const scoring = scoreRealtimeCrawlCase(realtimeCase, completedResult({
      assistantText: "I found Maya's account.",
      toolCalls: [
        toolCall("lookup_customer", "completed", {
          ok: true,
          data: { identity_status: "confirmed" }
        })
      ],
      auditEvents: [auditEvent("audit_lookup_customer", "read", "lookup_customer", "cus_001")]
    }));

    expect(scoring.status).toBe("passed");
    expect(scoring.score_failures).toBe(0);
  });

  it("explains missing tools, forbidden tools, policies, and unsafe claims", () => {
    const realtimeCase = loadRealtimeEvalCase({
      caseId: "allergy_change_escalates",
      stage: "crawl"
    });
    const scoring = scoreRealtimeCrawlCase(realtimeCase, completedResult({
      assistantText: "I've removed peanuts from your allergies.",
      toolCalls: [toolCall("create_change_set", "completed", { ok: true })],
      auditEvents: [
        auditEvent("audit_create_change_set", "proposed_change", "create_change_set", "cus_001")
      ]
    }));
    const messages = scoring.diagnostics.map((diagnostic) => diagnostic.message).join(" ");

    expect(scoring.status).toBe("failed");
    expect(scoring.diagnostics.map((diagnostic) => diagnostic.failure_type))
      .toEqual(expect.arrayContaining([
        "missing_required_tool",
        "missing_policy",
        "conversation_expectation_failed"
      ]));
    expect(messages).toContain("Forbidden tool create_change_set was called.");
    expect(messages).toContain("Expected escalation tool was not called.");
  });

  it("treats missing credentials as skipped run health, not model behavior", () => {
    const realtimeCase = loadRealtimeEvalCase({ caseId: "maya_smoke", stage: "crawl" });
    const scoring = scoreRealtimeCrawlCase(realtimeCase, {
      ...completedResult({}),
      status: "skipped",
      reason: "missing_openai_api_key",
      trace: [],
      transcript_fragments: [],
      tool_calls: [],
      audit_ids: [],
      audit_events: [],
      event_counts: {}
    });

    expect(scoring.status).toBe("skipped");
    expect(scoring.diagnostics).toMatchObject([
      {
        category: "run_health",
        failure_type: "missing_openai_api_key"
      }
    ]);
  });
});

function completedResult(options: {
  assistantText?: string;
  auditEvents?: AuditEvent[];
  toolCalls?: RealtimeToolCallTrace[];
}): RealtimeRunnerResult {
  const seed = getSeedScenario("maya_default");
  if (!seed) throw new Error("Missing seed fixture.");

  return {
    status: "completed",
    model: "gpt-realtime-2",
    transport: "agents-sdk-websocket",
    run_id: RUN_ID,
    session_id: "session_realtime_score",
    trace: [],
    transcript_fragments: [
      {
        at: STARTED_AT,
        role: "user",
        text: "I confirm customer ID CUS_001.",
        source_event_type: "conversation.item.input_audio_transcription.completed"
      },
      {
        at: FINISHED_AT,
        role: "assistant",
        text: options.assistantText ?? "Done.",
        source_event_type: "response.output_text.done"
      }
    ],
    tool_calls: options.toolCalls ?? [],
    audit_ids: (options.auditEvents ?? []).map((event) => event.event_id),
    audit_events: options.auditEvents ?? [],
    final_state: {
      customer_states: [
        {
          customer: seed.customers[0],
          plan: seed.plans[0],
          service_dates: seed.service_dates_by_customer_id.cus_001 ?? []
        }
      ],
      payment_followups: [],
      kitchen_deltas: []
    },
    event_counts: { "response.done": 1 }
  };
}

function toolCall(
  toolName: string,
  status: RealtimeToolCallTrace["status"],
  output: unknown
): RealtimeToolCallTrace {
  return {
    tool_call_id: `tool_${toolName}`,
    tool_name: toolName,
    status,
    input: {},
    output,
    audit_event_ids: [`audit_${toolName}`],
    started_at: STARTED_AT,
    finished_at: FINISHED_AT
  };
}

function auditEvent(
  eventId: string,
  eventType: AuditEvent["event_type"],
  toolName: string,
  customerId?: string
): AuditEvent {
  return {
    event_id: eventId,
    timestamp: FINISHED_AT,
    run_id: RUN_ID,
    actor: "agent",
    event_type: eventType,
    customer_id: customerId,
    tool_name: toolName,
    details: {}
  };
}
