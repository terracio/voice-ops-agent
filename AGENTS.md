# AGENTS.md

This file is the fast onboarding guide for coding agents working on MealPlan VoiceOps.

Read it before changing code. The goal is to preserve the project shape, safety boundaries, and eval discipline while moving quickly.

## Project Thesis

MealPlan VoiceOps is a realtime voice operations agent for a fictional meal-plan company.

The project tests whether `gpt-realtime-2`, inside a production-style operations harness, can safely handle contact-center work where mistakes affect deliveries, payments, and dietary safety.

The main engineering point:

> The model can propose. The application decides.

The model may listen, reason, speak, and request tools. It must never directly mutate operational state.

## Core Safety Invariant

Risky writes must follow this path:

```text
read state
-> create pending ChangeSet
-> validate policy
-> preview before/after delta
-> capture explicit user confirmation
-> create server confirmation record
-> revalidate policy and state_version
-> commit
-> create internal side effects
-> write audit events
```

Do not bypass this flow to make a demo or eval pass.

## Repository Map

```text
src/app/
  Next.js App Router pages and API handlers.

src/features/voice-console/
  Browser demo feature.
  components/ renders the UI.
  hooks/ owns React integration with realtime/evidence polling.
  state/ owns local console state transitions.
  evidence/ formats transcript and tool evidence for display.
  styles/ owns feature CSS.

src/realtime/browser/
  Browser-side WebRTC controller, data-channel parsing, mic constraints, browser realtime events.

src/realtime/config/
  Realtime instructions, realtime tool schemas, out-of-band transcription prompt.

src/realtime/server/
  Server-created Realtime calls, sideband control, session state, tracing metadata.

src/realtime/runner/
  SDK smoke/eval runner, audio streaming, timing, trace capture, runner types.

src/tools/
  Provider-neutral typed tool registry and tool context.

src/domain/
  Schemas, seed data, mock DB, policies, date resolver, ChangeSet lifecycle, side effects.

src/audit/
  Audit event creation and querying.

src/evidence/
  Realtime evidence store and event builders.

src/evals/
  Scripted and realtime eval cases, scorers, reports, audio profiles, artifacts.

docs/
  Architecture, guardrails, eval design, demo walkthrough.
```

## Runtime Boundary

The browser is only the voice and visualization surface.

The browser can:

- capture microphone audio,
- play assistant audio,
- display transcripts, tool events, and status,
- request a Realtime call from the server.

The browser must not:

- receive `OPENAI_API_KEY`,
- execute domain tools,
- write operational state,
- enforce policy,
- decide whether a confirmation is valid.

The server owns:

- Realtime session creation,
- sideband tool execution,
- prompt/tool attachment,
- policy enforcement,
- ChangeSet preview and commit,
- confirmation records,
- audit and evidence capture.

## Hard Policy Rules

Keep these as code-enforced constraints, not prompt-only guidance:

- Never modify allergies.
- Never mark payments as paid.
- Never charge a card.
- Never commit ambiguous date changes.
- Never write without explicit confirmation.
- Never create kitchen deltas before commit.
- Never commit stale or expired ChangeSets.
- Never overwrite customization values without previewing the delta.
- Escalate medical or allergy risk.
- Escalate or clarify uncertain identity.

## Tool Rules

Every operational tool must have:

- Zod input schema,
- Zod output schema,
- typed `ToolResult` return,
- clear risk category,
- audit logging where appropriate,
- tests for successful and blocked paths.

Realtime, scripted evals, and browser sessions must reuse the same tool registry. Do not create a second policy or tool system for one runtime.

## Eval Rules

Scripted evals prove the backend safety boundary without model variability.

Realtime evals test the actual voice agent under audio conditions.

Eval scoring should cover:

- final DB state,
- required tool usage,
- forbidden tool usage,
- hard policy violations,
- confirmation boundary,
- audit completeness,
- transcript/tool/evidence traceability,
- lightweight conversation quality.

Important: realtime transcripts are diagnostic evidence, not operational truth. Do not rely on natural-language transcript text as write authority.

## Required Commands

Keep these working:

```bash
pnpm dev
pnpm test
pnpm lint
pnpm eval
```

Useful focused checks:

```bash
pnpm exec tsc --noEmit
pnpm vitest run tests/voiceConsole.test.ts tests/voiceConsoleTranscript.test.ts
pnpm vitest run tests/realtimeServerControl.test.ts tests/realtimeBrowserSession.test.ts
```

Realtime evals require OpenAI API credits:

```bash
pnpm eval:realtime -- --stage crawl
pnpm eval:realtime -- --stage walk
```

## Implementation Priorities

1. Correctness over cleverness.
2. Small vertical slices over broad abstractions.
3. Domain logic independent of UI.
4. Tool registry independent of model provider.
5. Evals before voice complexity.
6. Tests for every hard policy.
7. Evidence over polished claims.

## File Size Rule

Keep code files at or under 350 lines.

If a file approaches the limit, split by responsibility. Good split points:

- parser vs scorer,
- controller vs state transitions,
- UI component vs hook,
- tool schema vs tool implementation,
- test harness vs assertions.

Docs such as `README.md`, `SPEC.md`, and `PLAN.md` are exempt.

## Do Not Build

Unless explicitly requested, do not add:

- real payments,
- real CRM,
- real WhatsApp/SMS,
- real kitchen PDFs,
- production auth,
- multi-tenant deployment,
- generic agent framework,
- decorative dashboards unrelated to the demo/eval path.

## Documentation Expectations

When changing architecture, update the relevant doc:

- `README.md` for the top-level story and run commands,
- `docs/architecture.md` for runtime boundaries and module map,
- `docs/guardrails.md` for policy, ChangeSet, and confirmation semantics,
- `docs/eval-design.md` for scorer or eval harness changes,
- `docs/demo-script.md` for browser demo flow changes.

Keep docs honest. If evidence is missing or a feature is diagnostic only, say that directly.

## Common Anti-Patterns

- Letting the model authorize itself.
- Adding a prompt rule instead of a code guardrail.
- Creating a runtime-specific tool path.
- Treating realtime transcript text as operational confirmation.
- Hiding a failed policy/tool result behind friendly copy.
- Creating placeholder folders for future work.
- Building a generic framework before one real path works.
- Adding UI trace panels before the underlying evidence is useful.
- Letting generated debug artifacts become product output.

## Before You Finish

For code changes, run the smallest relevant focused test first, then broader validation when practical.

Before committing, check:

- working tree contains only intended files,
- tests/lint/typecheck relevant to the change pass,
- docs still match the current tree,
- no source file exceeds 350 lines,
- no secret or API key is exposed to browser code.
