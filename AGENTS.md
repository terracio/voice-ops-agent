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
.
├── src/
│   ├── app/
│   │   └── Next.js App Router pages and API handlers.
│   ├── features/
│   │   └── voice-console/
│   │       ├── components/  UI rendering and icons.
│   │       ├── hooks/       React integration with realtime and evidence polling.
│   │       ├── state/       Local console state transitions.
│   │       ├── evidence/    Transcript and tool-evidence formatting.
│   │       └── styles/      Feature CSS.
│   ├── realtime/
│   │   ├── browser/         WebRTC controller, data channel, mic constraints.
│   │   ├── config/          Realtime instructions, runtime defaults, tools, transcription prompt.
│   │   ├── server/          Realtime call setup, sideband control, tracing.
│   │   └── runner/          Smoke/eval runner, audio streaming, traces.
│   ├── tools/               Provider-neutral typed tool registry.
│   ├── domain/              Schemas, mock DB, policies, dates, ChangeSets.
│   ├── audit/               Audit event creation and querying.
│   ├── evidence/            Realtime evidence store and event builders.
│   └── evals/               Scripted/realtime cases, scorers, reports, audio.
├── docs/                    Architecture, guardrails, eval design, demo script.
├── tests/                   Unit, integration, UI, realtime, and eval tests.
├── README.md                Reviewer-facing overview and run commands.
├── SPEC.md                  Product and system requirements.
└── AGENTS.md                Coding-agent onboarding and working rules.
```

## Current Stack

Use the existing stack unless the user explicitly asks for a migration.

| Area | Stack |
|---|---|
| Language | TypeScript |
| Web app | Next.js App Router, React |
| Live realtime voice | OpenAI [Realtime API](https://developers.openai.com/api/docs/guides/realtime) with `gpt-realtime-2` |
| Browser transport | [WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc) plus Realtime data-channel events |
| Server control | Realtime [sideband WebSocket](https://developers.openai.com/api/docs/guides/realtime-server-controls) using server credentials |
| Realtime eval runner | [`@openai/agents`](https://developers.openai.com/api/docs/guides/voice-agents) realtime `RealtimeAgent` / `RealtimeSession` for smoke/eval harnesses only |
| Tool contracts | Zod schemas and typed `ToolResult` envelopes |
| Realtime cases | YAML case definitions |
| Tests | Vitest |
| Scripts | `tsx` TypeScript entrypoints |
| Package manager | pnpm |

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
- Never create date-changing ChangeSets without trusted server-generated date-resolution evidence.
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

Project docs such as `README.md`, `SPEC.md`, `AGENTS.md`, and internal planning docs are exempt.

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
