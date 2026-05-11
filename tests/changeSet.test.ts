import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureServerConfirmation,
  commitChangeSet,
  createChangeSet,
  previewChangeSet
} from "../src/domain/changeSet";
import * as db from "../src/domain/db";
import { resolveServiceDates } from "../src/domain/dateResolver";
import {
  PolicyId,
  type ChangeOperation,
  type ChangeSet,
  type Confirmation,
  type PolicyIdValue,
  type ToolResult
} from "../src/domain/schema";

const CREATED_AT = "2026-05-11T10:00:00Z";
const PREVIEWED_AT = "2026-05-11T10:01:00Z";
const CONFIRMED_AT = "2026-05-11T10:02:00Z";
const COMMITTED_AT = "2026-05-11T10:03:00Z";
const RUN_ID = "run_change_set";
const CUSTOMER_ID = "cus_001";

beforeEach(() => {
  db.resetDb();
});

function expectData<T>(result: ToolResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function createPreviewed(
  change_set_id: string,
  operations: ChangeOperation[],
  extra: Partial<Parameters<typeof createChangeSet>[0]> = {}
): ChangeSet {
  const changeSet = expectData(
    createChangeSet({
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id,
      operations,
      now: CREATED_AT,
      ...extra
    })
  );

  expect(previewChangeSet({ change_set_id, now: PREVIEWED_AT }).ok).toBe(true);
  return db.getChangeSet(changeSet.change_set_id) as ChangeSet;
}

function capture(change_set_id: string, confirmation_id = `conf_${change_set_id}`) {
  return expectData(
    captureServerConfirmation({
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id,
      confirmation_id,
      source_user_turn_id: `turn_${change_set_id}`,
      transcript_excerpt: "Yes, confirm those changes.",
      confirmation_source: "debug_user_turn",
      confirmation_type: "explicit_yes",
      now: CONFIRMED_AT
    })
  );
}

function policyPassed(changeSet: ChangeSet, policyId: PolicyIdValue): boolean | undefined {
  return changeSet.policy_results.find((result) => result.policy_id === policyId)?.passed;
}

function pauseMonday(): ChangeOperation {
  return { type: "pause_dates", dates: ["2026-05-18"], reason: "travel" };
}

describe("ChangeSet lifecycle", () => {
  it("previews without mutating operational state", () => {
    const before = db.getCustomerState(CUSTOMER_ID);
    if (!before) throw new Error("Expected seeded customer state.");

    const changeSet = expectData(
      createChangeSet({
        run_id: RUN_ID,
        customer_id: CUSTOMER_ID,
        change_set_id: "cs_preview_only",
        operations: [
          pauseMonday(),
          { type: "update_customization", field: "spice_level", next_value: "spicy" }
        ],
        now: CREATED_AT
      })
    );
    const preview = expectData(
      previewChangeSet({ change_set_id: changeSet.change_set_id, now: PREVIEWED_AT })
    );
    const after = db.getCustomerState(CUSTOMER_ID);

    expect(preview.customization_deltas[0]).toMatchObject({
      field: "spice_level",
      before: "normal",
      after: "spicy"
    });
    expect(after).toEqual(before);
    expect(db.getChangeSet("cs_preview_only")?.status).toBe("previewed");
  });

  it("blocks missing, mismatched, non-server, and pre-preview confirmations", () => {
    createPreviewed("cs_missing", [pauseMonday()]);
    expect(commitChangeSet({ change_set_id: "cs_missing", confirmation_id: "conf_missing", now: COMMITTED_AT }))
      .toMatchObject({ ok: false, error: { policy_id: PolicyId.MISSING_CONFIRMATION } });

    const runMismatch = createPreviewed("cs_run_mismatch", [pauseMonday()]);
    db.saveConfirmation({
      confirmation_id: "conf_wrong_run",
      run_id: "run_other",
      customer_id: CUSTOMER_ID,
      change_set_id: runMismatch.change_set_id,
      source_user_turn_id: "turn_wrong_run",
      captured_by: "server",
      confirmed_by: "user",
      previewed_at: PREVIEWED_AT,
      confirmed_at: CONFIRMED_AT,
      transcript_excerpt: "Yes.",
      confirmation_source: "debug_user_turn",
      confirmation_type: "explicit_yes"
    });
    db.saveChangeSet({ ...runMismatch, status: "confirmed", confirmation_id: "conf_wrong_run" });
    expect(commitChangeSet({ change_set_id: "cs_run_mismatch", confirmation_id: "conf_wrong_run", now: COMMITTED_AT }).ok)
      .toBe(false);

    const prePreview = createPreviewed("cs_pre_preview", [pauseMonday()]);
    db.saveConfirmation({
      confirmation_id: "conf_pre_preview",
      run_id: RUN_ID,
      customer_id: CUSTOMER_ID,
      change_set_id: prePreview.change_set_id,
      source_user_turn_id: "turn_pre_preview",
      captured_by: "server",
      confirmed_by: "user",
      previewed_at: "2026-05-11T09:00:00Z",
      confirmed_at: "2026-05-11T09:01:00Z",
      transcript_excerpt: "Yes.",
      confirmation_source: "debug_user_turn",
      confirmation_type: "explicit_yes"
    });
    db.saveChangeSet({ ...prePreview, status: "confirmed", confirmation_id: "conf_pre_preview" });
    expect(commitChangeSet({ change_set_id: "cs_pre_preview", confirmation_id: "conf_pre_preview", now: COMMITTED_AT }).ok)
      .toBe(false);

    createPreviewed("cs_non_server", [pauseMonday()]);
    const serverConfirmation = capture("cs_non_server", "conf_non_server");
    const spy = vi.spyOn(db, "getConfirmation").mockReturnValue({
      ...serverConfirmation,
      captured_by: "model"
    } as unknown as Confirmation);
    expect(commitChangeSet({ change_set_id: "cs_non_server", confirmation_id: "conf_non_server", now: COMMITTED_AT }).ok)
      .toBe(false);
    spy.mockRestore();
  });

  it("blocks stale state versions and expired ChangeSets", () => {
    createPreviewed("cs_stale", [pauseMonday()]);
    capture("cs_stale");
    const state = db.getCustomerState(CUSTOMER_ID);
    if (!state) throw new Error("Expected seeded customer state.");
    db.updateCustomerState(CUSTOMER_ID, {
      ...state,
      customer: { ...state.customer, state_version: state.customer.state_version + 1 }
    });

    const stale = commitChangeSet({
      change_set_id: "cs_stale",
      confirmation_id: "conf_cs_stale",
      now: COMMITTED_AT
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.STALE_STATE_VERSION }
    });

    createPreviewed("cs_expired", [pauseMonday()], {
      expires_at: "2026-05-11T10:01:30Z"
    });
    capture("cs_expired");
    const expired = commitChangeSet({
      change_set_id: "cs_expired",
      confirmation_id: "conf_cs_expired",
      now: COMMITTED_AT
    });

    expect(expired).toMatchObject({
      ok: false,
      error: { policy_id: PolicyId.EXPIRED_CHANGESET }
    });
    expect(db.getChangeSet("cs_expired")?.status).toBe("expired");
  });

  it("blocks ambiguous date resolution at commit time", () => {
    const ambiguousResolution = resolveServiceDates({
      customer_id: CUSTOMER_ID,
      phrase: "sometime next week"
    });
    createPreviewed("cs_ambiguous", [pauseMonday()], {
      date_resolution: ambiguousResolution
    });
    capture("cs_ambiguous");

    expect(
      commitChangeSet({
        change_set_id: "cs_ambiguous",
        confirmation_id: "conf_cs_ambiguous",
        now: COMMITTED_AT
      })
    ).toMatchObject({ ok: false, error: { policy_id: PolicyId.AMBIGUOUS_DATE } });
  });

  it("previews customization overwrite deltas and only passes P011 with that delta", () => {
    const created = expectData(
      createChangeSet({
        run_id: RUN_ID,
        customer_id: CUSTOMER_ID,
        change_set_id: "cs_spice",
        operations: [
          { type: "update_customization", field: "spice_level", next_value: "extra_spicy" }
        ],
        now: CREATED_AT
      })
    );
    const preview = expectData(previewChangeSet({ change_set_id: "cs_spice", now: PREVIEWED_AT }));
    const previewed = db.getChangeSet("cs_spice") as ChangeSet;

    expect(policyPassed(created, PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA))
      .toBe(false);
    expect(preview.customization_deltas).toEqual([
      {
        operation_index: 0,
        field: "spice_level",
        before: "normal",
        after: "extra_spicy"
      }
    ]);
    expect(policyPassed(previewed, PolicyId.CUSTOMIZATION_OVERWRITE_REQUIRES_DELTA))
      .toBe(true);
  });

  it("commits payment follow-up once and keeps repeated commits idempotent", () => {
    createPreviewed("cs_payment", [
      pauseMonday(),
      { type: "create_payment_followup", reason: "failed_payment" }
    ]);
    capture("cs_payment");

    const committed = expectData(
      commitChangeSet({
        change_set_id: "cs_payment",
        confirmation_id: "conf_cs_payment",
        now: COMMITTED_AT
      })
    );
    const repeated = expectData(
      commitChangeSet({
        change_set_id: "cs_payment",
        confirmation_id: "conf_cs_payment",
        now: "2026-05-11T10:04:00Z"
      })
    );

    expect(committed.status).toBe("committed");
    expect(repeated).toEqual(committed);
    expect(db.getCustomer(CUSTOMER_ID)?.state_version).toBe(13);
    expect(db.getCustomerState(CUSTOMER_ID)?.service_dates[0]?.status).toBe("paused");
    expect(db.listPaymentFollowups(CUSTOMER_ID)).toHaveLength(1);
    expect(db.getAuditEventsByChangeSetId("cs_payment").filter((event) =>
      event.event_type === "write_committed"
    )).toHaveLength(1);
  });
});
