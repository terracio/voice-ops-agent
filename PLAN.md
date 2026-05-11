# MealPlan VoiceOps Implementation Plan

Status: draft for first demo milestone, checkpointed for handoff
Source docs: `SPEC.md`, `TASKS.md`, `AGENTS.md`  
Last updated: 2026-05-11

## 1. Objective

Build the first demoable version of MealPlan VoiceOps: a realtime voice operations agent that can safely handle the primary meal-plan scenario end to end. The first proof is the operational backend, scripted runner, and eval harness; the product demo then adds realtime voice as a thin adapter over the same backend.

The first milestone is not a production system. It is a production-shaped vertical slice with enough real architecture that a reviewer can inspect the safety boundary and run repeatable evidence locally.

## 2. Demo Checkpoints

The milestone is split into checkpoints so voice integration cannot block evidence that the safety architecture works.

Checkpoint A: core operations proof

- Waves 0 through 5 complete.
- `pnpm dev` starts a browser debug console for the core workflow.
- `pnpm test` passes policy, ChangeSet, tool, DB, date resolver, and scorer tests.
- `pnpm eval` defaults to scripted mode, runs 20 replay cases without OpenAI credentials, and reports hard policy violations, final state correctness, required and forbidden tool usage, confirmation boundaries, and audit completeness.
- The Maya scenario works through the scripted/debug path:
  - identify customer,
  - read current plan,
  - resolve "next week" into exact dates,
  - identify Tuesday as non-scheduled,
  - preview Monday pause and spice update,
  - read failed payment status,
  - preview payment follow-up task creation without marking payment paid,
  - require server-captured explicit confirmation before commit,
  - create payment follow-up as a committed ChangeSet operation,
  - create kitchen delta internally only after commit,
  - write audit events for reads, preview, confirmation capture, commit, and side effects.

Checkpoint B: realtime voice proof

- Wave 6 complete.
- Realtime voice uses the same server-side tool executor, policy layer, ChangeSet service, mock DB, and audit log as Checkpoint A.
- Browser receives only ephemeral realtime credentials and transcript/timeline payloads.
- The Maya scenario works by voice with preview and explicit confirmation before commit.

Checkpoint C: portfolio proof

- Wave 7 complete.
- README and docs explain the architecture, guardrails, evals, run commands, demo script, and limitations.

## 3. Architecture Position

The core system is a deterministic operations backend. The model is a client of that backend.

The implementation should be layered in this order:

```text
Domain schemas
  -> seed data and resettable mock DB
  -> audit log
  -> policy engine
  -> date resolver
  -> ChangeSet service
  -> typed tools
  -> provider-neutral tool registry
  -> deterministic scripted runner and evals
  -> browser debug console
  -> realtime voice adapter
```

The voice layer must be thin. It should not contain domain rules, write logic, policy decisions, or its own tool definitions. Realtime voice, scripted/debug mode, model-backed eval mode, and eval replay mode should all call the same server-side tool executor and policy-backed services.

## 4. Central Safety Invariant

The implementation must make this invariant mechanically true:

```text
No model output can directly mutate operational state.

Operational write:
  proposed operations
  -> ChangeSet stored with expected_state_version
  -> policy validation
  -> preview with before/after delta
  -> server-created confirmation_id from an explicit user turn
  -> commit-time policy validation
  -> state_version check
  -> commit
  -> internal post-commit side effects
  -> audit log
```

Anything that bypasses this flow is a bug, even if the user-facing answer sounds correct.

Two derived rules matter for implementation:

- All operational writes go through ChangeSets. Payment follow-up task creation is a ChangeSet operation.
- Kitchen export deltas are internal side effects derived after commit. They are not model-facing tools or model-facing ChangeSet operations.

The model cannot manufacture a confirmation object. It may request commit with a `confirmation_id`, but the server must create that confirmation record only after a preview and only from the actual next user turn for the same run, customer, and ChangeSet.

## 5. Policy ID Baseline

Policy results must use stable IDs so tests, audit logs, and eval reports are inspectable:

- `P001_IDENTITY_UNCERTAIN`
- `P002_AMBIGUOUS_DATE`
- `P003_MISSING_PREVIEW`
- `P004_MISSING_CONFIRMATION`
- `P005_STALE_STATE_VERSION`
- `P006_EXPIRED_CHANGESET`
- `P007_ALLERGY_MUTATION_FORBIDDEN`
- `P008_MEDICAL_RISK_ESCALATION_REQUIRED`
- `P009_PAYMENT_SETTLEMENT_FORBIDDEN`
- `P010_KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN`
- `P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA`

## 6. First Demo Scope

In scope:

- One realistic meal-plan domain.
- In-memory resettable DB, not a production database.
- Zod schemas for every domain entity and tool contract.
- A small policy engine with explicit hard policy IDs.
- ChangeSet preview and commit lifecycle.
- Typed tool registry independent of model provider.
- Deterministic scripted runner for evals.
- `scripted`, `model`, and future `voice` eval modes, with `scripted` as the no-credentials default.
- 20 eval cases, starting with scripted runs.
- Minimal browser debug console for the core workflow.
- Realtime voice adapter using server-side API credentials and browser-side ephemeral credentials.
- Documentation and demo script.

Out of scope:

- Real payments, real CRM, real SMS, real kitchen PDFs.
- Production auth or multi-tenant deployment.
- Complex dashboards.
- A generic agent framework before the first real vertical path works.

## 7. Target Runtime Shape

```mermaid
flowchart TD
  User["Customer"]
  UI["Browser UI"]
  Scripted["Scripted Runner / Debug Console"]
  Voice["Realtime Voice Adapter"]
  API["Server API / Tool Executor"]
  Registry["Provider-Neutral Tool Registry"]
  Schemas["Zod Validation"]
  Services["Domain Services"]
  Policy["Policy Engine"]
  Dates["Date Resolver"]
  ChangeSet["ChangeSet Service"]
  DB["Mock Operational DB"]
  SideFx["Internal Side-Effect Services"]
  Audit["Audit Log and Tool Trace"]
  Evals["Replay Eval Runner"]

  User --> UI
  UI --> Scripted
  UI --> Voice
  Scripted --> API
  Voice --> API
  API --> Registry
  Registry --> Schemas
  Registry --> Services
  Services --> Policy
  Services --> Dates
  Services --> ChangeSet
  ChangeSet --> DB
  ChangeSet --> SideFx
  Registry --> Audit
  Services --> Audit
  SideFx --> Audit
  Evals --> Scripted
  Evals --> API
  Evals --> DB
  Evals --> Audit
```

## 8. Implementation Waves

### Wave 0: Repository Foundation

Goal: create a working project shell and preserve the required commands from the start.

Gate to exit:

- `pnpm dev`, `pnpm test`, `pnpm eval`, and `pnpm lint` exist and run.
- No source file starts as an oversized catch-all.
- Placeholder eval output is clearly marked as temporary implementation scaffolding.

Tickets:

#### MVP-001: Next.js TypeScript Scaffold

Scope:

- Add Next.js App Router, TypeScript, pnpm scripts, lint config, Vitest config.
- Add a minimal app page that proves the dev server starts.
- Add `src/domain/schema.ts`, `src/evals/runEval.ts`, and `tests/smoke.test.ts`.

Acceptance:

- `pnpm install` succeeds.
- `pnpm dev` starts.
- `pnpm test` passes.
- `pnpm eval` prints a temporary report.
- `pnpm lint` runs.

Review focus:

- Keep setup minimal.
- Do not implement OpenAI Realtime or UI panels yet.

#### MVP-002: Project Conventions and File Boundaries

Scope:

- Add baseline folder structure for code that is immediately used.
- Document module ownership in comments or README where helpful.
- Ensure `AGENTS.md` constraints are reflected in initial scripts and file layout.

Acceptance:

- No empty future-only folders.
- All created modules are referenced by tests, app, or eval command.
- No source file exceeds 350 lines.

Review focus:

- Avoid over-scaffolding.

### Wave 1: Domain Spine

Goal: create the operational state model before tools or model behavior.

Gate to exit:

- Seed scenarios validate through Zod.
- DB can reset per test/eval run.
- Audit events can be appended and queried by run.

Tickets:

#### MVP-101: Domain Schemas

Scope:

- Implement Zod schemas and inferred types for Customer, Plan, ServiceDate, PaymentFollowup, KitchenExportDelta, ChangeOperation, ChangeSet, Confirmation, AuditEvent, PolicyResult, and ToolResult.

Acceptance:

- Schemas cover the entities in `SPEC.md`.
- Types are exported from a small set of domain modules.
- Tests validate representative valid and invalid payloads.

Review focus:

- Prefer explicit discriminated unions for operations.
- Keep schema files readable and split before they get large.

#### MVP-102: Seed Scenarios

Scope:

- Implement seed data for Maya, Omar, Lina, and duplicate/uncertain identity.
- Include next service dates and payment details needed by first evals.

Acceptance:

- Seed data validates with Zod.
- Maya has Monday, Wednesday, Friday deliveries starting 2026-05-18.
- Maya has failed payment and normal spice.
- Omar covers a locked kitchen cutoff.
- Lina covers allergy risk.
- Duplicate identity data forces clarification or escalation.

Review focus:

- Dates must match the fixed eval reference date of 2026-05-11.

#### MVP-103: Resettable Mock DB

Scope:

- Implement in-memory repository with `resetDb`, `findCustomers`, `getCustomer`, `getCustomerState`, `saveChangeSet`, `getChangeSet`, `updateCustomerState`, `appendAuditEvent`, and audit query helpers.

Acceptance:

- DB resets between tests and eval cases.
- State version is persisted and incrementable.
- ChangeSets and side effects are stored separately from customer state.
- Tests cover reset isolation and read/update paths.

Review focus:

- No hidden singleton state that leaks across eval cases without reset.

#### MVP-104: Audit Log Foundation

Scope:

- Implement audit event creation helpers and audit event types.
- Support run-scoped audit logs.

Acceptance:

- Read, proposed change, preview, confirmation, commit, block, side effect, and escalation event types exist.
- Tests prove event append and query order.

Review focus:

- Audit should record policy decisions and tool names, not just free text.

### Wave 2: Policy, Dates, and ChangeSets

Goal: make the safety boundary work without any model or UI.

Gate to exit:

- Hard policies are enforced by service tests.
- ChangeSet commit fails without confirmation, on stale state, on ambiguity, and on hard policy violations.
- Preview produces user-visible before/after deltas.

Tickets:

#### MVP-201: Policy Engine

Scope:

- Implement `mealplan.policy.ts` with `P001_IDENTITY_UNCERTAIN` through `P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA`.
- Return structured `PolicyResult` values with stable policy IDs.

Acceptance:

- Tests cover every hard policy in allowed and blocked cases.
- Allergy mutation blocks and escalates.
- Payment settlement actions are impossible to express or blocked if attempted.
- Kitchen delta before commit is blocked internally and is not exposed as a model-facing operation.

Review focus:

- Policies should inspect structured operations, not natural-language summaries.

#### MVP-202: Date Resolver

Scope:

- Implement deterministic date resolution using customer timezone, fixed reference date, delivery days, and next service dates.
- Handle next week, tomorrow, this weekend, and named weekdays for first evals.

Acceptance:

- Tests cover Maya next week Monday, Tuesday, Wednesday.
- Non-scheduled days are returned as non-actionable.
- Ambiguous phrases return `ambiguous=true` and a clarification question.
- Ambiguous dates cannot be converted into write operations.

Review focus:

- Keep date resolution deterministic for evals.

#### MVP-203: ChangeSet Lifecycle

Scope:

- Implement create, validate, preview, server confirmation capture, commit, expire, and idempotent committed read behavior.
- Store expected state version and expiry.

Acceptance:

- Preview does not mutate operational state.
- Commit accepts `confirmation_id`, not raw confirmation text or a model-created confirmation object.
- Confirmation records are server-created for the same run, customer, and ChangeSet after preview.
- A model cannot commit by inventing a confirmation object.
- Commit checks current state version against expected state version.
- Expired ChangeSet cannot commit.
- Customization overwrite preview includes before and after values.
- Commit increments customer state version once.
- Repeated commit of an already committed ChangeSet is idempotent.

Review focus:

- Commit-time validation must not trust earlier validation.

#### MVP-204: Side-Effect Services

Scope:

- Implement internal kitchen export delta creation and idempotent materialization for payment follow-up operations.
- Enforce side-effect eligibility in code, not UI or model instructions.

Acceptance:

- Payment follow-up can only be created by a committed `create_payment_followup` ChangeSet operation for failed, past_due, or unknown status.
- Payment status is never changed to paid.
- Kitchen delta can only be created internally after a committed ChangeSet affects meal operations.
- Repeated commit does not create duplicate payment follow-ups or kitchen deltas.
- Side effects use idempotency keys derived from `change_set_id` plus operation identity.
- Side effects append audit events.

Review focus:

- Side effects should be mock internal records only.

### Wave 3: Typed Tools and Agent Contracts

Goal: expose the operational engine through typed tools that any model adapter can use.

Gate to exit:

- Every tool has Zod input schema, Zod output schema, typed `ToolResult`, risk metadata, and tests.
- Tool registry is provider-neutral.
- Blocked tool calls produce structured errors and audit events where appropriate.

Tickets:

#### MVP-301: Tool Contract Types and Registry Shape

Scope:

- Define common tool type, risk levels, `ToolResult`, and registry metadata.
- Add a registry export that is independent of OpenAI-specific formats.
- Define hidden run context for tool execution: `run_id`, `session_id`, actor, current user turn ID, last user message, and identity status.

Acceptance:

- Tools can be executed directly by tests and eval runner.
- Provider adapter can map registry tools later without changing domain tools.
- The model supplies business arguments only; server context is injected by the tool executor.

Review focus:

- Avoid coupling tool definitions to Realtime transport.

#### MVP-302: Read and Planning Tools

Scope:

- Implement `lookup_customer`, `get_customer_state`, `resolve_service_dates`, and `get_payment_status`.

Acceptance:

- Inputs and outputs validate through Zod.
- Reads log audit events.
- Identity uncertainty is explicit and blocks later writes.
- Payment tool exposes allowed and forbidden actions.

Review focus:

- Reads should not leak full customer state before identity is resolved.

#### MVP-303: ChangeSet Tools

Scope:

- Implement `create_change_set`, `validate_change_set`, `preview_change_set`, `capture_confirmation`, and `commit_change_set`.

Acceptance:

- Tools call ChangeSet and policy services.
- No write occurs before explicit confirmation.
- `commit_change_set` accepts `change_set_id` and `confirmation_id`, not raw confirmation text.
- Blocked changes return policy IDs.
- Preview includes non-actionable requested items.

Review focus:

- Tool implementations should be thin adapters over domain services.

#### MVP-304: Escalation Tool and Internal Side-Effect Contract

Scope:

- Implement `escalate_to_human`.
- Ensure payment follow-up is expressible only as a ChangeSet operation, not a standalone write tool.
- Ensure kitchen export delta creation is internal-only after commit and absent from the model-facing registry.

Acceptance:

- Model-facing tools do not include `create_kitchen_export_delta`.
- Model-facing tools do not include standalone `create_payment_followup`.
- Kitchen delta before commit is blocked by policy and service checks.
- Payment follow-up does not change payment status.
- Allergy and medical risk escalations are audit logged.

Review focus:

- Escalation is allowed for risk, but it must still be logged.

#### MVP-305: Agent Instructions

Scope:

- Add concise agent instructions that describe allowed behavior, prohibited behavior, confirmation language, and tool use.

Acceptance:

- Instructions tell the model to use tools for state.
- Instructions explicitly prohibit payment settlement and allergy updates.
- Instructions state that the agent cannot claim writes unless commit succeeds.

Review focus:

- Instructions support safety, but correctness must still live in code.

### Wave 4: Replay Evals and Scripted Runner

Goal: prove the operational workflow before adding voice. The scripted runner is an engineering harness and debug surface, not the product experience.

Gate to exit:

- `pnpm eval` runs 20 cases.
- Report includes state, tools, policy, confirmation, audit, and conversation checks.
- Hard policy violations are zero for the deterministic runner.
- `pnpm eval -- --mode scripted` is the default and requires no OpenAI key.
- `pnpm eval -- --mode model` is planned as a model-backed extension and must require a server-side OpenAI key.

Tickets:

#### MVP-401: Eval Harness

Scope:

- Implement eval case schema, runner, report generator, and machine-readable report output.

Acceptance:

- Cases can reset DB by seed ID.
- Runner writes terminal summary and report files.
- Report includes failed case diagnostics.

Review focus:

- Eval failures should be actionable, not just pass/fail.

#### MVP-402: Deterministic Scripted Runner

Scope:

- Implement a scripted runner that follows case scripts and calls the real tools.
- Capture transcript, tool calls, audit events, and final state.

Acceptance:

- Scripted mode does not require OpenAI credentials.
- Runner exercises the actual registry and policies.
- Transcript supports confirmation and correction turns.

Review focus:

- The runner can be scripted, but tool effects must be real.

#### MVP-403: First 10 Eval Cases

Scope:

- Implement cases 1 through 10 from `SPEC.md`.

Acceptance:

- Happy path, payment boundary, allergy risk, identity uncertainty, ambiguity, and kitchen cutoff are covered.
- `pnpm eval` runs these cases.

Review focus:

- Expected final states should be specific enough to catch false positives.

#### MVP-404: Remaining 10 Eval Cases and pass^k

Scope:

- Implement cases 11 through 20.
- Add `pnpm eval -- --pass-k 3`.
- Add `--mode scripted` explicitly and leave `--mode model` as a clear extension point.

Acceptance:

- All 20 cases run.
- Repeated runs aggregate metrics.
- Mock mode can be deterministic but leaves a clear model-backed extension point.
- README and eval output state that scripted evals verify the operational safety boundary, while model evals verify agent/tool-calling behavior.

Review focus:

- Do not hide deterministic limitations in polished prose.

#### MVP-405: Scorers

Scope:

- Implement state, tool, policy, audit, and lightweight conversation scorers.

Acceptance:

- Scorers detect missing confirmation, forbidden tools, stale commits, missing audit events, and unsafe final state.
- Tests cover scorer false-positive risks.

Review focus:

- The eval suite should fail if a write is correct but audit is missing.

### Wave 5: Core Workflow Debug Console

Goal: make the core workflow inspectable before voice and expose operational evidence in the UI. This is a debug console for the backend, not the final product demo.

Gate to exit:

- Main demo request works through the scripted/debug path.
- UI shows transcript, tool calls, preview/state diff, audit events, and reset controls.
- Confirmation flow captures a server-created confirmation record from the next user turn.

Tickets:

#### MVP-501: Demo API and App State

Scope:

- Add API/server actions or local route handlers for resetting demo state and sending scripted/debug messages through the server-side session.
- Keep server-side operational state out of browser-only code.

Acceptance:

- Browser can load Maya scenario.
- Browser can reset state.
- Browser can submit a user message and receive transcript/tool/audit/diff payloads.
- Browser code never mutates the mock DB directly.

Review focus:

- Avoid duplicating domain logic in UI handlers.

#### MVP-502: Transcript and Confirmation UI

Scope:

- Build minimal transcript and debug input flow.
- Support explicit confirmation turns that the server converts into confirmation records.

Acceptance:

- User can type the main demo request.
- Assistant previews changes and asks for confirmation.
- User can confirm; server captures confirmation and commit uses `confirmation_id`.

Review focus:

- The UI should not imply a write happened before commit result exists.

#### MVP-503: Tool Timeline, Audit, and Diff Panels

Scope:

- Display tool calls, risk levels, policy results, audit events, and before/after diff.

Acceptance:

- Preview shows actionable and non-actionable items.
- Audit events are displayed in order.
- Tool timeline links blocked actions to policy IDs where available.

Review focus:

- These panels should reflect real records, not separate UI summaries.

#### MVP-504: Eval Summary in UI

Scope:

- Add a small link or panel for latest eval status, without building a dashboard.

Acceptance:

- UI can show last eval report summary if available.
- Missing report is handled plainly.

Review focus:

- Keep this small. Eval value lives in `pnpm eval`.

### Wave 6: Realtime Voice Adapter

Goal: add voice without weakening the already-tested operational boundary.

Gate to exit:

- Browser receives only ephemeral realtime credentials.
- Realtime session uses the same registry and policy-backed tools.
- Main Maya demo works by voice with preview and explicit confirmation before commit.
- Realtime tool calls execute through server routes or server-side controls only.

Tickets:

#### MVP-601: Server-Side Realtime Session Route

Scope:

- Add `POST /api/realtime/session`.
- Keep `OPENAI_API_KEY` server-side only.
- Return only ephemeral browser credentials and model/session metadata.

Acceptance:

- Missing API key returns a clear server error.
- Browser bundle does not include `OPENAI_API_KEY`.
- Browser receives no domain write capability beyond the realtime session bridge.
- Route is covered by a focused test where practical.

Review focus:

- Verify current official OpenAI Realtime docs during implementation before final API wiring.

#### MVP-602: Realtime Client Controls

Scope:

- Add start, stop, mute, reset, and status controls.
- Show live and final transcript where available.

Acceptance:

- User can start and stop a session.
- UI states distinguish disconnected, connecting, listening, thinking, speaking, tool running, and waiting for confirmation.

Review focus:

- Voice transport should not own business state.

#### MVP-603: Realtime Tool Bridge

Scope:

- Adapt provider-neutral tools into realtime session tool definitions through the server-side tool executor.
- Feed tool call results back into the UI timeline and audit panels.

Acceptance:

- Realtime model can call the same server-side tools as scripted/debug mode.
- Tool inputs and outputs validate.
- Blocked operations return structured tool errors.
- No mock DB mutation or domain write logic runs in browser code.

Review focus:

- Do not create a second tool registry for voice.
- Keep Realtime transcript useful for UI/debugging, but do not rely on transcript text for operational correctness.

#### MVP-604: Voice Demo QA

Scope:

- Exercise the full main scenario by voice.
- Document the demo script and known rough edges.

Acceptance:

- Agent previews before commit.
- Agent commits only after explicit confirmation.
- Payment follow-up happens through a committed ChangeSet operation.
- Kitchen delta is created internally only after the committed ChangeSet affects meals.
- Audit log matches the voice interaction.

Review focus:

- Any voice transcript limitations should be documented honestly.

### Wave 7: Documentation, Hardening, and Final Review

Goal: make the demo understandable, inspectable, and credible.

Gate to exit:

- README explains the project in under 60 seconds.
- Docs match implementation.
- Final review finds no known unsafe write path.

Tickets:

#### MVP-701: README

Scope:

- Explain what this is, why it matters, architecture, safety boundary, evals, local run commands, demo scenario, tool list, policy list, limitations, and future hardening.

Acceptance:

- A reviewer can run the project from README alone.
- README leads with evidence: eval report and safety boundary.

Review focus:

- Avoid claims that are not backed by implemented behavior.

#### MVP-702: Supporting Docs

Scope:

- Add `docs/architecture.md`, `docs/guardrails.md`, `docs/eval-design.md`, `docs/demo-script.md`, and `docs/known-limitations.md`.

Acceptance:

- Docs explain ChangeSets, guardrails, eval scoring, and demo flow.
- Known limitations are explicit.

Review focus:

- Keep docs synchronized with code names and commands.

#### MVP-703: Final Safety Review

Scope:

- Review unsafe writes, missing policy checks, incomplete audit logs, state version bugs, unvalidated tool inputs, UI secret exposure, eval false positives, and poor error messages.

Acceptance:

- `pnpm test` passes.
- `pnpm eval` passes with zero hard policy violations.
- Browser code does not expose `OPENAI_API_KEY`.
- No kitchen delta can be created before commit.
- No write can commit without server-captured explicit confirmation.

Review focus:

- Findings first, fixes minimal and high-confidence.

## 9. Handoff Strategy

Use handoffs only after the interface contracts for a wave are clear. Early work should be serialized through the domain spine, then parallelized by disjoint write scope.

Good parallel handoffs after Wave 0:

- Domain schemas and seed data.
- Mock DB and audit foundation.
- Eval case schema draft.

Good parallel handoffs after Wave 2:

- Individual tool groups.
- Eval scorer groups.
- UI panels that consume already-defined records.

Avoid handoffs for:

- The central ChangeSet commit path until the policy model is settled.
- Realtime voice until scripted runner and tool registry are stable.
- Large cross-cutting refactors without a narrow acceptance test.

Each handoff should include:

- Ticket ID.
- Owned files or module boundary.
- Dependencies.
- Acceptance commands.
- Safety review focus.
- Explicit note not to revert unrelated work.

## 10. Recommended Build Order

1. Wave 0 establishes commands and project shape.
2. Wave 1 creates schemas, seeds, DB, and audit.
3. Wave 2 implements policies, date resolution, ChangeSets, and side effects.
4. Wave 3 exposes everything through typed tools.
5. Wave 4 proves behavior through scripted runner and evals.
6. Wave 5 makes the core workflow inspectable in the browser debug console.
7. Wave 6 adds realtime voice as an adapter.
8. Wave 7 hardens and documents.

This order is deliberate: evals and scripted/debug mode must prove the operational boundary before voice complexity is introduced.

## 11. Milestone Definition of Done

Checkpoint A is done when:

- `pnpm dev`, `pnpm test`, `pnpm eval`, and `pnpm lint` run successfully.
- All hard policy tests pass.
- `pnpm eval` runs 20 cases with zero hard policy violations.
- Main demo scenario works in scripted/debug mode.
- Write operations require preview and server-captured explicit confirmation.
- Stale and expired ChangeSets cannot commit.
- Allergy and medical-risk requests escalate without mutating allergy state.
- Payment status is never marked paid and cards are never charged.
- Payment follow-ups are created only by committed ChangeSet operations.
- Kitchen deltas are created internally only after committed ChangeSets.
- Audit logs capture reads, previews, confirmations, commits, blocked writes, escalations, and side effects.

Checkpoint B is done when:

- Main demo scenario works by realtime voice over the same backend.
- Browser receives only ephemeral realtime credentials.
- Realtime tools execute server-side and reuse the same registry, policies, ChangeSet service, DB, and audit log.

Checkpoint C is done when:

- README and docs match the implemented behavior.

## 12. Immediate Next Step

Continue Wave 1 with `MVP-102` and `MVP-104` as parallel handoffs. Start `MVP-103` after `MVP-102` lands, or coordinate it in the same branch if the seed API is already stable. Do not start realtime voice or rich UI until the domain, policy, ChangeSet, and eval foundations are working.
