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
  -> browser Realtime demo
  -> noisy Walk evals
  -> multi-turn Run evals
```

The browser UI comes after the server-side Realtime runner can start a session, send audio, receive events and tool calls, execute tools through the existing registry, and produce eval-compatible traces. `pnpm eval:realtime` is the planned credential-gated command for this path; `pnpm eval` remains the no-credentials scripted safety baseline.

### Realtime Runner Function Map

The current runner is a smoke foundation, not the full realtime eval suite yet.

- `runRealtimeAgentSmoke`: credential-gated entrypoint. It resolves the model/key, builds a realtime agent, connects a server-side SDK WebSocket session, sends one audio or text fixture, waits for a terminal event, closes the session, and returns raw events plus eval-friendly summaries.
- `createMealPlanRealtimeAgent`: builds the `RealtimeAgent` from the source-controlled realtime prompt and SDK-compatible tools.
- `createRealtimeAgentSdkTools`: adapts the provider-neutral MealPlan tools into SDK function tools. Tool execution still goes through the existing registry, schemas, policies, ChangeSets, and audit layer.
- `createRealtimeTraceCollector`: captures sanitized transport events, transcript fragments, SDK tool calls/results, audit IDs, and final DB state snapshots for later scoring.
- `createRealtimeSessionFactoryOptions`: defines the server-side session configuration: `gpt-realtime-2`, WebSocket transport, low reasoning, PCM input, transcription, and no automatic turn detection for deterministic fixtures.
- `createSdkRealtimeSession`: the only place that instantiates the OpenAI SDK `RealtimeSession`. It is wrapped behind `RealtimeSessionLike` so tests and future fallback transports can use the same runner boundary.
- `loadOpenAIServerEnv` and `resolveOpenAIRealtimeCredentials`: load local server credentials and skip cleanly when no key is present.
- `streamPcm16AudioToRealtimeSession`: splits PCM16 input into fixed chunks, commits once at the end, and requests the model response.
- `src/evals/realtime/cases/maya_smoke.yaml`: defines the first clean-audio Crawl smoke case. The eval command turns this text into PCM with OpenAI TTS, streams it in 20 ms chunks, and writes the trace report.
- `createPcm16Silence`: creates a fallback tiny synthetic audio fixture for direct runner tests.
- `sanitizeRealtimePayload`: keeps traces useful without logging raw audio/base64 payloads.

`pnpm eval:realtime -- --case maya_smoke --stage crawl` currently calls the real realtime agent when `OPENAI_API_KEY` is present and writes timestamped JSON/Markdown reports under `reports/realtime/<stage>/<case>/<run>/` with trace, transcript, tool-call, audit, and final-state evidence. It does not yet grade Crawl pass/fail behavior; that scoring belongs to the next realtime eval tickets.

## Implementation Rules

- Keep source files under 350 lines.
- Prefer small vertical slices over broad scaffolding.
- Keep domain logic independent of UI.
- Keep the tool registry independent of model provider.
- Do not implement real payments, CRM, SMS, kitchen PDFs, production auth, or multi-tenant deployment.
- Do not add polished docs that claim behavior before it exists.

## Current Status

Implementation is advancing by Linear ticket. `PLAN.md` and Linear are the source of truth for wave sequencing; this README describes the behavior currently present in the repository.
