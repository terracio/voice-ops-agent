# MealPlan VoiceOps — Codex Implementation Tasks

Use this as a sequence of Codex tasks. Do not ask Codex to implement all milestones in one shot.

---

## Task 0 — Repository scaffold

### Prompt for Codex

```text
You are implementing MealPlan VoiceOps.

Create a clean Next.js App Router + TypeScript project foundation using pnpm, Zod, and Vitest.

Requirements:
- Add package.json scripts: dev, test, eval, lint.
- Add src/domain/schema.ts with placeholder exports.
- Add src/domain/seed.ts with placeholder seed loader.
- Add src/evals/runEval.ts that prints a placeholder eval report.
- Add tests/smoke.test.ts.
- Add README.md skeleton.
- Add AGENTS.md coding guidelines if missing.

Do not implement OpenAI Realtime yet.
Do not build a complex UI yet.

Acceptance criteria:
- pnpm install works.
- pnpm dev starts the app.
- pnpm test passes.
- pnpm eval prints a placeholder report.
```

---

## Task 1 — Domain schemas, seed data, and mock DB

### Prompt for Codex

```text
Implement the MealPlan VoiceOps domain model.

Add Zod schemas and TypeScript types for:
- Customer
- Plan
- ServiceDate
- PaymentFollowup
- KitchenExportDelta
- ChangeOperation
- ChangeSet
- Confirmation
- AuditEvent

Add seed data for at least:
- Maya: happy-path customer with Monday/Wednesday/Friday deliveries, peanut allergy, normal spice, failed payment.
- Omar: kitchen cutoff scenario.
- Lina: allergy-risk scenario.
- Duplicate/uncertain identity scenario.

Implement a local mock DB module with:
- resetDb(seedId?: string)
- getCustomer(customer_id)
- findCustomers(query)
- getCustomerState(customer_id)
- saveChangeSet(changeSet)
- getChangeSet(change_set_id)
- updateCustomerState(customer_id, updater)
- appendAuditEvent(event)
- getAuditEvents(run_id)

The DB can be in-memory for now but must be resettable for evals/tests.

Acceptance criteria:
- Zod schemas validate seed data.
- Unit tests cover seed loading and DB reset.
```

---

## Task 2 — Policy engine and ChangeSet service

### Prompt for Codex

```text
Implement the policy engine and ChangeSet lifecycle.

Create src/domain/policies/mealplan.policy.ts with hard policies:
- P001 identity required before writes
- P002 no allergy mutation by agent
- P003 no payment settlement actions
- P004 no ambiguous date writes
- P005 confirmation required before writes
- P006 no kitchen export before commit
- P007 state version must match
- P008 customization overwrites require preview delta
- P009 kitchen cutoff enforcement
- P010 expired ChangeSet cannot commit

Create src/domain/changeSet.ts with:
- createChangeSet
- validateChangeSet
- previewChangeSet
- commitChangeSet

Commit rules:
- Requires explicit Confirmation object.
- Requires expected_state_version match.
- Rejects expired ChangeSet.
- Rejects hard policy blocks.
- Increments customer state_version after successful commit.
- Is idempotent for already committed ChangeSet.

Acceptance criteria:
- Tests prove writes fail without confirmation.
- Tests prove allergy mutation is blocked.
- Tests prove stale state write is blocked.
- Tests prove customization preview includes before/after delta.
```

---

## Task 3 — Typed tools and audit logging

### Prompt for Codex

```text
Implement the typed tool layer.

Create tool modules for:
- lookup_customer
- get_customer_state
- resolve_service_dates
- get_payment_status
- create_change_set
- validate_change_set
- preview_change_set
- commit_change_set
- create_kitchen_export_delta
- create_payment_followup
- escalate_to_human

Each tool must:
- Define Zod input schema.
- Define Zod output schema.
- Return a ToolResult<T>.
- Log audit events where appropriate.
- Enforce policy by calling the policy/changeSet service, not by trusting the model.

Create src/agent/toolRegistry.ts that exports all tools in a model-provider-neutral format.

Acceptance criteria:
- Unit tests cover successful tool calls.
- Unit tests cover blocked tool calls.
- Audit events are created for reads, previews, commits, blocks, side effects, and escalations.
```

---

## Task 4 — Date resolver

### Prompt for Codex

```text
Implement src/domain/dateResolver.ts.

The resolver should convert phrases and requested weekdays into exact customer service dates using:
- customer timezone
- fixed reference date passed by caller
- customer's scheduled delivery days
- next_service_dates in seed state

Handle:
- next week
- tomorrow
- this weekend
- Monday/Tuesday/Wednesday/etc.

Rules:
- If ambiguous, return ambiguous=true and a clarification question.
- If requested day is not scheduled, return is_scheduled_delivery_day=false.
- Do not create write operations for non-scheduled days.

Acceptance criteria:
- Tests cover next week Monday/Tuesday/Wednesday for Maya.
- Tests cover tomorrow not service day.
- Tests cover ambiguous phrasing.
```

---

## Task 5 — Eval runner and first 10 eval cases

### Prompt for Codex

```text
Implement the replay eval system.

Create:
- src/evals/caseSchema.ts
- src/evals/runEval.ts
- src/evals/scoreCase.ts
- src/evals/report.ts
- src/evals/simulatedUser.ts
- scorers for state, tools, policy, audit, and conversation quality

Implement first 10 eval cases:
1. pause_two_days_keep_wednesday
2. multi_intent_payment_customization_pause
3. ambiguous_next_week_delivery_change
4. tomorrow_not_service_day
5. remove_allergy_blocked
6. allergy_small_amounts_escalate
7. payment_mark_paid_forbidden
8. payment_failed_followup_only
9. identity_uncertain_escalate_or_clarify
10. kitchen_cutoff_locked_date

The eval runner can initially use a deterministic mock text agent that calls tools according to the case. The important part is the harness, scoring, and report.

Acceptance criteria:
- pnpm eval runs all 10 cases.
- Report shows pass/fail and diagnostics.
- Report includes final state match, required tools, forbidden tools, policy violations, and audit completeness.
```

---

## Task 6 — Remaining eval cases and pass^k

### Prompt for Codex

```text
Add the remaining 10 eval cases:
11. customization_overwrite_requires_delta
12. conflicting_request_pause_all_keep_friday
13. no_confirmation_no_commit
14. explicit_confirmation_commits
15. correction_before_confirmation
16. stale_state_after_preview
17. kitchen_delta_after_commit_only
18. audit_log_complete_for_blocked_write
19. long_multi_intent_concise_summary
20. payment_plus_pause_multi_intent

Add pass^k / repeated-run support:
- pnpm eval -- --pass-k 3

For mock mode, repeated runs can be deterministic. Leave clear extension points for model-backed variation later.

Acceptance criteria:
- pnpm eval runs 20 cases.
- pnpm eval -- --pass-k 3 runs repeated trials.
- Report includes aggregate metrics.
```

---

## Task 7 — Realtime runner foundation

### Prompt for Codex

```text
Implement the minimal server-side Realtime runner for MealPlan VoiceOps.

Create:
- realtime agent prompt in markdown
- Realtime-compatible tool definition adapter from the existing registry
- server-side Realtime WebSocket runner
- event trace capture
- one clean-audio maya_smoke Crawl case
- pnpm eval:realtime command

Requirements:
- Use OPENAI_API_KEY server-side only.
- Use OPENAI_REALTIME_MODEL with gpt-realtime-2 as the default.
- Send clean test audio to the Realtime session.
- Receive model events and tool calls.
- Execute tool calls through the existing server-side tool executor.
- Capture transcript fragments, tool calls/results, audit events, and final DB state.
- Do not build browser UI in this task.

Acceptance criteria:
- pnpm eval remains no-credentials and scripted by default.
- pnpm eval:realtime -- --case maya_smoke --stage crawl runs when credentials are present.
- Missing credentials produce a clear skipped/blocked result.
- No second tool registry is created.
```

---

## Task 8 — Realtime Crawl evals

### Prompt for Codex

```text
Implement the clean-audio Realtime Crawl eval suite.

Create:
- realtime eval case contract
- deterministic clean audio fixtures or repeatable fixture generation
- Crawl scoring for Realtime traces
- 5-10 Crawl cases

Requirements:
- Focus on routing, policy, exact entity capture, missing information, and unsafe action avoidance.
- Score tool usage, forbidden tool usage, policy blocks, confirmation boundary, audit completeness, final state, and lightweight conversation behavior.
- Include failure categories for perception, turn-taking, tool selection, arguments, policy, confirmation, and state.

Acceptance criteria:
- pnpm eval:realtime -- --stage crawl runs the suite.
- Cases can run individually with --case.
- Reports include raw event trace paths and actionable diagnostics.
```

---

## Task 9 — Browser Realtime demo

### Prompt for Codex

```text
Build the browser Realtime voice demo on top of the already-working Realtime runner and tool bridge.

Create:
- Realtime session route for browser sessions
- ephemeral credential flow
- browser voice controls
- transcript panel
- tool timeline
- audit panel
- preview / state diff panel
- reset controls

Requirements:
- Browser must receive only ephemeral realtime credentials.
- OPENAI_API_KEY must remain server-side.
- Tool calls must execute through server routes or server-side controls.
- Browser code must not mutate the mock DB or own domain write logic.
- UI must not imply a write happened before commit succeeds.

Acceptance criteria:
- User can start/stop a voice session.
- User can speak the main demo scenario.
- Agent previews before writes.
- Agent commits only after explicit server-captured confirmation.
- UI shows transcript, tool calls, audit events, and state diff.
```

---

## Task 10 — Walk/Run evals, docs, and final hardening

### Prompt for Codex

```text
Add realistic Realtime eval stages and finish portfolio documentation.

Create:
- Walk evals with noisy or phone-like single-turn audio
- Run evals with synthetic multi-turn contact-center simulations
- optional OOB transcription debugging hooks
- docs/architecture.md
- docs/guardrails.md
- docs/eval-design.md
- docs/demo-script.md
- docs/known-limitations.md
- README updates

Focus on:
- noisy audio capture
- clarifying instead of guessing
- corrections and partial information
- interruptions
- tool failures
- stale state
- policy blocks
- handoff/escalation
- Unsafe writes
- Missing policy checks
- Incomplete audit logs
- State version bugs
- Unvalidated tool inputs
- UI exposing server secrets
- Eval false positives
- Poor error messages

Make minimal, high-confidence fixes.

Acceptance criteria:
- pnpm test passes.
- pnpm lint passes.
- pnpm eval passes with 0 hard policy violations.
- applicable realtime eval commands pass or are clearly documented as credential-gated.
- No browser code exposes OPENAI_API_KEY.
- README and docs match implementation.
```

---
