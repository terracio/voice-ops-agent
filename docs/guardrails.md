# Guardrails

MealPlan VoiceOps treats guardrails as application behavior, not just prompt instructions.

The central invariant is:

```text
The model may request tools. It cannot directly mutate operational state.
```

If prompt guidance and application policy ever disagree, application policy wins.

## Guardrail Layers

The safety boundary is enforced in layers.

| Layer | What it protects |
|---|---|
| Tool schemas | Reject malformed tool input and output. |
| Tool context | Requires confirmed customer identity and owned ChangeSets before account-specific work. |
| Policy supervisor | Applies stable hard-policy checks in deterministic code. |
| ChangeSet lifecycle | Turns risky writes into previewed, confirmable, revalidated operations. |
| Confirmation records | Prevent the model from authorizing writes by assertion. |
| Side-effect materialization | Creates internal operational work only after commit, with idempotency keys. |
| Audit and evals | Preserve evidence that the guardrails ran and explain failures. |

The model can choose to request a tool. It cannot choose whether a policy passes.

## ChangeSet Lifecycle

Every risky write must pass through this lifecycle:

```text
read current state
-> create ChangeSet with expected_state_version
-> validate policy at preview time
-> derive before/after preview from server state
-> show preview to caller
-> capture explicit server-created confirmation
-> validate policy at commit time
-> verify state_version is still current
-> commit operations
-> create internal post-commit side effects
-> write audit events
```

Until commit succeeds, customer operational state does not change.

ChangeSets are deliberately boring: they are pending operational changes with expected state, expiry, policy results, preview timestamps, and optional confirmation linkage.

## Confirmation Boundary

Confirmation is server-created.

The model cannot create write authority with raw tool input such as:

```json
{ "confirmed": true }
```

Instead, `capture_confirmation` may create a confirmation record only after a previewed ChangeSet and an explicit current user turn. That record binds confirmation to:

- the same run/session context,
- the same customer,
- the same ChangeSet,
- the same preview timestamp,
- a confirmation time after the preview,
- the source user turn that supplied the confirmation.

`commit_change_set` consumes the server-created `confirmation_id`. It does not accept a model claim that the user approved the write.

The confirmation record stores a transcript excerpt for evidence. That transcript text is diagnostic evidence, not general write authority.
Before the server creates that record, it runs the same local deterministic confirmation-intent classifier for every source, including Realtime turns. Only `confirm` captures; deny, correction, uncertain, mixed-language, long, noisy, or ambiguous text fails closed. Successful records include the classifier evidence under `confirmation_intent`.

## Identity Boundary

Customer lookup is candidate discovery, not authentication.

`lookup_customer` may find one likely customer, but that result only creates a pending identity candidate in hidden server context. It must not set `identity_status: "confirmed"` by itself.

Before private reads, payment reads, ChangeSet tools, or customer-attached escalation, the caller must explicitly confirm the pending candidate in a later user turn. Only then may `confirm_customer_identity` promote the hidden session context to the confirmed customer.

The identity boundary blocks:

- direct private reads after lookup alone,
- same-turn identity confirmation from the lookup utterance,
- model-supplied hidden identity fields,
- confirmation of a customer that does not match the pending candidate.

## Stable Policy IDs

Policy IDs are stable so tests, evals, audit logs, and UI evidence can inspect the exact reason an action was blocked or escalated.

| Policy ID | Meaning | Effect |
|---|---|---|
| `P001_IDENTITY_UNCERTAIN` | Customer identity is not sufficiently certain. | Escalate or clarify before writes. |
| `P002_AMBIGUOUS_DATE` | A date-based write does not resolve to exact service dates. | Block write. |
| `P003_MISSING_PREVIEW` | Commit was attempted without a previewed ChangeSet. | Block commit. |
| `P004_MISSING_CONFIRMATION` | Commit lacks matching server-created confirmation. | Block commit. |
| `P005_STALE_STATE_VERSION` | Current state differs from previewed state. | Block commit. |
| `P006_EXPIRED_CHANGESET` | The ChangeSet expired before commit. | Block commit. |
| `P007_ALLERGY_MUTATION_FORBIDDEN` | Allergy records would be added, removed, or weakened. | Escalate. |
| `P008_MEDICAL_RISK_ESCALATION_REQUIRED` | Medical or allergy-risk intent is present. | Escalate. |
| `P009_PAYMENT_SETTLEMENT_FORBIDDEN` | The agent attempted to charge, settle, or mark payment paid. | Block write. |
| `P010_KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN` | Kitchen side effect was attempted without committed source state. | Block side effect. |
| `P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA` | Preference overwrite lacks a before/after delta. | Block until preview is complete. |

Policy IDs must remain stable unless tests, eval expectations, and docs are updated together.

## Hard Safety Examples

These are code-enforced constraints, not only voice-agent behavior guidelines.

- Allergy mutations are forbidden and require escalation.
- Medical-risk or allergy-risk intent requires escalation.
- Payment settlement and card charging are forbidden.
- Payment follow-ups are allowed only as ChangeSet operations.
- Ambiguous dates cannot be written.
- Date-changing ChangeSets require trusted server-generated date-resolution evidence.
- Commits require preview plus server-created confirmation.
- Stale ChangeSets cannot commit.
- Expired ChangeSets cannot be revived.
- Kitchen deltas cannot exist before commit.
- Customization overwrites must show a before/after delta.

## Date Resolution Boundary

Date-changing operations such as `pause_dates` and `resume_dates` require trusted resolver evidence from `resolve_service_dates`.

The model may suggest a date, but it cannot make a guessed date authoritative by omitting `date_resolution` or by supplying resolver-shaped arguments. The server stores successful date-resolution results in hidden tool context, and `create_change_set` may use only resolver evidence that:

- belongs to the confirmed customer,
- is not ambiguous,
- covers every service date in the proposed date operation.

If that evidence is missing, ambiguous, mismatched, or incomplete, the ChangeSet must fail with `P002_AMBIGUOUS_DATE`.

## Internal Side Effects

Kitchen export deltas and payment follow-ups are internal operational effects.

Kitchen export deltas are never model-facing tools. They are derived from committed meal-affecting ChangeSets.

Payment follow-ups are represented as ChangeSet operations, then materialized internally after commit.

This keeps the invariant simple:

```text
If a committed ChangeSet justifies a side effect, the app may create it.
If no committed ChangeSet exists, the side effect must not exist.
```

Side effects use idempotency keys so repeated commit handling does not duplicate operational work.

## Model Guidance vs Code Enforcement

The prompt should guide the agent to:

- ask clarifying questions,
- use tools for operational facts,
- explain previews before confirmation,
- refuse forbidden actions clearly,
- escalate medical, allergy, identity, or operations risk.

But prompt behavior is not the safety boundary.

The safety boundary is the combination of schemas, tool context, policies, ChangeSets, confirmation records, side-effect checks, audit logs, and evals.

## Required Test Coverage

Every hard policy should have focused tests or eval cases for:

- allowed path,
- blocked path,
- audit evidence,
- policy ID evidence,
- final-state correctness,
- idempotency where repeated calls are possible.

Confirmation tests must cover missing, mismatched, stale, pre-preview, non-server, and expired confirmation attempts.

Side-effect tests must prove that kitchen deltas and payment follow-ups are created only when justified by committed ChangeSets.
