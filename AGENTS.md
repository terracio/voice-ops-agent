# AGENTS.md — MealPlan VoiceOps Coding Guidelines

## Project goal

Build MealPlan VoiceOps: a production-shaped realtime voice operations agent for a meal-plan subscription business.

The system must demonstrate safe model-to-operations architecture:

- typed tools,
- policy enforcement,
- ChangeSet previews,
- explicit confirmation before writes,
- audit logs,
- replay evals.

## Core architecture rule

The model must never directly mutate operational state.

All writes must pass through:

```text
ChangeSet → preview → explicit user confirmation → policy validation → commit → audit
```

## Implementation priorities

1. Correctness over cleverness.
2. Small vertical slice over broad feature set.
3. Domain logic independent of UI.
4. Tool registry independent of model provider.
5. Evals before voice complexity.
6. Tests for every hard policy.

## Do not implement

- Real payments.
- Real CRM.
- Real WhatsApp/SMS.
- Real kitchen PDFs.
- Production auth.
- Multi-tenant deployment.
- Fancy dashboards.

## Required commands

Keep these working:

```bash
pnpm dev
pnpm test
pnpm eval
pnpm lint
```

## Safety rules

Hard policies:

- Never modify allergies.
- Never mark payments as paid.
- Never charge a card.
- Never commit ambiguous date changes.
- Never write without explicit confirmation.
- Never create kitchen deltas before commit.
- Never commit stale ChangeSets.
- Never overwrite customization values without previewing the delta.
- Escalate medical/allergy risk.
- Escalate or clarify uncertain identity.

## Tooling rules

Every tool must have:

- Zod input schema.
- Zod output schema.
- typed ToolResult return.
- audit logging where appropriate.
- tests for success and blocked cases.

## Eval rules

The eval runner must score:

- final DB state,
- required tool usage,
- forbidden tool usage,
- hard policy violations,
- confirmation boundary,
- audit completeness,
- lightweight conversation quality.

## OpenAI API rules

- `OPENAI_API_KEY` must stay server-side.
- Browser may only receive ephemeral realtime credentials.
- Realtime voice must reuse the same tool registry and policy layer as text mode.
- Do not rely on natural-language model output for operational correctness.

## Documentation rules

README should explain:

- what the system does,
- why it is production-shaped,
- how ChangeSets work,
- how guardrails work,
- how evals work,
- how to run locally,
- known limitations.

## Anti-Patterns

- No code source file over 350 lines. (excluding files like SPEC.md, PLAN.md, COMPONENTS.md, ...) <ai_tag="important">
- No empty placeholder folders for future slices.
- Do not build a generic framework before one real run works.
- Do not split into many tickets before the vertical path exists.
- Do not use “placeholder final output” as a milestone unless clearly throwaway.
- Do not let debug artifacts become user-facing output.
- Do not hide missing evidence behind polished prose.
- Do not treat source unavailability as a product result.
- Do not build UI trace panels before the final output is useful.
