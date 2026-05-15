# Guardrails

The central invariant is:

```text
The model may request tools. It cannot directly mutate operational state.
```

Every risky write must pass through a ChangeSet lifecycle with policy validation, preview, explicit server-created confirmation, commit-time revalidation, and audit logging.

## ChangeSet Lifecycle

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

## Confirmation Boundary

Confirmation is server-created.

The model cannot pass raw text such as:

```json
{ "confirmed": true }
```

Instead, the server creates a confirmation record only after a user turn explicitly confirms the pending ChangeSet. A commit requires a `confirmation_id` that matches:

- the same customer,
- the same ChangeSet,
- the same preview timestamp,
- a confirmation time after the preview,
- the active run/session context.

This prevents model-generated approval from becoming write authority.

## Stable Policy IDs

Policy IDs are stable so tests, evals, audit logs, and UI evidence can inspect the exact reason an action was blocked or escalated.

```text
P001_IDENTITY_UNCERTAIN
P002_AMBIGUOUS_DATE
P003_MISSING_PREVIEW
P004_MISSING_CONFIRMATION
P005_STALE_STATE_VERSION
P006_EXPIRED_CHANGESET
P007_ALLERGY_MUTATION_FORBIDDEN
P008_MEDICAL_RISK_ESCALATION_REQUIRED
P009_PAYMENT_SETTLEMENT_FORBIDDEN
P010_KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN
P011_CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA
```

## Hard Safety Examples

- Allergy mutations are forbidden and require escalation.
- Medical-risk or allergy-risk intent requires escalation.
- Payment settlement and card charging are forbidden.
- Ambiguous dates cannot be written.
- Kitchen deltas cannot exist before commit.
- Stale ChangeSets cannot commit.
- Expired ChangeSets cannot be revived.
- Customization overwrites must show a before/after delta.
- Payment follow-ups are ChangeSet operations, not hidden side effects.

## Internal Side Effects

Kitchen export deltas are internal side effects derived from a committed ChangeSet. They are not model-facing tools.

This keeps the invariant simple:

```text
If a committed ChangeSet affects meals, the app creates the kitchen delta.
If no committed ChangeSet exists, no kitchen delta can exist.
```

Side effects use idempotency keys so repeated commit handling does not duplicate operational work.
