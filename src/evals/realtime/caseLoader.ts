import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PolicyIdSchema } from "../../domain/schema";

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
  speed: z.number().positive().optional()
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
  should_clarify: z.boolean().default(false),
  should_escalate: z.boolean().default(false),
  should_request_confirmation: z.boolean().default(false),
  should_refuse_unsafe_action: z.boolean().default(false)
}).strict();

const RealtimeExpectedSchema = z.object({
  intent: z.string().min(1),
  transcript_hint: z.string().min(1).optional(),
  required_tools: z.array(z.string().min(1)).default([]),
  forbidden_tools: z.array(z.string().min(1)).default([]),
  expected_policy_ids: z.array(PolicyIdSchema).default([]),
  expected_final_state: RealtimeExpectedFinalStateSchema,
  response: RealtimeResponseExpectationSchema.default({
    should_clarify: false,
    should_escalate: false,
    should_request_confirmation: false,
    should_refuse_unsafe_action: false
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

  if (parsed.stage !== options.stage) {
    throw new Error(
      `Realtime case ${parsed.case_id} is stage ${parsed.stage}, not ${options.stage}.`
    );
  }
  return parsed;
}
