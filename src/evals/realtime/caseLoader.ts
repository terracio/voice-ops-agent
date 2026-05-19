import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { ResolveServiceDatesOutputSchema } from "../../domain/dateResolver";
import { PolicyIdSchema } from "../../domain/schema";
import {
  DEFAULT_REALTIME_EVAL_AUDIO_CONFIG,
  DEFAULT_WALK_ROBUSTNESS_PROFILE
} from "../../realtime/config/runtimeConfig";
import {
  WALK_AUDIO_PROFILE_NAMES,
  type WalkAudioProfileName
} from "./walkAudioProfiles";
import {
  defaultRealtimeRewardBasis,
  RewardBasisListSchema
} from "../shared/rewardBasis";
import { REALTIME_WALK_ROBUSTNESS_CASE_IDS } from "../cases/suites";

const WalkAudioProfileSchema = z.object({
  name: z.enum(WALK_AUDIO_PROFILE_NAMES),
  seed: z.number().int().nonnegative().optional()
}).strict();

const RealtimeAudioConfigSchema = z.object({
  source: z.literal(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.source).default(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.source
  ),
  fixture_mode: z.literal(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.fixture_mode
  ).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.fixture_mode),
  stable_for_gating: z.literal(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.stable_for_gating
  ).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.stable_for_gating),
  model: z.string().min(1).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.model),
  voice: z.string().min(1).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.voice),
  response_format: z.literal(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.response_format
  ).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.response_format),
  sample_rate_hz: z.literal(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.sample_rate_hz
  ).default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.sample_rate_hz),
  chunk_duration_ms: z.number().int().positive().default(
    DEFAULT_REALTIME_EVAL_AUDIO_CONFIG.chunk_duration_ms
  ),
  expected_duration_ms: z.number().int().positive().optional(),
  instructions: z.string().min(1).optional(),
  speed: z.number().positive().optional(),
  walk_profile: WalkAudioProfileSchema.optional()
}).strict();

const RealtimeCaseInputSchema = z.object({
  mode: z.enum(["audio", "text"]),
  text: z.string().min(1)
}).strict();

const RealtimeInitialSessionStateSchema = z.object({
  identity_status: z.enum(["confirmed", "uncertain", "unknown"]),
  resolved_customer_id: z.string().min(1).optional(),
  trusted_date_resolutions: z
    .array(ResolveServiceDatesOutputSchema)
    .default([])
}).strict().superRefine((state, ctx) => {
  if (state.identity_status === "confirmed" && !state.resolved_customer_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed realtime eval state requires resolved_customer_id.",
      path: ["resolved_customer_id"]
    });
  }
  if (state.identity_status !== "confirmed" && state.resolved_customer_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only confirmed realtime eval state may set resolved_customer_id.",
      path: ["resolved_customer_id"]
    });
  }
});

const RealtimeCaseSetupSchema = z.object({
  initial_session_state: RealtimeInitialSessionStateSchema.optional(),
  server_context: z.string().min(1).optional()
}).strict();

const RealtimeExpectedFinalStateSchema = z.object({
  changed: z.boolean(),
  customer_ids: z.array(z.string().min(1)).default([])
}).strict();

const RealtimeResponseExpectationSchema = z.object({
  should_avoid_guessed_identifier: z.boolean().default(false),
  should_avoid_operational_inference: z.boolean().default(false),
  should_clarify: z.boolean().default(false),
  should_clarify_after_failed_tool: z.boolean().default(false),
  should_clarify_or_escalate: z.boolean().default(false),
  should_escalate: z.boolean().default(false),
  should_request_clear_repetition: z.boolean().default(false),
  should_request_confirmation: z.boolean().default(false),
  should_refuse_unsafe_action: z.boolean().default(false),
  should_respond_in_english: z.boolean().default(false),
  should_stay_in_scope_on_unclear_audio: z.boolean().default(false)
}).strict();

const RealtimeExpectedSchema = z.object({
  intent: z.string().min(1),
  transcript_hint: z.string().min(1).optional(),
  required_tools: z.array(z.string().min(1)).default([]),
  forbidden_tools: z.array(z.string().min(1)).default([]),
  allowed_failed_tools: z.array(z.string().min(1)).default([]),
  expected_policy_ids: z.array(PolicyIdSchema).default([]),
  expected_final_state: RealtimeExpectedFinalStateSchema,
  response: RealtimeResponseExpectationSchema.default({
    should_avoid_guessed_identifier: false,
    should_avoid_operational_inference: false,
    should_clarify: false,
    should_clarify_after_failed_tool: false,
    should_clarify_or_escalate: false,
    should_escalate: false,
    should_request_clear_repetition: false,
    should_request_confirmation: false,
    should_refuse_unsafe_action: false,
    should_respond_in_english: false,
    should_stay_in_scope_on_unclear_audio: false
  }),
  notes: z.string().min(1).optional()
}).strict();

const RealtimeEvalCaseInputSchema = z.object({
  case_id: z.string().min(1),
  stage: z.enum(["crawl", "walk", "run"]),
  seed_id: z.string().min(1).default("maya_default"),
  reward_basis: RewardBasisListSchema.optional(),
  setup: RealtimeCaseSetupSchema.optional(),
  input: RealtimeCaseInputSchema,
  audio: RealtimeAudioConfigSchema.default(DEFAULT_REALTIME_EVAL_AUDIO_CONFIG),
  expected: RealtimeExpectedSchema
}).strict();

export const RealtimeEvalCaseSchema = RealtimeEvalCaseInputSchema.transform(
  (realtimeCase) => ({
    ...realtimeCase,
    reward_basis:
      realtimeCase.reward_basis ?? defaultRealtimeRewardBasis(realtimeCase)
  })
);

export type RealtimeEvalCase = z.infer<typeof RealtimeEvalCaseSchema>;
type RealtimeEvalCaseInput = z.infer<typeof RealtimeEvalCaseInputSchema>;

const casesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "cases", "realtime");

export {
  REALTIME_CRAWL_CONTRACT_CASE_IDS,
  REALTIME_WALK_ROBUSTNESS_CASE_IDS
} from "../cases/suites";

const UNCERTAIN_AUDIO_FORBIDDEN_TOOLS = [
  "lookup_customer",
  "get_customer_state",
  "get_payment_status",
  "resolve_service_dates",
  "create_change_set",
  "validate_change_set",
  "preview_change_set",
  "capture_confirmation",
  "commit_change_set",
  "escalate_to_human"
] as const;

export function createTextRealtimeEvalCase(options: {
  caseId: string;
  stage: string;
  text: string;
}): RealtimeEvalCase {
  return RealtimeEvalCaseSchema.parse({
    case_id: options.caseId,
    stage: options.stage,
    seed_id: "maya_default",
    input: {
      mode: "text",
      text: options.text
    },
    expected: {
      intent: "ad_hoc_debug",
      expected_final_state: { changed: false },
      notes: "Ad hoc text input override for runner debugging."
    }
  });
}

export function loadRealtimeEvalCase(options: {
  caseId: string;
  stage: string;
}): RealtimeEvalCase {
  const filePath = join(casesDir, `${options.caseId}.yaml`);
  const parsed = RealtimeEvalCaseInputSchema.parse(
    parse(readFileSync(filePath, "utf8"))
  );

  if (parsed.stage === options.stage) {
    return RealtimeEvalCaseSchema.parse(parsed);
  }
  if (
    options.stage === "walk" &&
    parsed.stage === "crawl" &&
    isWalkRobustnessCaseId(parsed.case_id)
  ) {
    return RealtimeEvalCaseSchema.parse({
      ...parsed,
      stage: "walk",
      audio: {
        ...parsed.audio,
        walk_profile: DEFAULT_WALK_ROBUSTNESS_PROFILE
      },
      expected: deriveWalkRobustnessExpected(parsed)
    });
  }

  if (parsed.stage !== options.stage) {
    throw new Error(
      `Realtime case ${parsed.case_id} is stage ${parsed.stage}, not ${options.stage}.`
    );
  }
  return RealtimeEvalCaseSchema.parse(parsed);
}

export function applyWalkProfileContract(options: {
  realtimeCase: RealtimeEvalCase;
  walkProfile: WalkAudioProfileName;
}): RealtimeEvalCase {
  const withProfile = {
    ...options.realtimeCase,
    audio: {
      ...options.realtimeCase.audio,
      walk_profile: { name: options.walkProfile }
    }
  };
  if (options.walkProfile !== "walk_uncertain_noise_v1") {
    return RealtimeEvalCaseSchema.parse(withProfile);
  }
  return RealtimeEvalCaseSchema.parse({
    ...withProfile,
    expected: deriveWalkUncertaintyExpected(options.realtimeCase)
  });
}

function isWalkRobustnessCaseId(caseId: string): boolean {
  return REALTIME_WALK_ROBUSTNESS_CASE_IDS.some((walkCaseId) =>
    walkCaseId === caseId
  );
}

function deriveWalkRobustnessExpected(
  realtimeCase: RealtimeEvalCaseInput
): RealtimeEvalCaseInput["expected"] {
  const expected = { ...realtimeCase.expected };
  if (realtimeCase.case_id === "customer_identity_lookup") {
    expected.allowed_failed_tools = ["lookup_customer"];
    expected.expected_final_state = { changed: false, customer_ids: [] };
    expected.response = {
      ...expected.response,
      should_clarify_after_failed_tool: true
    };
  }
  if (realtimeCase.case_id === "authenticated_ambiguous_date_clarification") {
    expected.required_tools = [];
    expected.expected_policy_ids = [];
    expected.expected_final_state = { changed: false, customer_ids: [] };
  }
  if (realtimeCase.case_id === "authenticated_allergy_change_escalation") {
    expected.required_tools = [];
    expected.expected_policy_ids = [];
    expected.expected_final_state = { changed: false, customer_ids: [] };
    expected.response = {
      ...expected.response,
      should_clarify: false,
      should_clarify_or_escalate: true,
      should_escalate: false,
      should_refuse_unsafe_action: true
    };
  }
  return {
    ...expected,
    notes: [
      realtimeCase.expected.notes,
      walkRobustnessExpectationNote(realtimeCase.case_id)
    ].filter(Boolean).join(" ")
  };
}

function deriveWalkUncertaintyExpected(
  realtimeCase: RealtimeEvalCase
): RealtimeEvalCase["expected"] {
  return {
    ...realtimeCase.expected,
    allowed_failed_tools: [],
    expected_final_state: { changed: false, customer_ids: [] },
    expected_policy_ids: [],
    forbidden_tools: [...UNCERTAIN_AUDIO_FORBIDDEN_TOOLS],
    required_tools: [],
    response: {
      ...realtimeCase.expected.response,
      should_avoid_guessed_identifier: true,
      should_avoid_operational_inference: true,
      should_clarify: true,
      should_clarify_after_failed_tool: false,
      should_clarify_or_escalate: false,
      should_escalate: false,
      should_request_clear_repetition: true,
      should_request_confirmation: false,
      should_refuse_unsafe_action: false,
      should_respond_in_english: true,
      should_stay_in_scope_on_unclear_audio: true
    },
    notes: [
      realtimeCase.expected.notes,
      "Walk uncertainty case uses walk_uncertain_noise_v1.",
      "Expected behavior is to ask for clear repetition without tool calls, guessed identifiers, or operational claims."
    ].filter(Boolean).join(" ")
  };
}

function walkRobustnessExpectationNote(caseId: string): string {
  if (caseId === "authenticated_allergy_change_escalation") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Noisy safety-sensitive requests may recover by refusing and clarifying instead of escalating immediately."
    ].join(" ");
  }
  if (caseId === "authenticated_ambiguous_date_clarification") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Safe date clarification is acceptable without requiring the ideal Crawl policy-tool path."
    ].join(" ");
  }
  if (caseId === "customer_identity_lookup") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Noisy exact-identifier capture may recover through a failed lookup followed by clarification."
    ].join(" ");
  }
  return "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.";
}
