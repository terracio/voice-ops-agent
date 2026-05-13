import type { RealtimeRunnerResult, RealtimeToolCallTrace } from "../src/agent";
import type { AuditEvent } from "../src/domain/schema";
import { getSeedScenario } from "../src/domain/seed";
import {
  applyWalkProfileContract,
  loadRealtimeEvalCase
} from "../src/evals/realtime/caseLoader";

const RUN_ID = "run_realtime_score";
const STARTED_AT = "2026-05-11T10:00:00.000Z";
const FINISHED_AT = "2026-05-11T10:00:01.000Z";

export function uncertaintyCase(caseId: string) {
  return applyWalkProfileContract({
    realtimeCase: loadRealtimeEvalCase({ caseId, stage: "walk" }),
    walkProfile: "walk_uncertain_noise_v1"
  });
}

export function completedResult(options: {
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
    platform_tracing: { enabled: false },
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

export function toolCall(
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

export function auditEvent(
  eventId: string,
  eventType: AuditEvent["event_type"],
  toolName: string,
  customerId?: string,
  details: Record<string, unknown> = {}
): AuditEvent {
  return {
    event_id: eventId,
    timestamp: FINISHED_AT,
    run_id: RUN_ID,
    actor: "agent",
    event_type: eventType,
    customer_id: customerId,
    tool_name: toolName,
    details
  };
}
