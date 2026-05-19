# Eval Design

MealPlan VoiceOps treats evals as product evidence.

A voice demo can sound good while still being operationally unsafe. The eval system exists to answer a harder question:

```text
Did the agent use the right tools, respect policy, preserve state, and leave enough evidence to debug what happened?
```

## Design Inspiration

The eval strategy is inspired by two sources.

| Source | What we borrow |
|---|---|
| OpenAI [Realtime Eval Guide](https://developers.openai.com/cookbook/examples/realtime_eval_guide) | Build voice evals progressively through Crawl, Walk, and Run harnesses. Start with simple replay, then add audio realism, then multi-turn behavior. |
| Sierra [`tau2-bench`](https://github.com/sierra-research/tau2-bench) | Structure agent evals around customer-service domains, policies, tools, tasks, user interaction, voice modes, and final-state evidence. |

This repo is not a full τ-bench or tau2-bench implementation. The inspiration is the evaluation shape: domain tools, policy rules, user interactions, final-state checks, audio-native behavior, and repeated evidence that the agent behaved correctly.

## Evaluation Layers

MealPlan VoiceOps has two active eval layers.

| Layer | Purpose | Uses OpenAI? | Main proof |
|---|---|---:|---|
| Scripted safety baseline | Deterministically test tools, policy, ChangeSets, confirmations, side effects, and audit. | No | Backend safety boundary is enforceable. |
| Realtime audio evals | Test the actual realtime voice agent under clean and degraded audio. | Yes | Model behavior, tool use, policy behavior, and evidence capture are inspectable. |

The two layers are complementary. Scripted evals prove the application boundary without model variability. Realtime evals test whether the voice model behaves well inside that boundary when the input is audio and the model has to choose text responses and tool calls.

## Scripted Safety Baseline

Commands:

```bash
pnpm eval
pnpm eval -- --mode scripted
pnpm eval -- --pass-k 3
```

This mode does not require OpenAI credentials and does not call a model.

It proves:

- tool schemas validate,
- required tools are called in the scripted path,
- forbidden tools are rejected,
- policy IDs are enforced,
- ChangeSets preview correctly,
- confirmations are required and server-created,
- commits are blocked when unsafe,
- final DB state matches expectations,
- payment follow-ups and kitchen deltas are idempotent,
- audit logs are complete.

It does not prove that the model chooses the right tools. It proves that if tools are called, the backend guardrails are enforceable without relying on prompt behavior, transcript text, or model cooperation.

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

Scripted scoring covers:

- final DB state,
- required tool usage,
- forbidden tool usage,
- hard policy behavior,
- confirmation boundary,
- audit completeness,
- side-effect idempotency,
- lightweight conversation expectations.

## Realtime Audio Evals

Commands:

```bash
pnpm eval:realtime -- --stage crawl
pnpm eval:realtime -- --stage crawl --case maya_smoke
pnpm eval:realtime -- --stage walk
pnpm eval:realtime -- --stage walk --walk-profile walk_uncertain_noise_v1
pnpm eval:realtime -- --stage crawl --case maya_smoke --oob-transcription
```

This mode requires server-side OpenAI credentials.

The runner:

1. loads a realtime eval case,
2. resets the mock DB to the case seed,
3. synthesizes or prepares the input audio,
4. optionally applies a Walk audio profile,
5. streams PCM16 audio to the realtime agent,
6. captures realtime events and transcript fragments,
7. executes tool calls through the shared registry,
8. records audit and final-state evidence,
9. scores observable behavior,
10. writes reports, traces, and audio artifacts.

Crawl and Walk are reviewer evidence for:

- audio input generation and replay,
- realtime model behavior,
- model-requested tool use,
- policy evidence produced by server tools,
- transcript and tool evidence capture,
- assistant text output and tool output.

Realtime reports are written under:

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

Checked-in sample artifacts are available for reviewers who cannot run realtime evals locally:

```text
docs/examples/realtime-crawl-sample-report.md
docs/examples/realtime-crawl-results.json
```

These samples are illustrative source artifacts, not generated `reports/` output.

## Realtime Audio Replay Configuration

Realtime eval replay is intentionally more controlled than the browser demo.

The browser demo uses WebRTC and the Realtime session's live turn detection. The eval runner disables turn detection and owns the replay boundary: it streams audio in fixed PCM chunks, commits the final chunk, then asks the model to respond.

This is the only path where the application chooses an audio chunk size. In the live browser demo, WebRTC handles audio packetization.

| Setting | Current value | Reason |
|---|---|---|
| Input source | OpenAI TTS generated on demand | Repeatable enough for development while avoiding checked-in audio fixtures for now. |
| TTS model | `gpt-4o-mini-tts` | Produces clean spoken input for Crawl and base Walk audio. |
| Voice | `alloy` | Keeps the eval speaker consistent across cases. |
| Input audio format | PCM16 mono | Matches the runner's streaming path. |
| Sample rate | `24000` Hz | Shared default for generated audio and realtime replay. |
| Chunk duration | `20` ms | Exercises streaming behavior with a stable packet cadence. |
| Chunk size | `960` bytes at 24 kHz PCM16 mono | `24000 samples/sec * 2 bytes/sample * 0.020 sec`. |
| Commit strategy | Commit only the final chunk, then request a response. | Makes single-turn replay boundaries deterministic. |
| Turn detection | `null` in the eval runner | The harness, not VAD, decides when the replayed user turn ends. |
| Input transcription | `gpt-realtime-whisper`, language `en` | Captures diagnostic transcript evidence. |
| Reasoning effort | `low` | Matches the browser demo's default responsiveness profile. |
| Parallel tool calls | `false` | Keeps tool ordering easier to score and audit. |
| Quiet window | `1000` ms | Wait long enough for late events before scoring a turn. |
| Timeout | `20000` ms | Prevents hung realtime runs from blocking local iteration. |

The 20 ms chunk size is not a correctness claim by itself. It is a practical replay cadence that keeps the eval path close to streamed audio instead of sending one large blob.

These eval replay defaults live in `src/realtime/config/runtimeConfig.ts` alongside the browser realtime defaults, so model, voice, chunking, timeout, and Walk-profile tuning stay visible in one place.

## Crawl, Walk, Run

The realtime eval ladder follows the Crawl, Walk, Run pattern from the OpenAI Realtime Eval Guide.

### Crawl

Crawl uses clean generated audio and simple cases.

The goal is to check:

- model routing,
- basic tool selection,
- policy behavior,
- identity handling,
- clarification behavior,
- no unsafe writes,
- evidence capture.

Current cases:

```text
maya_smoke
missing_identity_asks_clarification
ambiguous_date_asks_clarification
allergy_change_escalates
payment_settlement_forbidden
```

These cases intentionally focus on routing and policy boundaries before deeper multi-turn task completion.

### Walk

Walk reuses the Crawl contracts with degraded audio.

Implemented profiles:

| Profile | Transform | Expected behavior |
|---|---|---|
| `walk_phone_noise_v1` | Phone-bandwidth shaping to an 8 kHz target plus seeded white noise at 18 dB SNR. | Robustness check. The agent should usually preserve the Crawl tool path or fail safely. |
| `walk_uncertain_noise_v1` | Phone-bandwidth shaping to an 8 kHz target plus seeded white noise at 10 dB SNR. | Uncertainty check. The agent should prefer clarification over guessing or tool calls. |

Walk is not about making every clean-audio expectation pass under noise. It is about checking whether degraded audio leads to safe behavior.

Both profiles use deterministic seeded noise with seed `1701`. The transformed audio is written back as 24 kHz PCM for runner compatibility, while profile metadata records the phone-bandwidth target and checksums for the clean and transformed inputs.

For uncertain audio, a good result may be:

- ask for a clear repetition,
- avoid guessed identifiers,
- avoid operational inference,
- avoid account-specific tools,
- stay in English and in domain,
- leave state unchanged.

### Run

Run is planned.

Run should move closer to tau2-bench-style contact-center simulation:

- multi-turn customer conversations,
- corrections before confirmation,
- interruptions and talk-over,
- tool failures and retries,
- stale state between preview and commit,
- explicit confirmation turns,
- policy blocks and escalation,
- final-state scoring after a complete task.

The target Run question is:

```text
Can the realtime agent complete a realistic operational task over multiple turns while preserving policy, state, confirmations, and audit evidence?
```

## Current Realtime Scoring Limits

Current Crawl and Walk evals score observable run health, perception transcript presence, turn output, tool selection, tool arguments, policy evidence, confirmation ordering, audit evidence, final state, and lightweight response expectations.

They do not yet fully score:

- assistant audio quality,
- stereo `both.wav` conversation output,
- overlap or interruption metrics,
- barge-in timing,
- full multi-turn Run simulations.

Those are planned Run-era eval dimensions. Today, realtime Crawl and Walk reports should be read as audio-model, tool, policy, transcript, and evidence checks, not as full conversation-quality certification.

## Case Contracts

Realtime cases are YAML contracts in:

```text
src/evals/realtime/cases/
```

Each case defines:

- `case_id`,
- stage,
- seed data,
- optional `reward_basis`,
- input text,
- audio generation settings,
- expected intent,
- required tools,
- forbidden tools,
- expected policy IDs,
- expected final-state behavior,
- response expectations.

The contract is intentionally structured. The scorer should not infer success from a friendly assistant response.

`reward_basis` makes the intended pass/fail basis explicit without changing the raw scorers. Omitted scripted cases default to final state, safety, confirmation, and evidence. Omitted clean Crawl cases default to safety, communication, and evidence, with write-capable Crawl cases adding task and confirmation. Omitted realtime write tasks add final state. Walk degraded or uncertain-audio cases default to safety, communication, and evidence. `ACTION` is available for cases that explicitly want reference-action matching, but it is not part of any default basis.

Reports preserve raw scores and add a grouping layer:

- Primary rewards: task success, final state, safety, confirmation boundary, communication, and evidence.
- Diagnostics: tool path similarity, tool argument validity, perception, turn taking, latency, conversation quality, and cost.

Case pass/fail is based on the selected primary rewards plus diagnostics explicitly selected by `reward_basis`. Tool path similarity remains diagnostic by default and becomes reward-relevant only when `ACTION` is selected. Hard policy failures remain reward failures even if a case basis is narrower. Cost and latency are currently explicit unavailable diagnostics unless reliable metadata and thresholds are captured.

## Why Action Matching Is Diagnostic

MealPlan VoiceOps does not require the model to match one exact reference tool path unless a case opts into `ACTION` in `reward_basis`.

Most cases score the operational outcome:

- final state,
- safety,
- confirmation boundary,
- communication,
- evidence.

Tool path similarity is still recorded because it helps reviewers understand whether the model took the expected route. By default, though, it is diagnostic evidence rather than the main reward.

Some ordering is hard-gated because it is a safety invariant, not because it is a preferred reference path:

- identity before private reads,
- preview before confirmation,
- confirmation before commit,
- no kitchen delta before commit.

Those boundaries protect operational state. A run can vary in harmless intermediate actions, but it cannot skip or reorder those safety gates.

## Scoring Contract

Realtime scoring uses observable evidence.

Current score categories include:

- run health,
- perception,
- turn taking,
- tool selection,
- tool arguments,
- policy evidence,
- confirmation boundary,
- audit evidence,
- final state,
- conversation expectations.

The scorer asks concrete questions:

- Did the run complete?
- Was user audio transcribed at all?
- Did the assistant produce output or tool calls?
- Were required tools called?
- Were forbidden tools avoided?
- Did expected policy IDs appear?
- Did confirmation and commit order respect the boundary?
- Did tool audit references exist in the audit log?
- Did final state remain unchanged when it should?
- Did the assistant clarify, refuse, or escalate when required?

## Transcript Evidence

Realtime transcripts are diagnostic evidence.

They are useful for debugging:

- what the realtime session emitted,
- what the assistant appeared to respond to,
- what arguments the model passed to tools,
- where audio degradation may have affected behavior.

They are not operational truth.

The system must not treat transcript text as enough to mutate state. Writes require structured tool results, policy pass, server-created confirmation records, state-version validation, and audit events.

## Out-of-Band Transcription

Out-of-band transcription is optional and diagnostic.

It can help compare:

- built-in realtime transcript,
- assistant behavior,
- tool arguments,
- final DB state,
- a separate transcription attempt.

It is not a scoring oracle.

Under degraded audio, out-of-band transcription may disagree with the realtime model's apparent behavior. That disagreement is useful evidence, but it does not prove what the model "heard" internally.

Use it to investigate failures, not to authorize writes or automatically override realtime scoring.

## Audio Fixture Policy

Current realtime audio fixtures are generated on demand with OpenAI TTS and marked:

```text
fixture_mode: generated_on_demand
stable_for_gating: false
```

This is intentional for the current stage. These runs are useful for development and review, but they are not yet stable CI-gating artifacts.

Future hardening should add cached PCM fixtures with checksums before realtime evals become a strict gate.

## Gating Policy

Current gating expectations:

- `pnpm test` and `pnpm eval` should be stable local gates.
- `pnpm eval:realtime` requires OpenAI API credits and should be treated as a credential-gated evidence run.
- Crawl and Walk reports should be inspected when behavior changes.
- Checked-in sample Crawl artifacts under `docs/examples/` are reviewer aids and are not CI gates.
- Run evals are planned and should become the main multi-turn behavior proof once implemented.

## Known Limits

- Realtime cases currently emphasize Crawl/Walk routing and policy behavior.
- Confirmed write completion in realtime multi-turn scenarios is planned for Run.
- Audio fixtures are generated/transformed locally and are not yet stable checked-in gates.
- Out-of-band transcription is a debugging aid, not an authority layer.
- Conversation-quality scoring is intentionally lightweight compared with tool, policy, audit, and state scoring.
- Assistant audio quality, stereo conversation output, interruption metrics, barge-in timing, and full multi-turn Run simulations are not yet fully scored.
