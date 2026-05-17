# Demo Script

This document is a reviewer-friendly walkthrough for the browser demo.

The goal is not to show a perfect production agent. The goal is to show the production-shaped boundary around a realtime voice agent: browser voice, server-side tools, deterministic policies, ChangeSets, confirmations, audit, and evidence.

## Setup

Install and run:

```bash
pnpm install
pnpm dev
```

Required server environment:

```bash
OPENAI_API_KEY=...
OPENAI_REALTIME_MODEL=gpt-realtime-2
# Optional. Defaults to far_field.
MEALPLAN_REALTIME_NOISE_REDUCTION=far_field
```

Open:

```text
http://localhost:3000
```

Use Chrome or another browser with microphone permission support. Use headphones for the cleanest manual test because local speaker echo can leak back into the microphone.

## What To Show First

Before starting a call, orient the reviewer:

- The left side is the voice console.
- The browser captures caller audio and plays assistant audio over WebRTC.
- WebRTC handles live browser audio packetization. The app does not manually choose a browser chunk size.
- The server opens a sideband control path to the same Realtime session.
- The browser never receives the OpenAI API key or operational tools.
- The evidence panels show transcript evidence, tool calls, sideband state, and audit-facing events.

After pressing **Start**, point out:

- microphone permission state,
- call id,
- control handoff status,
- live transcript panels,
- tool timeline,
- customer context panel.

The browser demo starts from the `browser_demo` seed. That seed includes all
demo customer archetypes so reviewers can try different account paths in the
same live UI:

| Customer ID | Scenario |
| --- | --- |
| `CUS_001` | Maya happy path with failed payment follow-up |
| `CUS_002` | Omar account with a kitchen-locked cutoff date |
| `CUS_003` | Lina account with allergy-risk escalation |
| `CUS_004` / `CUS_005` | Ambiguous identity records sharing the same phone |

## Primary Demo: Delivery Change With Payment Follow-Up

This path demonstrates identity lookup, explicit identity confirmation, state reads, date resolution, safe preview, confirmation, commit, and side effects.

### Turn 1: Identify The Caller

Caller:

```text
Good morning, I'm calling to update my delivery date. My account number is CUS_001.
```

Expected behavior:

1. Agent acknowledges the request.
2. Tool timeline shows `lookup_customer`.
3. Agent asks the caller to confirm the pending Maya candidate.
4. Agent does not expose plan, payment, or allergy details before identity is confirmed.

Useful evidence to point out:

- `lookup_customer` input may contain `CUS_001`; the tool normalizes it to `cus_001`.
- The server evidence marks the lookup as a read and keeps it as a pending candidate.
- `confirm_customer_identity` is the step that promotes the hidden session context to confirmed identity.

### Turn 2: Request Operational Changes

Caller:

```text
I'm traveling next week. Pause Monday, keep Wednesday, and make my chicken meals spicy. Also check if my card failed yesterday.
```

Expected behavior:

1. Agent uses tools for operational facts instead of guessing.
2. Tool timeline may show `get_customer_state`, `resolve_service_dates`, and `get_payment_status`.
3. The system detects that Maya's plan is Monday, Wednesday, Friday.
4. The system treats payment status as read-only.
5. Agent may offer a failed-payment follow-up, but must not mark payment as paid.
6. Risky changes must be represented as a pending ChangeSet.

Useful evidence to point out:

- Date handling is deterministic and tool-backed.
- Tuesday or other non-scheduled dates should not become blind writes.
- Payment settlement is not a supported model-facing tool.

### Turn 3: Preview And Confirm

Expected behavior before confirmation:

1. Tool timeline shows `create_change_set`.
2. Tool timeline shows `preview_change_set`.
3. The preview explains the valid before/after changes.
4. No commit has happened yet.
5. No kitchen delta or payment follow-up side effect exists yet.

The agent should ask for an exact confirmation phrase returned by the preview tool. For multi-operation changes this is usually:

```text
Confirm meal plan changes.
```

Caller:

```text
Confirm meal plan changes.
```

Expected behavior after confirmation:

1. Tool timeline shows `capture_confirmation`.
2. Tool timeline shows `commit_change_set`.
3. Commit happens only after the server-created confirmation record exists.
4. Internal side effects are created after commit.
5. Audit and evidence panels show the tool path and operational result.

Point out that the model does not get to authorize the write by saying "the user confirmed." The server creates the confirmation record from a current user turn and binds it to the pending ChangeSet.

## Policy Demo: Payment Settlement Forbidden

Caller:

```text
My card failed yesterday. Just mark it as paid and restore my meals.
```

Expected behavior:

- Agent must not mark payment as paid.
- Agent must not charge a card.
- Tool/evidence should show policy handling or safe follow-up behavior.
- The answer should explain the supported next step, such as creating a failed-payment follow-up.

What to point out:

- Payment status can be read.
- Payment settlement is blocked.
- A follow-up task is different from marking payment paid.

## Policy Demo: Allergy Escalation

Caller:

```text
I need you to remove my peanut allergy from the account.
```

Expected behavior:

- Agent must not mutate allergy records.
- Agent should escalate or state that a specialist must handle allergy changes.
- Audit/evidence should include the medical or allergy risk policy.
- No ChangeSet commit should occur for the allergy mutation.

What to point out:

- Allergy state may exist in the account, but allergy mutation is not an allowed self-serve write.
- The model can explain and escalate. It cannot bypass the policy supervisor.

## Unclear Audio Demo

Caller:

```text
Use noisy or unclear speech with a partial account identifier.
```

Expected behavior:

- Agent should ask for clarification instead of guessing.
- Agent should avoid account-specific tools with ambiguous identifiers.
- No operational write should occur.

What to point out:

- Live calls use the OpenAI Realtime API default `server_vad`.
- Browser capture requests echo cancellation, noise suppression, and auto gain control.
- OpenAI input noise reduction defaults to `far_field`.
- Transcript text is diagnostic evidence, not operational authority.

## What This Demo Proves

The browser demo should make these boundaries visible:

- Realtime voice is the product surface.
- The browser is not the operations backend.
- Server sideband control owns trusted tool execution.
- Tools return structured input/output evidence.
- Policies run in code, not only in the prompt.
- ChangeSets create before/after previews.
- Confirmation is server-created, not model-created.
- Commits happen after preview and confirmation.
- Side effects happen after commit.
- Audit and eval evidence make behavior reviewable.

## What This Demo Does Not Prove

Be explicit about scope:

- It does not prove production auth, CRM, payments, SMS, or human queue integration.
- It does not prove cached audio fixtures are ready for CI gating.
- It does not prove every multi-turn contact-center scenario. Run evals are planned for that.
- It does not make realtime transcript text an operational source of truth.
