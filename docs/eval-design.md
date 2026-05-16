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

The two layers are complementary. Scripted evals prove the application boundary. Realtime evals test whether the voice model behaves well inside that boundary.

## Scripted Safety Baseline

Commands:

```bash
pnpm eval
pnpm eval -- --mode scripted
pnpm eval -- --pass-k 3
```

This mode does not require OpenAI credentials.

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

It does not prove that the model chooses the right tools. It proves that if tools are called, the backend safety boundary is enforceable.

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
| Input transcription | `gpt-4o-mini-transcribe`, language `en` | Captures diagnostic transcript evidence. |
| Reasoning effort | `low` | Matches the browser demo's default responsiveness profile. |
| Parallel tool calls | `false` | Keeps tool ordering easier to score and audit. |
| Quiet window | `1000` ms | Wait long enough for late events before scoring a turn. |
| Timeout | `20000` ms | Prevents hung realtime runs from blocking local iteration. |

The 20 ms chunk size is not a correctness claim by itself. It is a practical replay cadence that keeps the eval path close to streamed audio instead of sending one large blob.

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

## Case Contracts

Realtime cases are YAML contracts in:

```text
src/evals/realtime/cases/
```

Each case defines:

- `case_id`,
- stage,
- seed data,
- input text,
- audio generation settings,
- expected intent,
- required tools,
- forbidden tools,
- expected policy IDs,
- expected final-state behavior,
- response expectations.

The contract is intentionally structured. The scorer should not infer success from a friendly assistant response.

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
- Run evals are planned and should become the main multi-turn behavior proof once implemented.

## Known Limits

- Realtime cases currently emphasize Crawl/Walk routing and policy behavior.
- Confirmed write completion in realtime multi-turn scenarios is planned for Run.
- Audio fixtures are generated/transformed locally and are not yet stable checked-in gates.
- Out-of-band transcription is a debugging aid, not an authority layer.
- Conversation-quality scoring is intentionally lightweight compared with tool, policy, audit, and state scoring.
