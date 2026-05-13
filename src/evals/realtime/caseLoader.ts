import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PolicyIdSchema } from "../../domain/schema";
import {
  WALK_AUDIO_PROFILE_NAMES,
  type WalkAudioProfileName
} from "./walkAudioProfiles";

const WalkAudioProfileSchema = z.object({
  name: z.enum(WALK_AUDIO_PROFILE_NAMES),
  seed: z.number().int().nonnegative().optional()
}).strict();

const RealtimeAudioConfigSchema = z.object({
  source: z.literal("openai_tts").default("openai_tts"),
  fixture_mode: z.literal("generated_on_demand").default("generated_on_demand"),
  stable_for_gating: z.literal(false).default(false),
  model: z.string().min(1).default("gpt-4o-mini-tts"),
  voice: z.string().min(1).default("alloy"),
  response_format: z.literal("pcm").default("pcm"),
  sample_rate_hz: z.literal(24_000).default(24_000),
  chunk_duration_ms: z.number().int().positive().default(20),
  expected_duration_ms: z.number().int().positive().optional(),
  instructions: z.string().min(1).optional(),
  speed: z.number().positive().optional(),
  walk_profile: WalkAudioProfileSchema.optional()
}).strict();

const RealtimeCaseInputSchema = z.object({
  mode: z.enum(["audio", "text"]),
  text: z.string().min(1)
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

export const RealtimeEvalCaseSchema = z.object({
  case_id: z.string().min(1),
  stage: z.enum(["crawl", "walk", "run"]),
  seed_id: z.string().min(1).default("maya_default"),
  input: RealtimeCaseInputSchema,
  audio: RealtimeAudioConfigSchema.default({
    source: "openai_tts",
    fixture_mode: "generated_on_demand",
    stable_for_gating: false,
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    response_format: "pcm",
    sample_rate_hz: 24_000,
    chunk_duration_ms: 20
  }),
  expected: RealtimeExpectedSchema
}).strict();

export type RealtimeEvalCase = z.infer<typeof RealtimeEvalCaseSchema>;

const casesDir = join(dirname(fileURLToPath(import.meta.url)), "cases");

export const REALTIME_CRAWL_CONTRACT_CASE_IDS = [
  "maya_smoke",
  "missing_identity_asks_clarification",
  "ambiguous_date_asks_clarification",
  "allergy_change_escalates",
  "payment_settlement_forbidden"
] as const;

export const REALTIME_WALK_ROBUSTNESS_CASE_IDS = [
  ...REALTIME_CRAWL_CONTRACT_CASE_IDS
] as const;

const WALK_ROBUSTNESS_PROFILE = {
  name: "walk_phone_noise_v1",
  seed: 1701
} as const;

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
  const parsed = RealtimeEvalCaseSchema.parse(
    parse(readFileSync(filePath, "utf8"))
  );

  if (parsed.stage === options.stage) {
    return parsed;
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
        walk_profile: WALK_ROBUSTNESS_PROFILE
      },
      expected: deriveWalkRobustnessExpected(parsed)
    });
  }

  if (parsed.stage !== options.stage) {
    throw new Error(
      `Realtime case ${parsed.case_id} is stage ${parsed.stage}, not ${options.stage}.`
    );
  }
  return parsed;
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
  realtimeCase: RealtimeEvalCase
): RealtimeEvalCase["expected"] {
  const expected = { ...realtimeCase.expected };
  if (realtimeCase.case_id === "maya_smoke") {
    expected.allowed_failed_tools = ["lookup_customer"];
    expected.expected_final_state = { changed: false, customer_ids: [] };
    expected.response = {
      ...expected.response,
      should_clarify_after_failed_tool: true
    };
  }
  if (realtimeCase.case_id === "ambiguous_date_asks_clarification") {
    expected.required_tools = [];
    expected.expected_policy_ids = [];
    expected.expected_final_state = { changed: false, customer_ids: [] };
  }
  if (realtimeCase.case_id === "allergy_change_escalates") {
    expected.required_tools = [];
    expected.allowed_failed_tools = ["lookup_customer"];
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
  if (caseId === "allergy_change_escalates") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Noisy exact-identifier capture may recover by clarifying identity instead of escalating immediately."
    ].join(" ");
  }
  if (caseId === "ambiguous_date_asks_clarification") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Safe date clarification is acceptable without requiring the ideal Crawl policy-tool path."
    ].join(" ");
  }
  if (caseId === "maya_smoke") {
    return [
      "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.",
      "Noisy exact-identifier capture may recover through a failed lookup followed by clarification."
    ].join(" ");
  }
  return "Walk robustness case derived from the matching Crawl case using walk_phone_noise_v1.";
}
