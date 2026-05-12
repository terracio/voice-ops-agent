import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const RealtimeAudioConfigSchema = z.object({
  source: z.literal("openai_tts").default("openai_tts"),
  model: z.string().min(1).default("gpt-4o-mini-tts"),
  voice: z.string().min(1).default("alloy"),
  response_format: z.literal("pcm").default("pcm"),
  sample_rate_hz: z.literal(24_000).default(24_000),
  chunk_duration_ms: z.number().int().positive().default(20),
  instructions: z.string().min(1).optional(),
  speed: z.number().positive().optional()
}).strict();

const RealtimeCaseInputSchema = z.object({
  mode: z.enum(["audio", "text"]),
  text: z.string().min(1)
}).strict();

const RealtimeExpectedSchema = z.object({
  transcript_hint: z.string().min(1).optional(),
  required_tools: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1).optional()
}).strict().default({ required_tools: [] });

export const RealtimeEvalCaseSchema = z.object({
  case_id: z.string().min(1),
  stage: z.enum(["crawl", "walk", "run"]),
  seed_id: z.string().min(1).default("maya_default"),
  input: RealtimeCaseInputSchema,
  audio: RealtimeAudioConfigSchema.default({
    source: "openai_tts",
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
