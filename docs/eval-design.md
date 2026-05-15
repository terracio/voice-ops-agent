# Eval Design

MealPlan VoiceOps uses evals as evidence, not as decoration.

The project has two active eval layers:

- scripted safety evals for deterministic backend behavior,
- realtime audio evals for actual model behavior under audio conditions.

## Scripted Safety Baseline

Command:

```bash
pnpm eval
pnpm eval -- --mode scripted
pnpm eval -- --pass-k 3
```

This mode does not require OpenAI credentials.

It proves:

- tool schemas validate,
- policy IDs are enforced,
- ChangeSets preview correctly,
- confirmations are required,
- commits are blocked when unsafe,
- final DB state matches expectations,
- side effects are idempotent,
- audit logs are complete.

It does not prove that the model chooses the right tools. It proves the backend safety boundary is enforceable when tools are called.

Reports:

```text
reports/eval-report.json
reports/eval-report.md
```

Golden cases:

```text
src/evals/GOLDEN_CASES.md
src/evals/cases/
```

## Realtime Audio Evals

Command:

```bash
pnpm eval:realtime -- --stage crawl
pnpm eval:realtime -- --stage crawl --case maya_smoke
pnpm eval:realtime -- --stage walk
pnpm eval:realtime -- --stage walk --walk-profile walk_uncertain_noise_v1
```

This mode requires server-side OpenAI credentials.

The runner:

1. loads a realtime eval case,
2. resets the mock DB to the case seed,
3. prepares text or audio input,
4. streams PCM16 audio to the realtime agent,
5. captures realtime events and transcript fragments,
6. executes tool calls through the same registry as production code,
7. records audit and final-state evidence,
8. scores observable behavior,
9. writes reports and audio artifacts.

Realtime reports:

```text
reports/realtime/<stage>/<case>/<run>/
```

Typical artifacts:

```text
report.json
report.md
trace.json
audio/clean_input.wav
audio/clean_input.pcm
audio/profile_input.wav
audio/profile_input.pcm
```

## Crawl, Walk, Run

### Crawl

Clean generated audio. The goal is to check routing, policy behavior, tool usage, and basic confirmation flow.

Current cases:

```text
maya_smoke
missing_identity_asks_clarification
ambiguous_date_asks_clarification
allergy_change_escalates
payment_settlement_forbidden
```

### Walk

Phone-bandwidth and seeded-noise transforms. The goal is to test whether the agent stays safe when capture quality is degraded.

For moderately degraded audio, some cases should preserve the Crawl tool path. For heavily degraded audio, the safer passing behavior can be clarification rather than tool use.

### Run

Planned multi-turn contact-center simulations:

- caller corrections,
- interruptions,
- talk-over,
- tool failures,
- stale state,
- policy blocks,
- human escalation.

## Out-Of-Band Transcription

Out-of-band transcription is diagnostic only.

It can help compare:

- built-in realtime transcript,
- assistant behavior,
- tool arguments,
- final DB state,
- a separate transcript attempt.

It is not treated as operational truth or a scoring oracle because it can diverge from what the realtime model appears to act on, especially under degraded audio.

## Scoring Principle

Realtime evals score observable behavior:

- did the agent call required tools,
- did it avoid forbidden tools,
- did hard policies block unsafe operations,
- did final state match the expected state,
- were audit events complete,
- did the conversation ask for clarification when needed,
- did the trace and artifacts preserve enough evidence to debug failures.
