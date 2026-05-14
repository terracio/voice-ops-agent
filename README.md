# MealPlan VoiceOps

MealPlan VoiceOps is a production-shaped realtime voice operations agent for a fictional meal-plan subscription business.

This repo is intentionally small, but the core safety spine is implemented: deterministic seed data, a resettable mock DB, typed tools, ChangeSets, hard policy checks, audit logs, and a replay eval harness. The product path is a realtime contact-center voice agent; realtime and model-backed behavior must build on the same operational boundary rather than bypassing it.

## Start Here

- `SPEC.md` defines the product and engineering target.
- `PLAN.md` defines the milestone waves and handoff-ready tickets.
- `AGENTS.md` defines the coding rules and hard safety constraints.
- `TASKS.md` is the original proposed task breakdown and is secondary to `PLAN.md`.

## Current Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm eval
pnpm lint
```

`pnpm dev` runs Next.js with Webpack so the local Codex app runtime can use Next's WASM compiler fallback.

## Current Module Boundaries

- `src/app/` owns the minimal App Router shell.
- `src/domain/` owns domain schemas, seed data, the mock DB, ChangeSets, policies, and side-effect services.
- `src/tools/` owns typed tool registries and tool schemas.
- `src/audit/` owns audit event creation and log querying.
- `src/evals/` owns eval case contracts, the runner shell, and report generation.
- `tests/` owns Vitest tests.

Do not add empty placeholder folders for future slices. Add a folder only when the ticket introduces a file that is referenced by the app, tests, eval runner, or another implemented module.

## Safety Boundary

The project invariant is:

```text
ChangeSet -> preview -> server-captured confirmation -> policy validation -> commit -> audit
```

The model must never directly mutate operational state. Runtime correctness must live in structured code: Zod schemas, policy checks, ChangeSet services, typed tools, and eval scorers.
Payment follow-ups are ChangeSet operations. Kitchen export deltas are internal post-commit side effects, not model-facing operations.

## Eval Harness

`pnpm eval` runs the deterministic scripted harness mode without OpenAI credentials. `pnpm eval -- --mode scripted` selects it explicitly, and `pnpm eval -- --pass-k 3` repeats the scripted suite three times with aggregate pass-k reporting. Each run resets the mock DB by case seed ID at the harness boundary, executes the configured case executor, prints a terminal summary, and writes reports to `reports/eval-report.json` and `reports/eval-report.md`.

Scripted eval reports are labeled as operational-safety evidence. They prove the structured ChangeSet, policy, confirmation, side-effect, and audit boundaries. Future model-mode evals must provide separate model-behavior evidence; `--mode model` requires a server-side `OPENAI_API_KEY` and an explicit model executor, and it does not fall back to scripted behavior.

## Realtime Roadmap

The next milestone is Realtime-first:

```text
server-side Realtime runner
  -> clean-audio Crawl evals
  -> saved/noisy Walk evals
  -> browser Realtime demo
  -> multi-turn Run evals
```

The browser UI comes after the server-side Realtime runner can start a session, send audio, receive events and tool calls, execute tools through the existing registry, produce eval-compatible traces, and preserve audio artifacts for clean and noisy single-turn evals. `pnpm eval:realtime` is the planned credential-gated command for this path; `pnpm eval` remains the no-credentials scripted safety baseline.

### Realtime Runner Function Map

The current runner is a smoke foundation, not the full realtime eval suite yet.

- `runRealtimeAgentSmoke`: credential-gated entrypoint. It resolves the model/key, builds a realtime agent, connects a server-side SDK WebSocket session, sends one audio or text fixture, waits for a terminal event, closes the session, and returns raw events plus eval-friendly summaries.
- `createMealPlanRealtimeAgent`: builds the `RealtimeAgent` from the source-controlled realtime prompt and SDK-compatible tools.
- `createRealtimeAgentSdkTools`: adapts the provider-neutral MealPlan tools into SDK function tools. Tool execution still goes through the existing registry, schemas, policies, ChangeSets, and audit layer.
- `createRealtimeTraceCollector`: captures sanitized transport events, transcript fragments, SDK tool calls/results, audit IDs, and final DB state snapshots for later scoring.
- `createRealtimeSessionFactoryOptions`: defines the server-side session configuration: `gpt-realtime-2`, WebSocket transport, low reasoning, PCM input, transcription, platform tracing, and no automatic turn detection for deterministic fixtures.
- `createSdkRealtimeSession`: the only place that instantiates the OpenAI SDK `RealtimeSession`. It is wrapped behind `RealtimeSessionLike` so tests and future fallback transports can use the same runner boundary.
- `loadOpenAIServerEnv` and `resolveOpenAIRealtimeCredentials`: load local server credentials and skip cleanly when no key is present.
- `streamPcm16AudioToRealtimeSession`: splits PCM16 input into fixed chunks, commits once at the end, and requests the model response.
- `src/evals/realtime/cases/*.yaml`: define clean-audio Crawl contracts. Each case includes the caller text, fixture metadata, expected intent, required and forbidden tools, expected policy IDs, final-state expectations, and response expectations.
- `createPcm16Silence`: creates a fallback tiny synthetic audio fixture for direct runner tests.
- `sanitizeRealtimePayload`: keeps traces useful without logging raw audio/base64 payloads.

`pnpm eval:realtime -- --stage crawl` runs the first clean-audio Crawl suite; add `--case maya_smoke` to run one case. With `OPENAI_API_KEY` present it calls the real realtime agent and writes timestamped reports under `reports/realtime/<stage>/<case>/<run>/`, including `report.json`, `report.md`, a separate `trace.json` raw event trace, and playable clean input audio artifacts under `audio/clean_input.pcm` and `audio/clean_input.wav`. Cases that opt into a Walk audio profile stream the transformed audio and additionally write `audio/profile_input.pcm` and `audio/profile_input.wav` with profile metadata and checksums. It also enables OpenAI platform tracing for the SDK Realtime session by default, with workflow/group metadata so runs are inspectable in the Traces dashboard. Set `OPENAI_REALTIME_DISABLE_TRACING=1` or `OPENAI_AGENTS_DISABLE_TRACING=1` for sensitive local runs. The command exits nonzero when completed cases fail scoring so prompt/tool regressions are visible. Current audio fixtures are generated on demand with OpenAI TTS and marked `stable_for_gating: false`; cached PCM fixtures and stable gating checksums are future work.

`pnpm eval:realtime -- --stage walk` runs Walk A, the first robustness suite. It reuses the five Crawl prompts with `walk_phone_noise_v1`, a mild phone-bandwidth plus 18 dB SNR seeded-noise profile. The expectations are stage-specific: clear cases should preserve the Crawl tool path, while degraded exact-identifier or ambiguous-date turns can pass by clarifying safely and avoiding writes.

`--walk-profile walk_uncertain_noise_v1` runs an uncertainty contract over the selected Walk case. It keeps the same phone-bandwidth transform and uses a stronger 10 dB SNR seeded-noise mix. These runs do not ask the model to self-report what it heard and do not inject hidden audio-quality knowledge into the prompt; they score the observable safe behavior instead: ask the caller to repeat clearly in English, avoid tool calls, avoid guessed identifiers, avoid inferred operational intent, and stay within the MealPlan support scope.

Add `--oob-transcription` to run a diagnostic out-of-band realtime transcription after the main turn. The second response uses `conversation: "none"` and text-only output, so it is written to the report for comparison but is not added to the active conversation and does not affect scoring. Use it to compare built-in ASR transcript, realtime behavior, tool calls, and the same-model diagnostic transcript.

Walk testing surfaced an important limitation: under heavily degraded audio, built-in transcription, out-of-band transcription, and the assistant's behavior can diverge, and the OOB transcript can still hallucinate plausible content. OOB evidence is therefore diagnostic only, not a source of operational truth or a scoring oracle. The safety target is observable behavior: when capture is uncertain, the agent should clarify instead of calling tools, guessing identifiers, or inferring an operational request. Further prompt comparisons should wait for cached PCM fixtures so runs use identical audio instead of regenerated TTS.

### Browser Realtime Call Route

`POST /api/realtime/call` accepts the browser's WebRTC SDP offer and exchanges it with OpenAI from trusted server code. The route requires `OPENAI_API_KEY` on the server, sends `OpenAI-Safety-Identifier` from server-owned configuration, and posts a multipart request containing the SDP offer plus the Realtime session configuration. The browser receives only the SDP answer and `rtc_...` call id; it never receives the standard API key, tool definitions, or domain write capability.

The server starts sideband control immediately after OpenAI creates the call. `createServerRealtimeSessionUpdate` builds the sideband `session.update` event that attaches the MealPlan tools to the live Realtime session from trusted server code.

The sideband WebSocket listens for function calls, executes them through the existing registry/policy/audit layer, and returns `function_call_output` events to the Realtime session. `POST /api/realtime/control` and `pnpm debug:sideband -- --call-id rtc_xxx` remain local diagnostics for inspecting sideband attach behavior, but the browser demo uses the server-mediated call route as the active path. The current in-process control socket is local-demo infrastructure, not a production deployment pattern.

## Implementation Rules

- Keep source files under 350 lines.
- Prefer small vertical slices over broad scaffolding.
- Keep domain logic independent of UI.
- Keep the tool registry independent of model provider.
- Do not implement real payments, CRM, SMS, kitchen PDFs, production auth, or multi-tenant deployment.
- Do not add polished docs that claim behavior before it exists.

## Current Status

Implementation is advancing by Linear ticket. `PLAN.md` and Linear are the source of truth for wave sequencing; this README describes the behavior currently present in the repository.
