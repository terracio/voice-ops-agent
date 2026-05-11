# MealPlan VoiceOps

MealPlan VoiceOps is a production-shaped realtime voice operations agent for a fictional meal-plan subscription business.

This repo is intentionally early. The current implementation is the Wave 0 scaffold: a minimal Next.js + TypeScript app, Vitest smoke test, placeholder domain schema, and temporary eval runner. The operational domain, tools, policies, ChangeSets, audit logs, and replay evals are implemented in the next waves.

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
- `src/domain/` owns domain schemas and pure domain helpers.
- `src/evals/` owns the eval command entrypoint.
- `tests/` owns Vitest tests.

Do not add empty placeholder folders for future slices. Add a folder only when the ticket introduces a file that is referenced by the app, tests, eval runner, or another implemented module.

## Safety Boundary

The project invariant is:

```text
ChangeSet -> preview -> explicit user confirmation -> policy validation -> commit -> audit
```

The model must never directly mutate operational state. Runtime correctness must live in structured code: Zod schemas, policy checks, ChangeSet services, typed tools, and eval scorers.

## Implementation Rules

- Keep source files under 350 lines.
- Prefer small vertical slices over broad scaffolding.
- Keep domain logic independent of UI.
- Keep the tool registry independent of model provider.
- Do not implement real payments, CRM, SMS, kitchen PDFs, production auth, or multi-tenant deployment.
- Do not add polished docs that claim behavior before it exists.

## Current Status

Wave 0 is in progress:

- `MVP-001` is complete.
- `MVP-002` establishes these conventions.

Next implementation work should start with the Wave 1 domain spine: schemas, deterministic seed scenarios, resettable mock DB, and audit log foundation.
