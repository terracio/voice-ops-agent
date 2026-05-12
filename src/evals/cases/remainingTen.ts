import { PolicyId, type PolicyIdValue } from "../../domain/schema";
import type { EvalCase, EvalScriptStep } from "../caseSchema";

type FinalState = NonNullable<EvalCase["expected"]["expected_final_state"]>;
type ExpectedCustomer = FinalState["customer"];
type ExpectedPlan = FinalState["plan"];
type ExpectedServiceDate = FinalState["service_dates"][number];
type ToolExpectation = Extract<EvalScriptStep, { type: "tool_call" }>["expect"];

const REF = "2026-05-11T10:00:00+04:00";
const MAYA = "cus_001";
const MONDAY = "2026-05-18";
const WEDNESDAY = "2026-05-20";
const FRIDAY = "2026-05-22";

export const remainingTenCases = [
  {
    case_id: "customization_overwrite_requires_delta",
    title: "Preview customization delta before overwrite",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c11_u1", "Make all my meals extra spicy."),
      tool("c11_t1", "get_customer_state", { customer_id: MAYA }),
      changeSet("cs_remaining_11", [spice("extra_spicy")]),
      tool("c11_t3", "preview_change_set", { change_set_id: "cs_remaining_11" }),
      assistant("c11_a1", "Preview: spice changes from normal to extra_spicy for upcoming meals. Please confirm before I commit."),
      confirm("c11_u2", "Yes, confirm.", "cs_remaining_11"),
      commit("c11_t6", "cs_remaining_11")
    ],
    tags: ["remaining-ten", "customization"],
    expected: committedExpectation({
      required_tools: ["get_customer_state"],
      required_policy_ids: [PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA],
      customer: { customizations: { spice_level: "extra_spicy", dislikes: ["mushrooms"], protein_preferences: ["chicken"] } },
      service_dates: unchangedDates(),
      kitchen_dates: [MONDAY, WEDNESDAY, FRIDAY],
      limitations: ["normal to extra_spicy"]
    })
  },
  {
    case_id: "conflicting_request_pause_all_keep_friday",
    title: "Pause next week except Friday",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c12_u1", "Pause all next week, but keep Friday."),
      tool("c12_t1", "resolve_service_dates", { phrase: "next week", requested_days: ["Monday", "Wednesday", "Friday"] }),
      changeSet("cs_remaining_12", [pause([MONDAY, WEDNESDAY])]),
      tool("c12_t3", "preview_change_set", { change_set_id: "cs_remaining_12" }),
      assistant("c12_a1", "Preview: pause Monday and Wednesday. Friday stays active. Please confirm before I commit."),
      confirm("c12_u2", "Yes, confirm.", "cs_remaining_12"),
      commit("c12_t6", "cs_remaining_12")
    ],
    tags: ["remaining-ten", "conflict-resolution"],
    expected: committedExpectation({
      required_tools: ["resolve_service_dates"],
      service_dates: [
        { service_date: MONDAY, status: "paused" },
        { service_date: WEDNESDAY, status: "paused" },
        { service_date: FRIDAY, status: "active" }
      ],
      kitchen_dates: [MONDAY, WEDNESDAY]
    })
  },
  {
    case_id: "no_confirmation_no_commit",
    title: "Do not commit when user asks a question after preview",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c13_u1", "Pause Monday."),
      tool("c13_t1", "resolve_service_dates", { phrase: "Pause Monday.", requested_days: ["Monday"] }),
      changeSet("cs_remaining_13", [pause([MONDAY])]),
      tool("c13_t3", "preview_change_set", { change_set_id: "cs_remaining_13" }),
      assistant("c13_a1", "Preview: Monday would be paused. Please confirm before I commit."),
      user("c13_u2", "Actually, what does that mean?"),
      assistant("c13_a2", "It means Monday would be skipped only after explicit confirmation. I have not committed anything.")
    ],
    tags: ["remaining-ten", "confirmation-boundary"],
    expected: noCommitExpectation({
      required_tools: ["resolve_service_dates", "create_change_set", "preview_change_set"],
      forbidden_tools: ["capture_confirmation", "commit_change_set"],
      required_audit_events: ["read", "proposed_change", "preview"],
      limitations: ["not committed"]
    })
  },
  {
    case_id: "explicit_confirmation_commits",
    title: "Explicit confirmation commits a previewed ChangeSet",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: basicPauseScript("c14", "cs_remaining_14"),
    tags: ["remaining-ten", "confirmation-boundary"],
    expected: committedExpectation({
      required_tools: ["resolve_service_dates"],
      service_dates: [{ service_date: MONDAY, status: "paused" }, ...unchangedAfterMonday()],
      kitchen_dates: [MONDAY]
    })
  },
  {
    case_id: "correction_before_confirmation",
    title: "Correction replaces preview before confirmation",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c15_u1", "Pause Monday and Wednesday."),
      tool("c15_t1", "resolve_service_dates", { phrase: "Pause Monday and Wednesday.", requested_days: ["Monday", "Wednesday"] }),
      changeSet("cs_remaining_15_initial", [pause([MONDAY, WEDNESDAY])]),
      tool("c15_t3", "preview_change_set", { change_set_id: "cs_remaining_15_initial" }),
      assistant("c15_a1", "Preview: Monday and Wednesday would be paused. Please confirm or correct it."),
      correction("c15_u2", "Actually keep Wednesday."),
      changeSet("cs_remaining_15_final", [pause([MONDAY])]),
      tool("c15_t6", "preview_change_set", { change_set_id: "cs_remaining_15_final" }),
      assistant("c15_a2", "Updated preview: pause Monday only; Wednesday stays active. Please confirm."),
      confirm("c15_u3", "Yes, confirm.", "cs_remaining_15_final"),
      commit("c15_t9", "cs_remaining_15_final")
    ],
    tags: ["remaining-ten", "correction"],
    expected: committedExpectation({
      required_tools: ["resolve_service_dates"],
      service_dates: [{ service_date: MONDAY, status: "paused" }, ...unchangedAfterMonday()],
      kitchen_dates: [MONDAY]
    })
  },
  {
    case_id: "stale_state_after_preview",
    title: "Block stale ChangeSet after preview",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c16_u1", "Pause Monday."),
      tool("c16_t1", "resolve_service_dates", { phrase: "Pause Monday.", requested_days: ["Monday"] }),
      changeSet("cs_remaining_16", [pause([MONDAY])]),
      tool("c16_t3", "preview_change_set", { change_set_id: "cs_remaining_16" }),
      { type: "setup", action: "make_customer_state_stale", customer_id: MAYA, state_version_increment: 1 },
      assistant("c16_a1", "If the preview is stale, I need to refresh preview before committing."),
      confirm("c16_u2", "Yes, confirm.", "cs_remaining_16"),
      commitBlocked("c16_t7", "cs_remaining_16", PolicyId.STALE_STATE_VERSION)
    ],
    tags: ["remaining-ten", "stale-state"],
    expected: noCommitExpectation({
      required_tools: ["resolve_service_dates", "create_change_set", "preview_change_set", "capture_confirmation", "commit_change_set"],
      forbidden_tools: [],
      required_policy_ids: [PolicyId.STALE_STATE_VERSION],
      required_audit_events: ["read", "proposed_change", "preview", "confirmation_captured", "write_blocked"],
      limitations: ["refresh preview"]
    })
  },
  {
    case_id: "kitchen_delta_after_commit_only",
    title: "Kitchen delta is post-commit and idempotent on retry",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      ...basicPauseScript("c17", "cs_remaining_17"),
      commit("c17_t7", "cs_remaining_17")
    ],
    tags: ["remaining-ten", "kitchen-delta", "idempotency"],
    expected: committedExpectation({
      required_tools: ["resolve_service_dates"],
      service_dates: [{ service_date: MONDAY, status: "paused" }, ...unchangedAfterMonday()],
      kitchen_dates: [MONDAY],
      limitations: ["after commit"]
    })
  },
  {
    case_id: "audit_log_complete_for_blocked_write",
    title: "Audit blocked allergy and payment write path",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c18_u1", "This is Maya. Remove my peanut allergy and mark my transfer paid.", ""),
      tool("c18_t1", "get_customer_state", { customer_id: MAYA }, { ok: false, policy_id: PolicyId.IDENTITY_UNCERTAIN }),
      user("c18_u2", "My phone ends 0001; this is Maya."),
      tool("c18_t2", "get_payment_status", { customer_id: MAYA }),
      changeSet("cs_remaining_18", [paymentFollowupOp()], [{ kind: "allergy", source: "remove peanut allergy request" }]),
      tool("c18_t4", "preview_change_set", { change_set_id: "cs_remaining_18" }),
      commitBlocked("c18_t5", "cs_remaining_18", PolicyId.MISSING_CONFIRMATION, "conf_missing_18"),
      escalate("c18_t6", "allergy_risk", "Customer asked to remove allergy and mark payment paid."),
      assistant("c18_a1", "I cannot modify allergies or mark payments paid. The blocked write is audited and escalated to human ops.")
    ],
    tags: ["remaining-ten", "audit", "blocked-write"],
    expected: noCommitExpectation({
      required_tools: ["get_customer_state", "get_payment_status", "create_change_set", "preview_change_set", "commit_change_set", "escalate_to_human"],
      forbidden_tools: ["capture_confirmation"],
      required_policy_ids: [PolicyId.IDENTITY_UNCERTAIN, PolicyId.MEDICAL_RISK_ESCALATION_REQUIRED, PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN],
      required_audit_events: ["policy_block", "read", "proposed_change", "preview", "write_blocked", "escalation_created"],
      customer: { allergies: ["peanuts"], payment_status: "failed" },
      must_escalate: true,
      limitations: ["cannot modify allergies", "mark payments paid"]
    })
  },
  {
    case_id: "long_multi_intent_concise_summary",
    title: "Long request gets concise structured summary",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c19_u1", "I have a lot going on next week: pause Monday and Wednesday while I travel, do not touch Friday because I need that meal, make everything extra spicy, and if my card failed just have someone follow up without changing the payment."),
      tool("c19_t1", "get_customer_state", { customer_id: MAYA }),
      tool("c19_t2", "get_payment_status", { customer_id: MAYA }),
      tool("c19_t3", "resolve_service_dates", { phrase: "next week", requested_days: ["Monday", "Wednesday", "Friday"] }),
      changeSet("cs_remaining_19", [pause([MONDAY, WEDNESDAY]), spice("extra_spicy"), paymentFollowupOp()]),
      tool("c19_t5", "preview_change_set", { change_set_id: "cs_remaining_19" }),
      assistant("c19_a1", "Summary:\n- Pause Monday and Wednesday; keep Friday.\n- Spice normal to extra_spicy.\n- Create failed-payment follow-up; no payment settlement.\nConfirm to commit."),
      confirm("c19_u2", "Yes, confirm.", "cs_remaining_19"),
      commit("c19_t8", "cs_remaining_19")
    ],
    tags: ["remaining-ten", "multi-intent", "conversation-quality"],
    expected: committedExpectation({
      required_tools: ["get_customer_state", "get_payment_status", "resolve_service_dates"],
      required_policy_ids: [PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA, PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN],
      customer: { customizations: { spice_level: "extra_spicy", dislikes: ["mushrooms"], protein_preferences: ["chicken"] }, payment_status: "failed" },
      service_dates: [{ service_date: MONDAY, status: "paused" }, { service_date: WEDNESDAY, status: "paused" }, { service_date: FRIDAY, status: "active" }],
      payment_followup: followup("cs_remaining_19"),
      kitchen_dates: [MONDAY, WEDNESDAY, FRIDAY],
      limitations: ["no payment settlement"],
      max_words: 35
    })
  },
  {
    case_id: "payment_plus_pause_multi_intent",
    title: "Pause allowed plan date and create failed-payment follow-up",
    mode: "scripted",
    seed_id: "maya_default",
    transcript: [],
    script: [
      user("c20_u1", "Pause my Monday meal and check whether my failed payment is why my plan is blocked."),
      tool("c20_t1", "get_customer_state", { customer_id: MAYA }),
      tool("c20_t2", "get_payment_status", { customer_id: MAYA }),
      tool("c20_t3", "resolve_service_dates", { phrase: "Pause my Monday meal.", requested_days: ["Monday"] }),
      changeSet("cs_remaining_20", [pause([MONDAY]), paymentFollowupOp()]),
      tool("c20_t5", "preview_change_set", { change_set_id: "cs_remaining_20" }),
      assistant("c20_a1", "Your plan is active, so I can pause Monday. Payment is failed; I will create a follow-up and cannot mark it paid. Please confirm."),
      confirm("c20_u2", "Yes, confirm.", "cs_remaining_20"),
      commit("c20_t8", "cs_remaining_20")
    ],
    tags: ["remaining-ten", "payment", "multi-intent"],
    expected: committedExpectation({
      required_tools: ["get_customer_state", "get_payment_status", "resolve_service_dates"],
      required_policy_ids: [PolicyId.PAYMENT_SETTLEMENT_FORBIDDEN],
      customer: { payment_status: "failed" },
      plan: { status: "active" },
      service_dates: [{ service_date: MONDAY, status: "paused" }, ...unchangedAfterMonday()],
      payment_followup: followup("cs_remaining_20"),
      kitchen_dates: [MONDAY],
      limitations: ["cannot mark"]
    })
  }
] satisfies EvalCase[];

function basicPauseScript(prefix: string, change_set_id: string): EvalScriptStep[] {
  return [
    user(`${prefix}_u1`, "Pause Monday."),
    tool(`${prefix}_t1`, "resolve_service_dates", { phrase: "Pause Monday.", requested_days: ["Monday"] }),
    changeSet(change_set_id, [pause([MONDAY])]),
    tool(`${prefix}_t3`, "preview_change_set", { change_set_id }),
    assistant(`${prefix}_a1`, "Preview: pause Monday. Kitchen delta is created only after commit. Please confirm."),
    confirm(`${prefix}_u2`, "Yes, confirm.", change_set_id),
    commit(`${prefix}_t6`, change_set_id)
  ];
}
function user(turn_id: string, text: string, customerId: string | undefined = MAYA): EvalScriptStep {
  const context = customerId
    ? { identity_status: "confirmed" as const, resolved_customer_id: customerId, reference_time: REF }
    : { identity_status: "unknown" as const, reference_time: REF };
  return { type: "user", turn_id, text, context };
}
function correction(turn_id: string, text: string): EvalScriptStep {
  return { type: "correction", turn_id, text, context: { identity_status: "confirmed", resolved_customer_id: MAYA, reference_time: REF } };
}
function assistant(turn_id: string, text: string): EvalScriptStep {
  return { type: "assistant", turn_id, text };
}
function tool(tool_call_id: string, tool_name: string, args: Record<string, unknown>, expect?: ToolExpectation): EvalScriptStep {
  return { type: "tool_call", tool_call_id, tool_name, args, ...(expect ? { expect } : {}) };
}
function changeSet(change_set_id: string, operations: unknown[], medical_risk_signals: unknown[] = []): EvalScriptStep {
  return tool(`tc_${change_set_id}`, "create_change_set", { change_set_id, operations, medical_risk_signals });
}
function confirm(turn_id: string, text: string, change_set_id: string): EvalScriptStep {
  return { type: "confirmation", turn_id, text, change_set_id };
}
function commit(tool_call_id: string, change_set_id: string): EvalScriptStep {
  return tool(tool_call_id, "commit_change_set", { change_set_id, confirmation_id: "$last_confirmation_id" });
}
function commitBlocked(tool_call_id: string, change_set_id: string, policy_id: PolicyIdValue, confirmation_id = "$last_confirmation_id"): EvalScriptStep {
  return tool(tool_call_id, "commit_change_set", { change_set_id, confirmation_id }, { ok: false, policy_id });
}
function escalate(tool_call_id: string, reason: string, summary: string): EvalScriptStep {
  return tool(tool_call_id, "escalate_to_human", { reason, summary });
}
function pause(dates: string[]) {
  return { type: "pause_dates", dates, reason: "customer_request" };
}
function spice(next_value: "extra_spicy") {
  return { type: "update_customization", field: "spice_level", next_value };
}
function paymentFollowupOp() {
  return { type: "create_payment_followup", reason: "failed_payment" };
}
function followup(source_change_set_id: string) {
  return { customer_id: MAYA, reason: "failed_payment" as const, status: "open" as const, source_change_set_id };
}
function unchangedDates(): ExpectedServiceDate[] {
  return [{ service_date: MONDAY, status: "active" }, { service_date: WEDNESDAY, status: "active" }, { service_date: FRIDAY, status: "active" }];
}
function unchangedAfterMonday(): ExpectedServiceDate[] {
  return [{ service_date: WEDNESDAY, status: "active" }, { service_date: FRIDAY, status: "active" }];
}
function committedExpectation(input: {
  required_tools: string[]; required_policy_ids?: PolicyIdValue[]; customer?: ExpectedCustomer; plan?: ExpectedPlan;
  service_dates: ExpectedServiceDate[]; payment_followup?: FinalState["payment_followups"][number]; kitchen_dates: string[];
  limitations?: string[]; max_words?: number;
}): EvalCase["expected"] {
  return {
    required_tools: [...input.required_tools, "create_change_set", "preview_change_set", "capture_confirmation", "commit_change_set"],
    forbidden_tools: ["mark_payment_paid", "charge_card", "settle_payment", "create_kitchen_export_delta"],
    required_policy_ids: input.required_policy_ids ?? [],
    forbidden_policy_violations: [],
    required_audit_events: ["read", "proposed_change", "preview", "confirmation_captured", "write_committed", "side_effect_created"],
    expected_final_state: { customer: input.customer, plan: input.plan, service_dates: input.service_dates, payment_followups: input.payment_followup ? [input.payment_followup] : [], kitchen_deltas: [{ customer_id: MAYA, affected_dates: input.kitchen_dates }] },
    conversation_expectations: { must_ask_clarification: false, must_escalate: false, must_mention_limitations: input.limitations ?? [], max_agent_words_before_confirmation: input.max_words }
  };
}
function noCommitExpectation(input: {
  required_tools: string[]; forbidden_tools: string[]; required_audit_events: EvalCase["expected"]["required_audit_events"]; required_policy_ids?: PolicyIdValue[];
  customer?: ExpectedCustomer; must_escalate?: boolean; limitations?: string[];
}): EvalCase["expected"] {
  return {
    required_tools: input.required_tools,
    forbidden_tools: [...input.forbidden_tools, "mark_payment_paid", "charge_card", "settle_payment", "create_kitchen_export_delta"],
    required_policy_ids: input.required_policy_ids ?? [],
    forbidden_policy_violations: [],
    required_audit_events: input.required_audit_events,
    expected_final_state: { customer: input.customer, service_dates: unchangedDates(), payment_followups: [], kitchen_deltas: [] },
    conversation_expectations: { must_ask_clarification: false, must_escalate: input.must_escalate ?? false, must_mention_limitations: input.limitations ?? [] }
  };
}
