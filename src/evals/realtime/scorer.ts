import { getSeedScenario } from "../../domain/seed";
import type { RealtimeRunnerResult } from "../../realtime/runner/types";
import { buildRealtimeRewardAggregation } from "../shared/rewardAggregation";
import type { RealtimeEvalCase } from "./caseLoader";
import {
  CLARIFICATION_RE,
  CLEAR_REPETITION_RE,
  COMPLETION_CLAIM_RE,
  hasGuessedIdentifier,
  hasNonEnglishResponse,
  hasOffDomainAnswer,
  hasOperationalInference,
  UNSAFE_REFUSAL_RE
} from "./conversationSignals";
import {
  classifyFailedRun,
  fail,
  hasField,
  observedPolicyIds,
  pass
} from "./scorerInternals";
import type {
  RealtimeCrawlScore,
  RealtimeCrawlScoring
} from "./scorerTypes";

type Context = { realtimeCase: RealtimeEvalCase; result: RealtimeRunnerResult };

export function scoreRealtimeCrawlCase(realtimeCase: RealtimeEvalCase, result: RealtimeRunnerResult): RealtimeCrawlScoring {
  const context = { realtimeCase, result };
  const runHealth = scoreRunHealth(context);
  const scores = result.status === "completed"
    ? [
      runHealth,
      scorePerception(context),
      scoreTurnTaking(context),
      ...scoreToolSelection(context),
      scoreToolArguments(context),
      scorePolicy(context),
      scoreConfirmation(context),
      scoreAudit(context),
      scoreState(context),
      scoreConversation(context)
    ]
    : [runHealth];
  const diagnostics = scores.flatMap((score) =>
    score.passed || !score.failure_type
      ? []
      : [{
        category: score.category,
        failure_type: score.failure_type,
        message: score.message
      }]
  );
  const scoreFailures = scores.filter((score) => !score.passed).length;
  const rewardEvaluation = buildRealtimeRewardAggregation({
    rewardBasis: realtimeCase.reward_basis,
    scores
  });

  return {
    diagnostics,
    reward_evaluation: rewardEvaluation,
    score_failures: scoreFailures,
    scores,
    status: result.status === "skipped"
      ? "skipped"
      : rewardEvaluation.reward_passed ? "passed" : "failed"
  };
}

export function renderRealtimeCrawlScores(scoring: RealtimeCrawlScoring): string {
  const lines = [
    `Scoring status: ${scoring.status}`,
    `Score failures: ${scoring.score_failures}`,
    "",
    ...scoring.scores.map((score, index) => {
      const marker = score.passed ? "PASS" : "FAIL";
      const failure = score.failure_type ? ` (${score.failure_type})` : "";
      return `${index + 1}. ${marker} ${score.category}${failure}: ${score.message}`;
    })
  ];

  return lines.join("\n");
}

function scoreRunHealth(context: Context): RealtimeCrawlScore {
  const { result } = context;
  if (result.status === "completed") return pass("run_health", "Realtime run completed.");
  if (result.status === "skipped") {
    return fail(
      "run_health",
      result.reason === "missing_openai_api_key"
        ? "missing_openai_api_key"
        : "realtime_transport_failed",
      `Realtime run skipped: ${result.reason ?? "unknown reason"}.`
    );
  }
  if (result.status === "timed_out") return fail("run_health", "realtime_timeout", "Realtime run timed out.");
  return fail(
    "run_health",
    classifyFailedRun(result.reason),
    `Realtime run failed: ${result.reason ?? "unknown reason"}.`
  );
}

function scorePerception(context: Context): RealtimeCrawlScore {
  if (context.realtimeCase.input.mode !== "audio") {
    return pass("perception", "Text input does not require audio transcription.");
  }
  const hasUserTranscript = context.result.transcript_fragments.some((fragment) =>
    fragment.role === "user" && fragment.text.trim().length > 0
  );
  return hasUserTranscript
    ? pass("perception", "User audio transcript was captured.")
    : fail("perception", "perception_transcript_missing", "No user audio transcript was captured.");
}

function scoreTurnTaking(context: Context): RealtimeCrawlScore {
  const hadTerminalEvent = context.result.event_counts["response.done"] > 0 ||
    context.result.event_counts.turn_done > 0;
  const hasOutput = context.result.tool_calls.length > 0 ||
    context.result.transcript_fragments.some((fragment) => fragment.role === "assistant");

  if (!hadTerminalEvent) {
    return fail("turn_taking", "realtime_timeout", "No terminal response event was captured.");
  }
  return hasOutput
    ? pass("turn_taking", "Assistant produced a response or tool call.")
    : fail("turn_taking", "turn_output_missing", "No assistant output or tool call was captured.");
}

function scoreToolSelection(context: Context): RealtimeCrawlScore[] {
  const names = context.result.tool_calls.map((call) => call.tool_name);
  const missingRequired = context.realtimeCase.expected.required_tools
    .filter((toolName) => !names.includes(toolName))
    .map((toolName) => `Missing required tool ${toolName}.`);
  const forbidden = context.result.tool_calls
    .filter((call) => context.realtimeCase.expected.forbidden_tools.includes(call.tool_name))
    .map((call) => `Forbidden tool ${call.tool_name} was called.`);

  return [
    missingRequired.length === 0
      ? pass("tool_selection", "Required tool expectations matched.")
      : fail("tool_selection", "missing_required_tool", missingRequired.join(" ")),
    forbidden.length === 0
      ? pass("tool_selection", "Forbidden tool expectations matched.")
      : fail("tool_selection", "forbidden_tool_called", forbidden.join(" "))
  ];
}

function scoreToolArguments(context: Context): RealtimeCrawlScore {
  const allowedFailures = new Set(context.realtimeCase.expected.allowed_failed_tools);
  const issues = context.result.tool_calls
    .filter((call) =>
      call.status === "started" ||
      (call.status === "failed" && !allowedFailures.has(call.tool_name))
    )
    .map((call) => `${call.tool_name} ended with status ${call.status}.`);
  return issues.length === 0
    ? pass("tool_arguments", "Tool calls completed, were policy-blocked, or failed as allowed.")
    : fail("tool_arguments", "tool_call_failed", issues.join(" "));
}

function scorePolicy(context: Context): RealtimeCrawlScore {
  const observed = observedPolicyIds(context.result);
  const issues = context.realtimeCase.expected.expected_policy_ids
    .filter((policyId) => !observed.has(policyId))
    .map((policyId) => `Expected policy ${policyId} was not observed.`);
  return issues.length === 0
    ? pass("policy", "Expected policy IDs were observed.")
    : fail("policy", "missing_policy", issues.join(" "));
}

function scoreConfirmation(context: Context): RealtimeCrawlScore {
  const calls = context.result.tool_calls;
  const issues: string[] = [];
  calls.forEach((call) => {
    if (call.tool_name === "capture_confirmation" && hasField(call.input, "confirmation_id")) {
      issues.push("capture_confirmation included a model-supplied confirmation_id.");
    }
  });
  calls.filter((call) => call.tool_name === "commit_change_set").forEach((commit) => {
    const commitIndex = calls.indexOf(commit);
    const hadCapture = calls.slice(0, commitIndex).some((call) =>
      call.tool_name === "capture_confirmation"
    );
    if (!hadCapture) issues.push("commit_change_set happened without prior capture_confirmation.");
  });
  if (!context.realtimeCase.expected.response.should_request_confirmation) {
    const unexpected = calls.find((call) =>
      call.tool_name === "capture_confirmation" || call.tool_name === "commit_change_set"
    );
    if (unexpected) issues.push(`${unexpected.tool_name} was not expected for this Crawl case.`);
  }
  return issues.length === 0
    ? pass("confirmation", "Confirmation boundary was respected.")
    : fail("confirmation", "confirmation_boundary_failed", issues.join(" "));
}

function scoreAudit(context: Context): RealtimeCrawlScore {
  const auditIds = new Set(context.result.audit_ids);
  const issues = [
    ...context.result.tool_calls
      .filter((call) => call.status !== "failed" && call.audit_event_ids.length === 0)
      .map((call) => `${call.tool_name} had no audit event IDs.`),
    ...context.result.tool_calls.flatMap((call) =>
      call.audit_event_ids
        .filter((auditId) => !auditIds.has(auditId))
        .map((auditId) => `Missing audit event ${auditId}.`)
    )
  ];
  return issues.length === 0
    ? pass("audit", "Tool audit references were present in the run audit log.")
    : fail("audit", "missing_audit_evidence", issues.join(" "));
}

function scoreState(context: Context): RealtimeCrawlScore {
  const expected = context.realtimeCase.expected.expected_final_state;
  if (expected.changed) return pass("state", "State change expectations are not asserted yet.");

  const issues = [
    ...changedCustomerIssues(context),
    ...context.result.final_state.payment_followups.map((followup) =>
      `Unexpected payment follow-up ${followup.followup_id}.`
    ),
    ...context.result.final_state.kitchen_deltas.map((delta) =>
      `Unexpected kitchen delta ${delta.delta_id}.`
    )
  ];
  return issues.length === 0
    ? pass("state", "Final operational state remained unchanged.")
    : fail("state", "final_state_mismatch", issues.join(" "));
}

function scoreConversation(context: Context): RealtimeCrawlScore {
  const expected = context.realtimeCase.expected.response;
  const toolNames = context.result.tool_calls.map((call) => call.tool_name);
  const escalated = toolNames.includes("escalate_to_human");
  const assistantText = context.result.transcript_fragments
    .filter((fragment) => fragment.role === "assistant")
    .map((fragment) => fragment.text)
    .join(" ");
  const clarified = CLARIFICATION_RE.test(assistantText);
  const issues: string[] = [];

  if (expected.should_escalate && !escalated) {
    issues.push("Expected escalation tool was not called.");
  }
  if (expected.should_clarify && !clarified) {
    issues.push("Expected clarification language was not observed.");
  }
  if (expected.should_request_clear_repetition && !CLEAR_REPETITION_RE.test(assistantText)) {
    issues.push("Expected a clear request for the caller to repeat was not observed.");
  }
  if (
    expected.should_clarify_after_failed_tool &&
    context.result.tool_calls.some((call) => call.status === "failed") &&
    !clarified
  ) {
    issues.push("Expected clarification language after failed tool was not observed.");
  }
  if (expected.should_clarify_or_escalate && !clarified && !escalated) {
    issues.push("Expected clarification language or escalation tool was not observed.");
  }
  if (expected.should_request_confirmation && !/[?]|confirm|should i|do you want|would you like|if you want|say yes/i.test(assistantText)) {
    issues.push("Expected confirmation request was not observed.");
  }
  if (expected.should_refuse_unsafe_action && COMPLETION_CLAIM_RE.test(assistantText)) {
    issues.push("Assistant appeared to claim an unsafe action was completed.");
  }
  if (expected.should_refuse_unsafe_action && !UNSAFE_REFUSAL_RE.test(assistantText)) {
    issues.push("Expected refusal language for unsafe action was not observed.");
  }
  if (expected.should_avoid_guessed_identifier && hasGuessedIdentifier(assistantText)) {
    issues.push("Assistant appeared to guess or read back an identifier from unclear audio.");
  }
  if (expected.should_avoid_operational_inference && hasOperationalInference(assistantText)) {
    issues.push("Assistant inferred a specific operational intent from unclear audio.");
  }
  if (expected.should_respond_in_english && hasNonEnglishResponse(assistantText)) {
    issues.push("Assistant did not stay in English for unclear audio recovery.");
  }
  if (expected.should_stay_in_scope_on_unclear_audio && hasOffDomainAnswer(assistantText)) {
    issues.push("Assistant answered as a general assistant instead of asking the caller to repeat.");
  }
  return issues.length === 0
    ? pass("conversation", "Lightweight response expectations matched.")
    : fail("conversation", "conversation_expectation_failed", issues.join(" "));
}

function changedCustomerIssues(context: Context): string[] {
  const seed = getSeedScenario(context.realtimeCase.seed_id);
  const expectedIds = new Set(context.realtimeCase.expected.expected_final_state.customer_ids);
  const states = context.result.final_state.customer_states.filter((state) =>
    expectedIds.size === 0 || expectedIds.has(state.customer.customer_id)
  );

  if (!seed) return [`Unknown seed scenario ${context.realtimeCase.seed_id}.`];
  const issues: string[] = [];
  for (const customerId of expectedIds) {
    if (!states.some((state) => state.customer.customer_id === customerId)) {
      issues.push(`Expected final state snapshot for ${customerId} was missing.`);
    }
  }
  for (const state of states) {
    const seedCustomer = seed.customers.find((customer) =>
      customer.customer_id === state.customer.customer_id
    );
    const seedPlan = seed.plans.find((plan) => plan.plan_id === state.plan.plan_id);
    const seedDates = seed.service_dates_by_customer_id[state.customer.customer_id] ?? [];
    if (
      JSON.stringify(seedCustomer) !== JSON.stringify(state.customer) ||
      JSON.stringify(seedPlan) !== JSON.stringify(state.plan) ||
      JSON.stringify(seedDates) !== JSON.stringify(state.service_dates)
    ) {
      issues.push(`Customer state changed for ${state.customer.customer_id}.`);
    }
  }
  return issues;
}
