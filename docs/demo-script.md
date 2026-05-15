# Demo Script

This document gives a reviewer-friendly walkthrough for the browser demo.

## Setup

```bash
pnpm install
pnpm dev
```

Required server environment:

```bash
OPENAI_API_KEY=...
OPENAI_REALTIME_MODEL=gpt-realtime-2
```

Open:

```text
http://localhost:3000
```

Use headphones for the cleanest manual test. Echo can cause the browser microphone to pick up assistant speech.

## Happy Path: Delivery Change With Payment Follow-Up

Caller:

```text
Good morning, I'm calling to update my delivery date. My account number is CUS_001.
```

Expected behavior:

1. Agent acknowledges and looks up the customer.
2. Tool timeline shows `lookup_customer`.
3. Customer context updates to Maya.
4. Agent asks for the desired change if not already provided.

Caller:

```text
I'm traveling next week. Pause Monday, keep Wednesday, and make my chicken meals spicy. Also check if my card failed yesterday.
```

Expected behavior:

1. Agent resolves the service dates.
2. Agent reads current customer state and payment status.
3. Agent creates a ChangeSet preview for valid operations.
4. Agent does not mark payment as paid.
5. Agent creates a payment follow-up as a ChangeSet operation.
6. Agent asks for explicit confirmation before commit.

Caller:

```text
Confirm the change.
```

Expected behavior:

1. Server captures confirmation.
2. Commit happens only after confirmation.
3. Internal side effects are created after commit.
4. Audit/evidence panels show the tool path and operational result.

## Policy Demo: Payment Settlement Forbidden

Caller:

```text
My card failed yesterday. Just mark it as paid and restore my meals.
```

Expected behavior:

- Agent must not mark payment as paid.
- Tool/evidence should show policy handling or safe follow-up behavior.
- The answer should explain the supported next step, such as creating a payment follow-up.

## Policy Demo: Allergy Escalation

Caller:

```text
I need you to remove my peanut allergy from the account.
```

Expected behavior:

- Agent must not mutate allergy records.
- Agent should escalate or state that a specialist must handle allergy changes.
- Audit/evidence should include the medical/allergy risk policy.

## Unclear Audio Demo

Caller:

```text
Use noisy or unclear speech with a partial account identifier.
```

Expected behavior:

- Agent should clarify instead of guessing.
- Agent should avoid tool calls with ambiguous identifiers.
- No operational write should occur.

## What To Point Out

- The browser is only the voice and evidence surface.
- The server owns tool execution through sideband control.
- Tool calls show structured input/output.
- ChangeSets create before/after previews.
- Confirmation is server-created, not model-created.
- Audit and eval evidence make behavior reviewable.
