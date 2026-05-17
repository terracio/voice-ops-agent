import { beforeEach, describe, expect, it } from "vitest";
import {
  captureServerConfirmation,
  commitChangeSet,
  createChangeSet,
  previewChangeSet
} from "../src/domain/changeSet";
import * as db from "../src/domain/db";
import {
  isMealAffectingOperation,
  materializeCommittedKitchenDeltas,
  materializeCommittedPaymentFollowups
} from "../src/domain/sideEffects";
import {
  PolicyId,
  type ChangeOperation,
  type ChangeSet,
  type ToolResult
} from "../src/domain/schema";
import { resolveServiceDates } from "../src/domain/dateResolver";

const CREATED_AT = "2026-05-11T10:00:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";
const COMMITTED_AT = "2026-05-11T10:03:00Z";
const RUN_ID = "run_side_effects";
const CUSTOMER_ID = "cus_001";

beforeEach(() => db.resetDb());

function expectData<T>(result: ToolResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function baseChangeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    change_set_id: "cs_side_effect",
    customer_id: CUSTOMER_ID,
    status: "committed",
    operations: [{ type: "pause_dates", dates: ["2026-05-18"], reason: "travel" }],
    expected_state_version: 12,
    created_at: CREATED_AT,
    previewed_at: PREVIEWED_AT,
    confirmed_at: CONFIRMED_AT,
    committed_at: COMMITTED_AT,
    expires_at: "2026-05-11T10:15:00Z",
    confirmation_id: "conf_side_effect",
    policy_results: [],
    ...overrides
  };
}

function capture(change_set_id: string) {
  return captureServerConfirmation({
    run_id: RUN_ID,
    customer_id: CUSTOMER_ID,
    change_set_id,
    confirmation_id: `conf_${change_set_id}`,
    source_user_turn_id: `turn_${change_set_id}`,
    transcript_excerpt: "Yes, confirm those changes.",
    confirmation_source: "debug_user_turn",
    confirmation_type: "explicit_yes",
    now: CONFIRMED_AT
  });
}

describe("internal side-effect services", () => {
  it("creates eligible payment follow-ups from committed ChangeSets once", () => {
    const changeSet = db.saveChangeSet(baseChangeSet({
      change_set_id: "cs_payment_side_effect",
      operations: [{ type: "create_payment_followup", reason: "past_due" }]
    }));

    const first = materializeCommittedPaymentFollowups({
      changeSet,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });
    const second = materializeCommittedPaymentFollowups({
      changeSet,
      run_id: RUN_ID,
      now: "2026-05-11T10:04:00Z"
    });

    expect(first.created_side_effect_ids).toEqual(["pf_cs_payment_side_effect_0"]);
    expect(second).toMatchObject({ audit_event_ids: [], created_side_effect_ids: [] });
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toEqual([
      expect.objectContaining({
        followup_id: "pf_cs_payment_side_effect_0",
        idempotency_key: "cs_payment_side_effect:create_payment_followup:0",
        reason: "past_due",
        status: "open",
        source_change_set_id: "cs_payment_side_effect"
      })
    ]);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toHaveLength(0);
    expect(db.getAuditEventsByChangeSetId("cs_payment_side_effect").filter((event) =>
      event.event_type === "side_effect_created"
    )).toHaveLength(1);
  });

  it("blocks payment follow-up materialization before commit", () => {
    const beforePaymentStatus = db.getCustomer(CUSTOMER_ID)?.payment_status;
    const changeSet = baseChangeSet({
      change_set_id: "cs_payment_previewed",
      status: "previewed",
      committed_at: undefined,
      operations: [{ type: "create_payment_followup", reason: "failed_payment" }]
    });

    const result = materializeCommittedPaymentFollowups({
      changeSet,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });
    const blockedAudit = db.getAuditEventsByChangeSetId("cs_payment_previewed")
      .find((event) => event.event_type === "write_blocked");

    expect(result.blocked_attempts).toEqual([
      expect.objectContaining({ side_effect_type: "payment_followup" })
    ]);
    expect(blockedAudit?.details).toMatchObject({
      side_effect_type: "payment_followup",
      idempotency_key: "cs_payment_previewed:create_payment_followup:0"
    });
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(0);
    expect(db.getCustomer(CUSTOMER_ID)?.payment_status).toBe(beforePaymentStatus);
  });

  it("blocks forged committed payment follow-up ChangeSets that were never persisted", () => {
    const forged = baseChangeSet({
      change_set_id: "cs_forged_payment",
      operations: [{ type: "create_payment_followup", reason: "failed_payment" }]
    });

    const result = materializeCommittedPaymentFollowups({
      changeSet: forged,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });

    expect(db.getChangeSet("cs_forged_payment")).toBeUndefined();
    expect(result.blocked_attempts).toEqual([
      expect.objectContaining({ side_effect_type: "payment_followup" })
    ]);
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(0);
  });

  it("blocks caller operations that do not match the persisted ChangeSet", () => {
    const persisted = db.saveChangeSet(baseChangeSet({
      change_set_id: "cs_mismatched_payment",
      operations: [{ type: "create_payment_followup", reason: "failed_payment" }]
    }));
    const forged = {
      ...persisted,
      operations: [{ type: "create_payment_followup" as const, reason: "past_due" as const }]
    };

    const result = materializeCommittedPaymentFollowups({
      changeSet: forged,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });

    expect(result.blocked_attempts).toEqual([
      expect.objectContaining({ side_effect_type: "payment_followup" })
    ]);
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(0);
  });

  it("creates kitchen deltas from committed meal-affecting operations once", () => {
    const changeSet = db.saveChangeSet(baseChangeSet({
      change_set_id: "cs_kitchen_side_effect",
      operations: [
        { type: "pause_dates", dates: ["2026-05-18"], reason: "travel" },
        { type: "update_customization", field: "spice_level", next_value: "spicy" }
      ]
    }));

    const first = materializeCommittedKitchenDeltas({
      changeSet,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });
    const second = materializeCommittedKitchenDeltas({
      changeSet,
      run_id: RUN_ID,
      now: "2026-05-11T10:04:00Z"
    });
    const deltas = db.listKitchenExportDeltas(CUSTOMER_ID);

    expect(first.created_side_effect_ids).toEqual([
      "kd_cs_kitchen_side_effect_kitchen_delta"
    ]);
    expect(second.created_side_effect_ids).toEqual([]);
    expect(deltas).toEqual([
      expect.objectContaining({
        idempotency_key: "cs_kitchen_side_effect:kitchen_delta:0:pause_dates:2026-05-18+1:update_customization:spice_level",
        affected_dates: ["2026-05-18", "2026-05-20", "2026-05-22"]
      })
    ]);
    expect(db.getAuditEventsByChangeSetId("cs_kitchen_side_effect").filter((event) =>
      event.event_type === "side_effect_created"
    )).toHaveLength(1);
  });

  it("blocks kitchen deltas before commit and ignores payment-only ChangeSets", () => {
    const paymentOnly = db.saveChangeSet(baseChangeSet({
      change_set_id: "cs_payment_only",
      operations: [{ type: "create_payment_followup", reason: "unknown_status" }]
    }));
    const previewedMealChange = baseChangeSet({
      change_set_id: "cs_kitchen_previewed",
      status: "previewed",
      committed_at: undefined
    });

    expect(materializeCommittedKitchenDeltas({
      changeSet: paymentOnly,
      run_id: RUN_ID,
      now: COMMITTED_AT
    })).toMatchObject({ created_side_effect_ids: [], blocked_attempts: [] });

    const blocked = materializeCommittedKitchenDeltas({
      changeSet: previewedMealChange,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });

    expect(blocked.blocked_attempts).toEqual([
      expect.objectContaining({
        side_effect_type: "kitchen_delta",
        policy_ids: [PolicyId.KITCHEN_DELTA_BEFORE_COMMIT_FORBIDDEN]
      })
    ]);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toHaveLength(0);
    expect(isMealAffectingOperation(paymentOnly.operations[0] as ChangeOperation)).toBe(false);
    expect(isMealAffectingOperation(previewedMealChange.operations[0] as ChangeOperation))
      .toBe(true);
  });

  it("blocks forged committed kitchen ChangeSets that were never persisted", () => {
    const forged = baseChangeSet({ change_set_id: "cs_forged_kitchen" });

    const result = materializeCommittedKitchenDeltas({
      changeSet: forged,
      run_id: RUN_ID,
      now: COMMITTED_AT
    });

    expect(db.getChangeSet("cs_forged_kitchen")).toBeUndefined();
    expect(result.blocked_attempts).toEqual([
      expect.objectContaining({ side_effect_type: "kitchen_delta" })
    ]);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toHaveLength(0);
  });
});

describe("ChangeSet commit side-effect integration", () => {
  it("materializes side effects only after committed writes and stays idempotent", () => {
    const beforePaymentStatus = db.getCustomer(CUSTOMER_ID)?.payment_status;
    expectData(createChangeSet({
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id: "cs_commit_side_effects",
      operations: [
        { type: "pause_dates", dates: ["2026-05-18"], reason: "travel" },
        {
          type: "update_customization",
          field: "protein_preferences",
          next_value: ["chicken", "fish"]
        },
        { type: "create_payment_followup", reason: "failed_payment" }
      ],
      date_resolution: resolveServiceDates({
        customer_id: CUSTOMER_ID,
        phrase: "Pause Monday.",
        requested_days: ["Monday"]
      }),
      now: CREATED_AT
    }));
    expectData(previewChangeSet({
      change_set_id: "cs_commit_side_effects",
      now: PREVIEWED_AT
    }));

    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(0);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toHaveLength(0);
    expectData(capture("cs_commit_side_effects"));

    const committed = expectData(commitChangeSet({
      change_set_id: "cs_commit_side_effects",
      confirmation_id: "conf_cs_commit_side_effects",
      now: COMMITTED_AT
    }));
    const repeated = expectData(commitChangeSet({
      change_set_id: "cs_commit_side_effects",
      confirmation_id: "conf_cs_commit_side_effects",
      now: "2026-05-11T10:04:00Z"
    }));

    expect(committed.status).toBe("committed");
    expect(repeated).toEqual(committed);
    expect(db.getCustomer(CUSTOMER_ID)?.payment_status).toBe(beforePaymentStatus);
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(1);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)).toHaveLength(1);
    expect(db.listKitchenExportDeltas(CUSTOMER_ID)[0]).toMatchObject({
      change_set_id: "cs_commit_side_effects",
      affected_dates: ["2026-05-18", "2026-05-20", "2026-05-22"]
    });
    expect(db.getAuditEventsByChangeSetId("cs_commit_side_effects").filter((event) =>
      event.event_type === "side_effect_created"
    )).toHaveLength(2);
  });
});
